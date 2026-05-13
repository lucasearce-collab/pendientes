// api/calendar/process.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function getEvents(accessToken) {
  // Desde ayer 00:00 hasta +48hs desde ahora
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(yesterday.toISOString())}&timeMax=${encodeURIComponent(in48h.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=30`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return (data.items || []).filter(e => e.start?.dateTime);
}

async function processEventWithGroq(event) {
  const title = event.summary || 'Sin título';
  const start = event.start.dateTime;
  const end = event.end?.dateTime;
  const duration = Math.round((new Date(end) - new Date(start)) / 60000);

  if (duration < 20) return [];

  const eventDate = new Date(start);
  const preDate = new Date(eventDate); preDate.setDate(preDate.getDate() - 1);
  const postDate = new Date(eventDate); postDate.setDate(postDate.getDate() + 1);
  const fmt = d => d.toISOString().slice(0, 10);

  const now = new Date();
  const isPast = eventDate < now;
  const momentoLabel = isPast ? 'post (reunión ya ocurrió)' : 'pre (reunión próxima)';

  const prompt = `Sos un asistente de productividad ejecutiva. Analizá esta reunión y sugerí tareas concretas.

Reunión: ${title}
Duración: ${duration} minutos
Fecha: ${fmt(eventDate)}
Estado: ${isPast ? 'Ya ocurrió' : 'Próxima'}

${isPast
  ? `La reunión ya ocurrió. Sugerí tareas de seguimiento: minutas, acuerdos a cumplir, comunicaciones pendientes, próximos pasos concretos.`
  : `La reunión es próxima. Sugerí tareas de preparación: materiales, agenda, revisiones previas.`
}

Devolvé SOLO un JSON válido sin markdown ni texto extra:
{"tareas":[{"titulo":"tarea accionable y específica","fecha":"${isPast ? fmt(postDate) : fmt(preDate)}","momento":"${isPast ? 'post' : 'pre'}","proyecto_sugerido":"nombre del cliente o proyecto"}]}

Reglas:
- Máximo 2 tareas
- Si es reunión personal o social sin contexto laboral: {"tareas":[]}
- El título debe ser específico y accionable, no genérico
- Para reuniones pasadas: empezá el título con un verbo (Enviar, Confirmar, Agendar, Documentar)
- Para reuniones futuras: empezá el título con un verbo (Preparar, Revisar, Armar, Leer)`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '{"tareas":[]}';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean).tareas || [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  const validKey = req.query.key === process.env.NEWSLETTER_SECRET;
  const validUser = !!req.query.user_id; // llamada autenticada desde el frontend (usuario logueado)
  if (!validKey && !validUser) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    // Si viene user_id en query, procesar solo ese usuario (llamada desde frontend)
    const targetUserId = req.query.user_id || null;

    let query = supabase
      .from('user_profiles')
      .select('id, google_calendar_token')
      .eq('calendar_connected', true)
      .not('google_calendar_token', 'is', null);

    if (targetUserId) {
      query = query.eq('id', targetUserId);
    }

    const { data: users, error } = await query;

    if (error) throw error;
    if (!users?.length) return res.json({ message: 'No hay usuarios con calendario conectado', processed: 0 });

    const results = [];

    for (const user of users) {
      try {
        const accessToken = await getAccessToken(user.google_calendar_token);
        if (!accessToken) continue;

        const events = await getEvents(accessToken);

        for (const event of events) {
          const { data: existing } = await supabase
            .from('calendar_suggestions')
            .select('id')
            .eq('user_id', user.id)
            .eq('event_id', event.id)
            .eq('status', 'pending');

          if (existing?.length > 0) continue;

          const tareas = await processEventWithGroq(event);

          for (const tarea of tareas) {
            await supabase.from('calendar_suggestions').insert({
              user_id: user.id,
              event_id: event.id,
              event_title: event.summary,
              task_title: tarea.titulo,
              suggested_date: tarea.fecha,
              suggested_project: tarea.proyecto_sugerido,
              momento: tarea.momento,
              status: 'pending',
            });
          }

          if (tareas.length > 0) results.push({ event: event.summary, tareas: tareas.length });
        }
      } catch (e) {
        console.error('Error usuario:', user.id, e.message);
      }
    }

    return res.json({ processed: users.length, suggestions: results });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

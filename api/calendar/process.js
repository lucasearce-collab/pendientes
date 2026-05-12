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
  const now = new Date().toISOString();
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(in48h)}&singleEvents=true&orderBy=startTime&maxResults=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return (data.items || []).filter(e => e.start?.dateTime); // solo eventos con hora, no días completos
}

async function processEventWithGemini(event) {
  const title = event.summary || 'Sin título';
  const start = event.start.dateTime;
  const end = event.end?.dateTime;
  const duration = Math.round((new Date(end) - new Date(start)) / 60000);

  if (duration < 20) return [];

  // Calcular fecha pre (día anterior) y post (día siguiente)
  const eventDate = new Date(start);
  const preDate = new Date(eventDate); preDate.setDate(preDate.getDate() - 1);
  const postDate = new Date(eventDate); postDate.setDate(postDate.getDate() + 1);
  const fmt = d => d.toISOString().slice(0, 10);

  const prompt = `Sos un asistente de productividad ejecutiva. Analizá esta reunión y sugerí tareas concretas.

Reunión: ${title}
Duración: ${duration} minutos
Fecha: ${fmt(eventDate)}

Devolvé SOLO un JSON válido sin markdown ni texto extra:
{"tareas":[{"titulo":"tarea accionable y específica","fecha":"${fmt(preDate)} o ${fmt(postDate)}","momento":"pre o post","proyecto_sugerido":"nombre del cliente o proyecto"}]}

Reglas:
- Máximo 2 tareas (una pre y una post si aplica)
- Si es reunión personal/social sin contexto laboral claro: {"tareas":[]}
- El título debe ser específico: no "Preparar reunión" sino "Preparar agenda y KPIs para ${title}"`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
      }),
    }
  );
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"tareas":[]}';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean).tareas || [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.query.key !== process.env.NEWSLETTER_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('id, google_calendar_token')
      .eq('is_premium', true)
      .eq('calendar_connected', true)
      .not('google_calendar_token', 'is', null);

    if (error) throw error;
    if (!users?.length) return res.json({ message: 'No hay usuarios con calendario conectado', processed: 0 });

    const results = [];

    for (const user of users) {
      try {
        const accessToken = await getAccessToken(user.google_calendar_token);
        if (!accessToken) continue;

        const events = await getEvents(accessToken);

        for (const event of events) {
          // Evitar duplicados
          const { data: existing } = await supabase
            .from('calendar_suggestions')
            .select('id')
            .eq('user_id', user.id)
            .eq('event_id', event.id)
            .eq('status', 'pending');

          if (existing?.length > 0) continue;

          const tareas = await processEventWithGemini(event);

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

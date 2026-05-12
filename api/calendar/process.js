// api/calendar/process.js
// Lee los eventos de Google Calendar y genera sugerencias de tareas con Gemini.
// Activar desde el browser: /api/calendar/process?key=clarity2024secret

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Obtener un access_token nuevo usando el refresh_token guardado
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

// Leer eventos de las próximas 48 horas
async function getEvents(accessToken) {
  const now = new Date().toISOString();
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${encodeURIComponent(now)}` +
    `&timeMax=${encodeURIComponent(in48h)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data.items || [];
}

// Procesar un evento con Gemini para generar tareas sugeridas
async function processEventWithGemini(event) {
  const title = event.summary || 'Sin título';
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  const duration = start && end
    ? Math.round((new Date(end) - new Date(start)) / 60000)
    : 0;

  // Solo eventos de más de 20 minutos
  if (duration < 20) return [];

  const attendees = (event.attendees || []).map(a => a.email).join(', ') || 'solo vos';

  const prompt = `Sos un asistente de productividad. Analizá este evento de calendario y sugerí tareas relevantes.

Evento: ${title}
Duración: ${duration} minutos
Participantes: ${attendees}
Fecha: ${start}

Devolvé SOLO un JSON válido con este formato (sin markdown, sin texto extra):
{
  "tareas": [
    {
      "titulo": "título accionable de la tarea",
      "fecha": "YYYY-MM-DD",
      "momento": "pre o post",
      "proyecto_sugerido": "nombre del proyecto o cliente"
    }
  ]
}

Reglas:
- Máximo 2 tareas por evento (una pre y una post si aplica)
- Solo sugerí tareas si el evento parece laboral o de negocios
- Si es una reunión personal o social, devolvé: {"tareas": []}
- El título debe ser específico y accionable`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
      }),
    }
  );

  const geminiData = await geminiRes.json();
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{"tareas":[]}';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return parsed.tareas || [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  // Seguridad básica
  if (req.query.key !== process.env.NEWSLETTER_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    // Traer usuarios premium con calendar conectado
    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('id, google_calendar_token')
      .eq('is_premium', true)
      .eq('calendar_connected', true)
      .not('google_calendar_token', 'is', null);

    if (error) throw error;
    if (!users || users.length === 0) {
      return res.status(200).json({ message: 'No hay usuarios con calendario conectado', processed: 0 });
    }

    const results = [];

    for (const user of users) {
      try {
        // Obtener access token
        const accessToken = await getAccessToken(user.google_calendar_token);
        if (!accessToken) continue;

        // Obtener eventos
        const events = await getEvents(accessToken);

        // Procesar cada evento
        for (const event of events) {
          // Evitar duplicados — verificar si ya existe sugerencia para este evento
          const { data: existing } = await supabase
            .from('calendar_suggestions')
            .select('id')
            .eq('user_id', user.id)
            .eq('event_id', event.id)
            .eq('status', 'pending');

          if (existing && existing.length > 0) continue;

          // Generar sugerencias con Gemini
          const tareas = await processEventWithGemini(event);

          // Guardar sugerencias en Supabase
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

          if (tareas.length > 0) {
            results.push({ user: user.id, event: event.summary, tareas: tareas.length });
          }
        }
      } catch (userError) {
        console.error(`Error procesando usuario ${user.id}:`, userError);
      }
    }

    return res.status(200).json({ processed: users.length, suggestions: results });

  } catch (e) {
    console.error('Process error:', e);
    return res.status(500).json({ error: e.message });
  }
}

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
  console.log('Access token response:', { has_token: !!data.access_token, error: data.error });
  return data.access_token;
}

async function getEvents(accessToken) {
  const now = new Date().toISOString();
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(in48h)}&singleEvents=true&orderBy=startTime&maxResults=20`;
  
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  console.log('Calendar API response:', { 
    status: res.status, 
    events: data.items?.length || 0,
    error: data.error?.message,
    items: data.items?.map(e => ({ title: e.summary, start: e.start?.dateTime }))
  });
  return data.items || [];
}

async function processEventWithGemini(event) {
  const title = event.summary || 'Sin título';
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  const duration = start && end ? Math.round((new Date(end) - new Date(start)) / 60000) : 0;

  console.log(`Procesando evento: "${title}" duración: ${duration} min`);
  if (duration < 20) {
    console.log('Evento muy corto, saltando');
    return [];
  }

  const prompt = `Sos un asistente de productividad. Analizá este evento y sugerí tareas relevantes.
Evento: ${title}
Duración: ${duration} minutos
Fecha: ${start}

Devolvé SOLO un JSON válido sin markdown:
{"tareas":[{"titulo":"tarea accionable","fecha":"YYYY-MM-DD","momento":"pre o post","proyecto_sugerido":"nombre"}]}

Si es personal o social devolvé: {"tareas":[]}
Máximo 2 tareas.`;

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
  console.log('Gemini response:', text);

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return parsed.tareas || [];
  } catch(e) {
    console.error('Error parseando Gemini:', e.message, 'texto:', text);
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
    console.log('Usuarios con calendario:', users?.length || 0);

    if (!users || users.length === 0) {
      return res.status(200).json({ message: 'No hay usuarios con calendario conectado', processed: 0 });
    }

    const results = [];

    for (const user of users) {
      try {
        const accessToken = await getAccessToken(user.google_calendar_token);
        if (!accessToken) {
          console.log('No se pudo obtener access token para:', user.id);
          continue;
        }

        const events = await getEvents(accessToken);

        for (const event of events) {
          const { data: existing } = await supabase
            .from('calendar_suggestions')
            .select('id')
            .eq('user_id', user.id)
            .eq('event_id', event.id)
            .eq('status', 'pending');

          if (existing && existing.length > 0) {
            console.log('Ya existe sugerencia para evento:', event.summary);
            continue;
          }

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

          if (tareas.length > 0) {
            results.push({ event: event.summary, tareas: tareas.length });
          }
        }
      } catch (userError) {
        console.error('Error usuario:', user.id, userError.message);
      }
    }

    return res.status(200).json({ processed: users.length, suggestions: results });

  } catch (e) {
    console.error('Process error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

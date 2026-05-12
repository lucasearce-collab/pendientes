// api/calendar/process.js - versión debug
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.query.key !== process.env.NEWSLETTER_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const debug = {};

  try {
    // 1. Traer usuario
    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('id, google_calendar_token')
      .eq('is_premium', true)
      .eq('calendar_connected', true)
      .not('google_calendar_token', 'is', null);

    debug.usuarios = users?.length || 0;
    debug.db_error = error?.message;
    if (error || !users?.length) return res.json({ debug });

    const user = users[0];
    debug.user_id = user.id;
    debug.has_token = !!user.google_calendar_token;

    // 2. Obtener access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: user.google_calendar_token,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    debug.token_error = tokenData.error;
    debug.has_access_token = !!tokenData.access_token;
    if (!tokenData.access_token) return res.json({ debug });

    // 3. Obtener eventos
    const now = new Date().toISOString();
    const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(in48h)}&singleEvents=true&orderBy=startTime&maxResults=10`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const calData = await calRes.json();
    debug.calendar_error = calData.error?.message;
    debug.events_found = calData.items?.length || 0;
    debug.events = calData.items?.map(e => ({
      title: e.summary,
      start: e.start?.dateTime || e.start?.date,
      duration_min: e.start?.dateTime && e.end?.dateTime
        ? Math.round((new Date(e.end.dateTime) - new Date(e.start.dateTime)) / 60000)
        : '?'
    }));

    if (!calData.items?.length) return res.json({ debug });

    // 4. Probar Gemini con el primer evento
    const event = calData.items[0];
    const prompt = `Evento: ${event.summary}. Sugerí una tarea de preparación. Devolvé SOLO JSON: {"tareas":[{"titulo":"...","fecha":"2026-05-12","momento":"pre","proyecto_sugerido":"..."}]}`;
    
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const geminiData = await geminiRes.json();
    debug.gemini_error = geminiData.error?.message;
    debug.gemini_response = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    return res.json({ debug });

  } catch (e) {
    debug.exception = e.message;
    return res.json({ debug });
  }
}

// api/calendar/create-event.js
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
  if (!data.access_token) {
    console.error('[create-event] error obteniendo access token:', data);
    return null;
  }
  return data.access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, title, date, time, duration_minutes, project_name } = req.body;

  if (!user_id || !title || !date || !time) {
    return res.status(400).json({ error: 'Faltan parámetros: user_id, title, date, time' });
  }

  try {
    // Obtener refresh token del usuario
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('google_calendar_token, calendar_connected')
      .eq('id', user_id)
      .single();

    if (error || !profile?.calendar_connected || !profile?.google_calendar_token) {
      return res.status(400).json({ error: 'Calendario no conectado para este usuario' });
    }

    // Obtener access token fresco
    const accessToken = await getAccessToken(profile.google_calendar_token);
    if (!accessToken) {
      return res.status(500).json({ error: 'No se pudo obtener access token de Google' });
    }

    // Construir evento con hora y duración
    const duration = duration_minutes || 30;
    const [h, m] = time.split(':').map(Number);
    const start = new Date(`${date}T00:00:00`);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + duration * 60000);

    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

    const eventBody = {
      summary: title,
      description: project_name ? `Proyecto: ${project_name}` : '',
      start: { dateTime: fmt(start), timeZone: 'America/Argentina/Buenos_Aires' },
      end:   { dateTime: fmt(end),   timeZone: 'America/Argentina/Buenos_Aires' },
      reminders: { useDefault: true },
    };

    const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    });

    const calData = await calRes.json();

    if (!calRes.ok) {
      console.error('[create-event] error Google Calendar:', calData);
      return res.status(500).json({ error: calData.error?.message || 'Error creando evento' });
    }

    console.log('[create-event] evento creado:', calData.id, title);
    return res.status(200).json({ success: true, eventId: calData.id });

  } catch (e) {
    console.error('[create-event] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

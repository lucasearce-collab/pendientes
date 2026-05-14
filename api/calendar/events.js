// api/calendar/events.js
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
  return data.access_token || null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'Falta user_id' });

  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('google_calendar_token, calendar_connected')
      .eq('id', user_id)
      .single();

    if (!profile?.calendar_connected || !profile?.google_calendar_token) {
      return res.status(200).json({ events: [] });
    }

    const accessToken = await getAccessToken(profile.google_calendar_token);
    if (!accessToken) return res.status(200).json({ events: [] });

    // Últimos 2 días + próximos 7 días
    const from = new Date();
    from.setDate(from.getDate() - 2);
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setDate(to.getDate() + 7);
    to.setHours(23, 59, 59, 999);

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(from.toISOString())}` +
      `&timeMax=${encodeURIComponent(to.toISOString())}` +
      `&singleEvents=true&orderBy=startTime&maxResults=30`;

    const calRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const calData = await calRes.json();

    const now = new Date();
    const events = (calData.items || [])
      .filter(e => e.start?.dateTime || e.start?.date)
      .map(e => {
        const dateStr = e.start.dateTime || e.start.date;
        const eventDate = new Date(dateStr);
        return {
          summary: e.summary || 'Sin título',
          date: dateStr.slice(0, 10),
          dateTime: e.start.dateTime || null,
          isPast: eventDate < now,
          attendees: (e.attendees || []).map(a => ({
            email: a.email,
            displayName: a.displayName || null,
            self: a.self || false,
          })),
        };
      });

    return res.status(200).json({ events });
  } catch (e) {
    console.error('[calendar/events] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

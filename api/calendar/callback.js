// api/calendar/callback.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const { code, error, state } = req.query;

  if (error || !code || !state) {
    console.error('Missing params:', { code: !!code, error, state: !!state });
    return res.redirect('https://pendientes-eight.vercel.app/?calendar_error=1');
  }

  const userId = decodeURIComponent(state);
  console.log('Processing callback for user:', userId);

  try {
    // Intercambiar código por tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: 'https://pendientes-eight.vercel.app/api/calendar/callback',
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    console.log('Token response:', { 
      has_access: !!tokens.access_token, 
      has_refresh: !!tokens.refresh_token,
      error: tokens.error,
      error_description: tokens.error_description
    });

    if (!tokens.access_token) {
      return res.redirect('https://pendientes-eight.vercel.app/?calendar_error=2');
    }

    // Guardar token directamente con el userId del state
    const tokenToSave = tokens.refresh_token || tokens.access_token;
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        google_calendar_token: tokenToSave,
        calendar_connected: true,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Update error:', updateError);
      return res.redirect('https://pendientes-eight.vercel.app/?calendar_error=3');
    }

    console.log('Token saved successfully for user:', userId);
    res.redirect('https://pendientes-eight.vercel.app/?calendar_connected=1');

  } catch (e) {
    console.error('Calendar callback error:', e.message);
    res.redirect('https://pendientes-eight.vercel.app/?calendar_error=4');
  }
}

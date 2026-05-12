// api/calendar/callback.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('https://pendientes-eight.vercel.app/?calendar_error=1');
  }

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
    console.log('Tokens:', JSON.stringify({ 
      has_access: !!tokens.access_token, 
      has_refresh: !!tokens.refresh_token,
      error: tokens.error 
    }));

    if (!tokens.access_token) {
      return res.redirect('https://pendientes-eight.vercel.app/?calendar_error=2');
    }

    // Obtener email del usuario de Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userRes.json();
    const email = userInfo.email;

    // Buscar usuario en Supabase
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) throw authError;

    const authUser = authData.users.find(u => u.email === email);
    if (!authUser) {
      return res.redirect('https://pendientes-eight.vercel.app/?calendar_error=3');
    }

    // Guardar token
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        google_calendar_token: tokens.refresh_token || tokens.access_token,
        calendar_connected: true,
      })
      .eq('id', authUser.id);

    if (updateError) throw updateError;

    res.redirect('https://pendientes-eight.vercel.app/?calendar_connected=1');

  } catch (e) {
    console.error('Calendar callback error:', e.message);
    res.redirect('https://pendientes-eight.vercel.app/?calendar_error=4');
  }
}

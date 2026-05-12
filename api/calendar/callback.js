// api/calendar/callback.js
// Google redirige acá después del login. Guarda el refresh_token en Supabase.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect('https://pendientes-eight.vercel.app/?calendar_error=1');
  }

  if (!code) {
    return res.status(400).send('Falta el código de autorización');
  }

  try {
    // Intercambiar el código por tokens
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

    if (!tokens.refresh_token) {
      return res.redirect('https://pendientes-eight.vercel.app/?calendar_error=2');
    }

    // Obtener el email del usuario
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userRes.json();

    // Buscar el user_id en Supabase por email
    const { data: authUser } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', (await supabase.auth.admin.getUserByEmail(userInfo.email)).data?.user?.id)
      .single();

    // Guardar el refresh_token en user_profiles
    await supabase
      .from('user_profiles')
      .update({ 
        google_calendar_token: tokens.refresh_token,
        calendar_connected: true,
      })
      .eq('id', authUser?.id);

    // Redirigir de vuelta a la app con éxito
    res.redirect('https://pendientes-eight.vercel.app/?calendar_connected=1');

  } catch (e) {
    console.error('Calendar callback error:', e);
    res.redirect('https://pendientes-eight.vercel.app/?calendar_error=3');
  }
}

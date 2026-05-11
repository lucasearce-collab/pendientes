import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const EMAIL_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#EAE6E0;font-family:-apple-system,sans-serif;">
<div style="background:#EAE6E0;padding:40px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#F5F2EE;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">
    <div style="padding:40px 40px 32px;">
      <div style="font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#C8C3BB;margin-bottom:28px;">Clarity</div>
      <div style="font-size:28px;font-weight:300;color:#2C2825;letter-spacing:-.02em;line-height:1.2;margin-bottom:12px;">Clarity mejoró.<br>Mucho.</div>
      <div style="font-size:14px;color:#B0AA9F;line-height:1.7;">Estuvimos trabajando para que la app sea más compañera, más inteligente y más simple de usar. Acá está lo que es nuevo.</div>
    </div>
    <div style="height:1px;background:#EAE6E0;margin:0 40px;"></div>
    <div style="padding:32px 40px;">
      <div style="margin-bottom:28px;display:flex;align-items:flex-start;gap:16px;">
        <div style="width:36px;height:36px;border-radius:10px;background:#F0EDE9;text-align:center;line-height:36px;flex-shrink:0;font-size:18px;">◑</div>
        <div><div style="font-size:14px;font-weight:500;color:#2C2825;margin-bottom:4px;">Modo Día Difícil</div><div style="font-size:13px;color:#B0AA9F;line-height:1.6;">Cuando el día pesa, elegís lo que podés hacer hoy. El resto lo reagendamos para mañana, sin culpa.</div></div>
      </div>
      <div style="margin-bottom:28px;display:flex;align-items:flex-start;gap:16px;">
        <div style="width:36px;height:36px;border-radius:10px;background:#F0EDE9;text-align:center;line-height:36px;flex-shrink:0;font-size:18px;">❀</div>
        <div><div style="font-size:14px;font-weight:500;color:#2C2825;margin-bottom:4px;">Nuevos indicadores</div><div style="font-size:13px;color:#B0AA9F;line-height:1.6;">Salud, Rendimiento y Dirección. Sabés cómo estás hoy, si vas en la dirección correcta, y qué hacer cuando algo no cierra.</div></div>
      </div>
      <div style="margin-bottom:28px;display:flex;align-items:flex-start;gap:16px;">
        <div style="width:36px;height:36px;border-radius:10px;background:#F0EDE9;text-align:center;line-height:36px;flex-shrink:0;font-size:18px;">☐</div>
        <div><div style="font-size:14px;font-weight:500;color:#2C2825;margin-bottom:4px;">Tareas sueltas o por proyecto</div><div style="font-size:13px;color:#B0AA9F;line-height:1.6;">Creá tareas sueltas cuando necesitás rapidez, o estructuralas en proyectos cuando querés orden.</div></div>
      </div>
      <div style="margin-bottom:28px;display:flex;align-items:flex-start;gap:16px;">
        <div style="width:36px;height:36px;border-radius:10px;background:#F0EDE9;text-align:center;line-height:36px;flex-shrink:0;font-size:18px;">✦</div>
        <div><div style="font-size:14px;font-weight:500;color:#2C2825;margin-bottom:4px;">Asistente de metas</div><div style="font-size:13px;color:#B0AA9F;line-height:1.6;">Cuando estés listo para pensar en el futuro, te guiamos para definir lo que querés lograr. Sin presión.</div></div>
      </div>
      <div style="display:flex;align-items:flex-start;gap:16px;">
        <div style="width:36px;height:36px;border-radius:10px;background:#F0EDE9;text-align:center;line-height:36px;flex-shrink:0;font-size:18px;">↻</div>
        <div><div style="font-size:14px;font-weight:500;color:#2C2825;margin-bottom:4px;">Tareas recurrentes</div><div style="font-size:13px;color:#B0AA9F;line-height:1.6;">Reunión semanal, hábito diario — cargala una vez y la app la recuerda.</div></div>
      </div>
    </div>
    <div style="padding:0 40px 40px;">
      <div style="height:1px;background:#EAE6E0;margin-bottom:28px;"></div>
      <a href="https://pendientes-eight.vercel.app" style="display:block;background:#2C2825;color:white;text-decoration:none;text-align:center;padding:16px 0;border-radius:12px;font-size:14px;font-weight:500;">Abrir Clarity →</a>
      <div style="text-align:center;margin-top:16px;font-size:12px;color:#C8C3BB;">Tu sistema de vida sigue ahí, más claro que nunca.</div>
    </div>
  </div>
  <div style="max-width:520px;margin:24px auto 0;text-align:center;font-size:11px;color:#C8C3BB;">Clarity · pendientes-eight.vercel.app</div>
</div>
</body>
</html>`;

export default async function handler(req, res) {
  const secret = process.env.NEWSLETTER_SECRET;
  const test = req.query.test === '1';
  const key = req.query.key;

  // Seguridad básica via query param
  if (key !== secret) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    let emails = [];

    if (test) {
      // Modo prueba: solo a lucas
      emails = ['lucas.e.arce@gmail.com'];
    } else {
      const { data: users, error } = await supabase.rpc('get_user_list');
      if (error) throw error;
      emails = users.map(u => u.email).filter(Boolean);
    }

    console.log(`Enviando a ${emails.length} usuario(s)... modo: ${test ? 'prueba' : 'todos'}`);

    const results = [];
    for (const email of emails) {
      try {
        await resend.emails.send({
          from: 'Clarity <onboarding@resend.dev>',
          to: email,
          subject: 'Clarity mejoró — descubrí lo nuevo',
          html: EMAIL_HTML,
        });
        results.push({ email, ok: true });
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        results.push({ email, ok: false, error: e.message });
      }
    }

    return res.status(200).json({
      mode: test ? 'prueba' : 'todos',
      sent: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

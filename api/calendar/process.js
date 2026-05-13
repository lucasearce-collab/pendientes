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
  // Desde ayer 00:00 hasta +48hs desde ahora
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(yesterday.toISOString())}&timeMax=${encodeURIComponent(in48h.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=30`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return (data.items || []).filter(e => {
    if (!e.start?.dateTime) return false;
    // Solo reuniones aceptadas o organizadas por el usuario
    if (e.organizer?.self) return true;
    const self = (e.attendees || []).find(a => a.self);
    if (!self) return true; // sin attendees = evento propio
    return self.responseStatus === 'accepted';
  });
}

async function processEventWithGroq(event, userProjects = []) {
  const title = event.summary || 'Sin título';
  const start = event.start.dateTime;
  const end = event.end?.dateTime;
  const duration = Math.round((new Date(end) - new Date(start)) / 60000);

  if (duration < 20) return [];

  const eventDate = new Date(start);
  const preDate = new Date(eventDate); preDate.setDate(preDate.getDate() - 1);
  const postDate = new Date(eventDate); postDate.setDate(postDate.getDate() + 1);
  const fmt = d => d.toISOString().slice(0, 10);

  const now = new Date();
  const isPast = eventDate < now;

  // Detectar si es reunión con cliente (hay asistentes de dominio externo)
  const attendees = event.attendees || [];
  const externalAttendees = attendees.filter(a => 
    !a.self && 
    a.email && 
    !a.email.endsWith('@simetrik.com') &&
    !a.email.endsWith('@resource.calendar.google.com')
  );
  const isClientMeeting = externalAttendees.length > 0;
  const clientDomains = [...new Set(externalAttendees.map(a => a.email.split('@')[1]))].join(', ');
  const attendeeNames = externalAttendees.slice(0, 3).map(a => a.displayName || a.email).join(', ');

  // Proyectos existentes para contexto
  const projectList = userProjects.length > 0 
    ? `Proyectos existentes del usuario: ${userProjects.map(p => p.name).join(', ')}`
    : '';

  const tipoReunion = isClientMeeting 
    ? `Reunión con CLIENTE externo. Asistentes externos: ${attendeeNames || clientDomains}.`
    : 'Reunión interna (todos del mismo equipo).';

  const instruccionesPasada = isClientMeeting ? `
La reunión con el cliente ya ocurrió. Sugerí tareas de alto valor como:
- Enviar presentación o materiales usados en la reunión al cliente
- Documentar acuerdos y próximos pasos acordados con el cliente
- Asignar responsables internos para cada próximo paso acordado
- Enviar minuta formal al cliente con resumen de lo discutido
- Agendar próxima reunión de seguimiento si corresponde
Priorizá las tareas más impactantes para la relación con el cliente.` 
  : `
La reunión interna ya ocurrió. Sugerí tareas como:
- Documentar decisiones tomadas y distribuirlas al equipo
- Ejecutar los próximos pasos acordados
- Hacer seguimiento de compromisos asumidos por cada persona`;

  const instruccionesFutura = isClientMeeting ? `
La reunión con el cliente es próxima. Sugerí tareas de preparación como:
- Investigar el cliente: situación actual, últimas interacciones, objetivos
- Preparar presentación o materiales específicos para esta reunión
- Definir el objetivo concreto que querés lograr en esta reunión
- Revisar acuerdos previos y pendientes con este cliente
Priorizá las tareas que más impacten en el resultado de la reunión.`
  : `
La reunión interna es próxima. Sugerí tareas de preparación como:
- Preparar agenda y materiales necesarios
- Revisar temas pendientes del equipo relacionados a esta reunión`;

  const prompt = `Sos un asistente de productividad ejecutiva para un Account Manager de una empresa de software B2B llamada Simetrik.

Reunión: ${title}
Duración: ${duration} minutos
Fecha: ${fmt(eventDate)}
Tipo: ${tipoReunion}
${projectList}

${isPast ? instruccionesPasada : instruccionesFutura}

Reglas importantes:
- Máximo 2 tareas, priorizando las más impactantes
- Si es reunión personal/social/1:1 informal sin contexto laboral claro: devolvé {"tareas":[]}
- Cada título debe ser específico, mencionar el cliente o proyecto por nombre, y empezar con un verbo de acción
- Para proyecto_sugerido: si el nombre del cliente o reunión coincide con alguno de los proyectos existentes, usá ESE nombre exacto. Si no, sugerí el nombre más lógico
- Las reuniones con clientes son prioritarias — generá siempre tareas para ellas
- No sugerís tareas genéricas como "Preparar materiales" sin mencionar para qué cliente o reunión

Devolvé SOLO un JSON válido sin markdown ni texto extra:
{"tareas":[{"titulo":"tarea accionable y específica mencionando el cliente","fecha":"${isPast ? fmt(postDate) : fmt(preDate)}","momento":"${isPast ? 'post' : 'pre'}","proyecto_sugerido":"nombre exacto del proyecto si existe, sino nombre del cliente"}]}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '{"tareas":[]}';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean).tareas || [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  const validKey = req.query.key === process.env.NEWSLETTER_SECRET;
  const validUser = !!req.query.user_id; // llamada autenticada desde el frontend (usuario logueado)
  if (!validKey && !validUser) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    // Si viene user_id en query, procesar solo ese usuario (llamada desde frontend)
    const targetUserId = req.query.user_id || null;

    let query = supabase
      .from('user_profiles')
      .select('id, google_calendar_token')
      .eq('calendar_connected', true)
      .not('google_calendar_token', 'is', null);

    if (targetUserId) {
      query = query.eq('id', targetUserId);
    }

    const { data: users, error } = await query;

    if (error) throw error;
    if (!users?.length) return res.json({ message: 'No hay usuarios con calendario conectado', processed: 0 });

    const results = [];

    for (const user of users) {
      try {
        console.log('[calendar] procesando usuario:', user.id);
        
        const accessToken = await getAccessToken(user.google_calendar_token);
        console.log('[calendar] accessToken obtenido:', !!accessToken);
        if (!accessToken) { console.log('[calendar] sin accessToken, skip'); continue; }

        const events = await getEvents(accessToken);
        console.log('[calendar] eventos encontrados:', events.length, events.map(e=>e.summary));

        // Cargar proyectos del usuario para contexto
        const { data: userProjects } = await supabase
          .from('projects')
          .select('id, name, area')
          .eq('user_id', user.id);

        // Limpiar sugerencias pendientes viejas antes de generar nuevas
        await supabase.from('calendar_suggestions')
          .delete()
          .eq('user_id', user.id)
          .eq('status', 'pending');

        for (const event of events) {
          console.log('[calendar] procesando evento:', event.summary, event.start?.dateTime);
          
          const { data: existing } = await supabase
            .from('calendar_suggestions')
            .select('id')
            .eq('user_id', user.id)
            .eq('event_id', event.id)
            .eq('status', 'pending');

          if (existing?.length > 0) { console.log('[calendar] ya existe sugerencia para:', event.summary); continue; }

          const tareas = await processEventWithGroq(event, userProjects || []);
          console.log('[calendar] tareas generadas para', event.summary, ':', tareas);

          for (const tarea of tareas) {
            const { error: insertError } = await supabase.from('calendar_suggestions').insert({
              user_id: user.id,
              event_id: event.id,
              event_title: event.summary,
              task_title: tarea.titulo,
              suggested_date: tarea.fecha,
              suggested_project: tarea.proyecto_sugerido,
              momento: tarea.momento,
              status: 'pending',
            });
            if (insertError) console.error('[calendar] error insert:', insertError);
          }

          if (tareas.length > 0) results.push({ event: event.summary, tareas: tareas.length });
        }
      } catch (e) {
        console.error('[calendar] error usuario:', user.id, e.message, e.stack);
      }
    }

    console.log('[calendar] resultado final:', { processed: users.length, suggestions: results });
    return res.json({ processed: users.length, suggestions: results });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

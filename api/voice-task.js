// api/voice-task.js
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Leer body completo como buffer
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBuffer = Buffer.concat(chunks);

    if (!rawBuffer || rawBuffer.length === 0) return res.status(400).json({ error: 'No body' });

    const contentType = req.headers['content-type'] || '';

    // ── Parsear multipart/form-data ──
    let audioBuffer, audioType, contexto = {};

    if (contentType.includes('multipart/form-data')) {
      const boundary = contentType.split('boundary=')[1]?.trim();
      if (!boundary) return res.status(400).json({ error: 'No boundary' });

      const parts = splitMultipart(rawBuffer, boundary);

      for (const part of parts) {
        const { headers, body } = part;
        const disposition = headers['content-disposition'] || '';
        const fieldName = disposition.match(/name="([^"]+)"/)?.[1];
        const partType = headers['content-type'] || '';

        if (fieldName === 'audio') {
          audioBuffer = body;
          audioType = partType || 'audio/webm';
        } else if (fieldName === 'context') {
          try { contexto = JSON.parse(body.toString('utf8')); } catch {}
        }
      }
    } else {
      // Fallback: body directo es el audio (compatibilidad hacia atrás)
      audioBuffer = rawBuffer;
      audioType = contentType || 'audio/webm';
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'No audio found' });
    }

    // ── 1. Transcribir con Groq Whisper ──
    let ext = 'webm';
    if (audioType.includes('mp4') || audioType.includes('m4a')) ext = 'm4a';
    else if (audioType.includes('mpeg')) ext = 'mp3';
    else if (audioType.includes('ogg')) ext = 'ogg';

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: audioType });
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'es');
    formData.append('response_format', 'json');

    const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: formData,
    });

    const whisperData = await whisperRes.json();
    if (!whisperRes.ok) return res.status(500).json({ error: 'Whisper: ' + JSON.stringify(whisperData) });

    const transcript = whisperData.text?.trim();
    if (!transcript) return res.status(200).json({ tipo: 'accion', acciones: [], transcript: '' });

    // ── 2. Construir contexto para Llama ──
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const proyectos = (contexto.proyectos || []).slice(0, 40);
    const tareasPendientes = (contexto.tareasPendientes || []).slice(0, 60);
    const tareasCompletadas = (contexto.tareasCompletadas || []).slice(0, 40);
    const eventosCalendar = (contexto.eventosCalendar || []).slice(0, 20);
    const historialChat = (contexto.historialChat || []).slice(-6); // últimos 6 mensajes

    const ctxProyectos = proyectos.length > 0
      ? `PROYECTOS ACTIVOS (${proyectos.length}):\n` + proyectos.map(p =>
          `- ${p.name} [${p.area}] [${p.importance||'normal'}]`
        ).join('\n')
      : 'Sin proyectos.';

    const ctxPendientes = tareasPendientes.length > 0
      ? `TAREAS PENDIENTES (${tareasPendientes.length}):\n` + tareasPendientes.map(t =>
          `- "${t.title}" → proyecto: ${t.projectName||'sin proyecto'} | fecha: ${t.date||'sin fecha'}`
        ).join('\n')
      : 'Sin tareas pendientes.';

    const ctxCompletadas = tareasCompletadas.length > 0
      ? `TAREAS COMPLETADAS ÚLTIMOS 30 DÍAS (${tareasCompletadas.length}):\n` + tareasCompletadas.map(t =>
          `- "${t.title}" → proyecto: ${t.projectName||'sin proyecto'} | completada: ${t.completed_at?.slice(0,10)||'?'}`
        ).join('\n')
      : 'Sin tareas completadas recientes.';

    const ctxCalendar = eventosCalendar.length > 0
      ? `REUNIONES RECIENTES Y PRÓXIMAS:\n` + eventosCalendar.map(e =>
          `- "${e.summary}" | ${e.date} | ${e.isPast ? 'ya ocurrió' : 'próxima'}`
        ).join('\n')
      : '';

    const ctxHistorial = historialChat.length > 0
      ? `HISTORIAL DE ESTA CONVERSACIÓN:\n` + historialChat.map(m =>
          `${m.rol === 'user' ? 'Usuario' : 'Clarity'}: ${m.texto}`
        ).join('\n')
      : '';

    // ── 3. Llamar a Llama con contexto completo ──
    const prompt = `Sos Clarity, un asistente de productividad personal inteligente y empático. Tenés acceso completo al sistema de gestión del usuario.

FECHA HOY: ${today}

${ctxProyectos}

${ctxPendientes}

${ctxCompletadas}

${ctxCalendar}

${ctxHistorial}

El usuario dijo: "${transcript}"

Tu trabajo es analizar lo que dijo y decidir si es:
A) Una o más ACCIONES concretas sobre el sistema (crear tarea, completar tarea, reprogramar tarea, crear proyecto)
B) Una CONSULTA o pedido de consejo/análisis que requiere una respuesta conversacional
C) AMBAS: responder Y además proponer acciones

Respondé SOLO con un JSON válido sin markdown:

{
  "tipo": "accion" | "consulta" | "ambas",
  "respuesta": "respuesta conversacional si es consulta o ambas — sé directo, empático y accionable. Máximo 3 oraciones.",
  "acciones": [
    {
      "tipo_accion": "crear_tarea" | "crear_proyecto" | "completar_tarea" | "reprogramar_tarea",
      "titulo": "título accionable (para crear_tarea)",
      "fecha": "${today} o ${tomorrow} o YYYY-MM-DD (para crear_tarea)",
      "proyecto_nombre": "nombre del proyecto si se menciona",
      "tipo": "explicita o sugerida",
      "razon": "por qué sugerís (si es sugerida)",
      "titulo_tarea": "título aproximado (para completar o reprogramar)",
      "nueva_fecha": "YYYY-MM-DD (para reprogramar)",
      "nombre": "nombre (para crear_proyecto)"
    }
  ]
}

Reglas:
- Si el usuario pide análisis, da recomendaciones basadas en sus datos reales
- Si el usuario pregunta por un cliente o proyecto específico, buscá en los datos y respondé con información concreta
- Para acciones: máximo 3, priorizá las más relevantes
- Si es pura consulta sin acciones: acciones = []
- Nunca inventes datos que no estén en el contexto
- Respondé siempre en español, en tono directo y humano`;

    const llamaRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      }),
    });

    const llamaData = await llamaRes.json();
    if (!llamaRes.ok) return res.status(500).json({ error: 'Llama: ' + JSON.stringify(llamaData) });

    const text = llamaData.choices?.[0]?.message?.content || '{"tipo":"accion","acciones":[]}';

    try {
      const clean = text.replace(/```json|```/gi, '').trim();
      const parsed = JSON.parse(clean);
      return res.status(200).json({
        transcript,
        tipo: parsed.tipo || 'accion',
        respuesta: parsed.respuesta || null,
        acciones: parsed.acciones || [],
      });
    } catch (e) {
      return res.status(500).json({ error: 'Parse error: ' + text.slice(0, 100) });
    }

  } catch (e) {
    console.error('Voice task error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── Parser multipart/form-data ──
function splitMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;

  while (start < buffer.length) {
    const boundaryIdx = buffer.indexOf(boundaryBuf, start);
    if (boundaryIdx === -1) break;

    const afterBoundary = boundaryIdx + boundaryBuf.length;

    // Verificar si es el boundary final (--)
    if (buffer[afterBoundary] === 45 && buffer[afterBoundary + 1] === 45) break;

    // Saltar \r\n después del boundary
    const headerStart = afterBoundary + 2;

    // Encontrar el fin de los headers (\r\n\r\n)
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;

    const headerStr = buffer.slice(headerStart, headerEnd).toString('utf8');
    const headers = {};
    for (const line of headerStr.split('\r\n')) {
      const [k, ...v] = line.split(':');
      if (k) headers[k.trim().toLowerCase()] = v.join(':').trim();
    }

    const bodyStart = headerEnd + 4;
    const nextBoundary = buffer.indexOf(boundaryBuf, bodyStart);
    const bodyEnd = nextBoundary === -1 ? buffer.length : nextBoundary - 2; // -2 para \r\n

    parts.push({ headers, body: buffer.slice(bodyStart, bodyEnd) });
    start = nextBoundary === -1 ? buffer.length : nextBoundary;
  }

  return parts;
}

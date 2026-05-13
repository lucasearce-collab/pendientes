// api/voice-task.js
// Recibe audio, transcribe con Whisper, extrae/sugiere tareas con Llama

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Leer el body como buffer
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const audioBuffer = Buffer.concat(chunks);

    if (!audioBuffer || audioBuffer.length === 0) return res.status(400).json({ error: 'No audio found' });

    const contentType = req.headers['content-type'] || 'audio/webm';
    let ext = 'webm';
    if (contentType.includes('mp4') || contentType.includes('m4a')) ext = 'm4a';
    else if (contentType.includes('mpeg')) ext = 'mp3';

    // 1. Transcribir con Groq Whisper
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: contentType });
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
    if (!whisperRes.ok) {
      return res.status(500).json({ error: 'Whisper error: ' + JSON.stringify(whisperData) });
    }
    const transcript = whisperData.text;

    if (!transcript || transcript.trim().length === 0) {
      return res.status(200).json({ tareas: [], transcript: '' });
    }

    // 2. Extraer tareas e intenciones con Llama
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const prompt = `Sos un asistente ejecutivo de productividad. Analizá este audio transcripto y detectá las acciones que el usuario quiere realizar en su gestor de tareas.

Transcripción: "${transcript}"

Fecha de hoy: ${today}

Tu trabajo es clasificar la intención y extraer los parámetros. Las acciones posibles son:
1. crear_tarea: El usuario quiere agregar una nueva tarea. Extraé el título, la fecha (usá ${today} si es para hoy, ${tomorrow} si es para mañana) y el nombre del proyecto si se menciona uno.
2. crear_proyecto: El usuario quiere crear un proyecto nuevo. Extraé el nombre.
3. completar_tarea: El usuario dice que ya terminó o completó una tarea. Extraé el título aproximado de la tarea.
4. reprogramar_tarea: El usuario quiere mover o patear una tarea para otro día. Extraé el título de la tarea y la nueva fecha.

Reglas:
- Si no hay intenciones claras, devolvé un array vacío.
- Si el usuario simplemente narra su día sin pedir nada explícito, sugerí 1 o 2 "crear_tarea" lógicas como próximos pasos (marcá tipo="sugerida").
- Devolvé SOLO un JSON válido sin markdown.

Formato esperado:
{
  "transcript": "el texto original resumido en una línea",
  "acciones": [
    {
      "tipo_accion": "crear_tarea",
      "titulo": "título accionable",
      "fecha": "YYYY-MM-DD o null",
      "proyecto_nombre": "nombre del proyecto o null",
      "tipo": "explicita o sugerida",
      "razon": "por qué sugerís esta tarea (si es sugerida)"
    },
    {
      "tipo_accion": "crear_proyecto",
      "nombre": "nombre del nuevo proyecto"
    },
    {
      "tipo_accion": "completar_tarea",
      "titulo_tarea": "título de la tarea a completar"
    },
    {
      "tipo_accion": "reprogramar_tarea",
      "titulo_tarea": "título de la tarea a mover",
      "nueva_fecha": "YYYY-MM-DD"
    }
  ]
}`;

    const llamaRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: 'json_object' }
      }),
    });

    const llamaData = await llamaRes.json();
    if (!llamaRes.ok) {
      return res.status(500).json({ error: 'Llama error: ' + JSON.stringify(llamaData) });
    }
    const text = llamaData.choices?.[0]?.message?.content || '{"acciones":[]}';

    try {
      const clean = text.replace(/```json|```/gi, '').trim();
      const parsed = JSON.parse(clean);
      return res.status(200).json({
        transcript,
        acciones: parsed.acciones || [],
      });
    } catch (e) {
      return res.status(500).json({ error: 'Error parseando respuesta de Llama: ' + text });
    }

  } catch (e) {
    console.error('Voice task error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

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

    // 2. Extraer tareas y sugerir próximos pasos con Llama
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const prompt = `Sos un asistente ejecutivo de productividad. Analizá este audio transcripto y extraé o sugerí tareas accionables.

Transcripción: "${transcript}"

Fecha de hoy: ${today}

Tu trabajo es:
1. Si el usuario menciona tareas explícitas ("tengo que...", "llamar a...", "enviar...", "agendar...") → extraélas directamente
2. Si el usuario describe una situación, reunión o contexto sin mencionar tareas explícitas → sugerí 2-3 próximos pasos lógicos como tareas
3. Si hay una mezcla → hacé las dos cosas

Reglas:
- Si no se menciona fecha, usá ${today} (hoy)
- Si dice "mañana" usá ${tomorrow}
- El título de cada tarea debe ser específico y accionable
- Detectá el proyecto si hay contexto suficiente (nombre de cliente, empresa, proyecto)
- Diferenciá si es una tarea que el usuario dijo explícitamente vs una que vos sugerís

Devolvé SOLO un JSON válido sin markdown:
{
  "transcript": "el texto original resumido en una línea",
  "tareas": [
    {
      "titulo": "título específico y accionable",
      "fecha": "YYYY-MM-DD",
      "proyecto_sugerido": "nombre del proyecto o null",
      "tipo": "explicita o sugerida",
      "razon": "por qué sugerís esta tarea si es sugerida"
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
    const text = llamaData.choices?.[0]?.message?.content || '{"tareas":[]}';

    try {
      const clean = text.replace(/```json|```/gi, '').trim();
      const parsed = JSON.parse(clean);
      return res.status(200).json({
        transcript,
        tareas: parsed.tareas || [],
      });
    } catch (e) {
      return res.status(500).json({ error: 'Error parseando respuesta de Llama: ' + text });
    }

  } catch (e) {
    console.error('Voice task error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

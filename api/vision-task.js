// api/vision-task.js
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBuffer = Buffer.concat(chunks);
    if (!rawBuffer || rawBuffer.length === 0) return res.status(400).json({ error: 'No body' });

    const contentType = req.headers['content-type'] || '';

    // Parsear multipart/form-data
    let imageBuffer, imageMime, contexto = {};

    if (contentType.includes('multipart/form-data')) {
      const boundary = contentType.split('boundary=')[1]?.trim();
      if (!boundary) return res.status(400).json({ error: 'No boundary' });
      const parts = splitMultipart(rawBuffer, boundary);
      for (const part of parts) {
        const { headers, body } = part;
        const disposition = headers['content-disposition'] || '';
        const fieldName = disposition.match(/name="([^"]+)"/)?.[1];
        const partType = headers['content-type'] || '';
        if (fieldName === 'image') {
          imageBuffer = body;
          imageMime = partType || 'image/jpeg';
        } else if (fieldName === 'context') {
          try { contexto = JSON.parse(body.toString('utf8')); } catch {}
        }
      }
    } else {
      imageBuffer = rawBuffer;
      imageMime = contentType || 'image/jpeg';
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return res.status(400).json({ error: 'No image found' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const proyectos = (contexto.proyectos || []).slice(0, 40);
    const projectList = proyectos.length > 0
      ? `Proyectos existentes: ${proyectos.map(p => p.name).join(', ')}`
      : '';

    const prompt = `Sos un asistente de productividad. El usuario te mandó una foto de una lista de tareas escrita a mano, una pizarra, notas de reunión o cualquier texto con tareas pendientes.

Tu trabajo es extraer todas las tareas que veas en la imagen y convertirlas en acciones concretas.

${projectList}

Fecha de hoy: ${today}

Reglas:
- Extraé TODAS las tareas visibles, aunque estén escritas de forma informal
- Si el texto menciona un proyecto que coincide con alguno de los proyectos existentes, asignalo
- Si no hay fecha clara, usá ${today}
- Si la nota dice "mañana" o similar, usá ${tomorrow}
- Títulos concisos y accionables, empezando con un verbo
- Si no ves tareas claras (foto borrosa, sin texto, etc.), devolvé acciones vacías

Devolvé SOLO un JSON válido sin markdown:
{
  "descripcion": "qué viste en la imagen en una línea",
  "acciones": [
    {
      "tipo_accion": "crear_tarea",
      "titulo": "título accionable",
      "fecha": "YYYY-MM-DD",
      "proyecto_nombre": "nombre del proyecto o null"
    }
  ]
}`;

    const base64Image = imageBuffer.toString('base64');

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: imageMime, data: base64Image } }
            ]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1000,
            responseMimeType: 'application/json',
          }
        }),
      }
    );

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error('[vision] Gemini error:', geminiData);
      return res.status(500).json({ error: geminiData.error?.message || 'Error de Gemini' });
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{"acciones":[]}';

    try {
      const clean = text.replace(/```json|```/gi, '').trim();
      const parsed = JSON.parse(clean);
      return res.status(200).json({
        descripcion: parsed.descripcion || '',
        acciones: parsed.acciones || [],
      });
    } catch (e) {
      return res.status(500).json({ error: 'Parse error: ' + text.slice(0, 100) });
    }

  } catch (e) {
    console.error('[vision] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

function splitMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;
  while (start < buffer.length) {
    const boundaryIdx = buffer.indexOf(boundaryBuf, start);
    if (boundaryIdx === -1) break;
    const afterBoundary = boundaryIdx + boundaryBuf.length;
    if (buffer[afterBoundary] === 45 && buffer[afterBoundary + 1] === 45) break;
    const headerStart = afterBoundary + 2;
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
    const bodyEnd = nextBoundary === -1 ? buffer.length : nextBoundary - 2;
    parts.push({ headers, body: buffer.slice(bodyStart, bodyEnd) });
    start = nextBoundary === -1 ? buffer.length : nextBoundary;
  }
  return parts;
}

// api/gemini-test.js — endpoint temporal para verificar modelos disponibles
export default async function handler(req, res) {
  if (req.query.key !== process.env.NEWSLETTER_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    // Listar modelos disponibles
    const modelsRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    );
    const modelsData = await modelsRes.json();
    const flashModels = modelsData.models
      ?.filter(m => m.name.includes('flash'))
      ?.map(m => ({ name: m.name, methods: m.supportedGenerationMethods }));

    // Probar con gemini-2.0-flash-lite que suele estar disponible
    const testRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respondé solo: ok' }] }],
        }),
      }
    );
    const testData = await testRes.json();

    return res.json({
      flash_models: flashModels,
      test_response: testData.candidates?.[0]?.content?.parts?.[0]?.text,
      test_error: testData.error?.message,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

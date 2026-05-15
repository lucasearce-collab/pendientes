// api/coach.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { indicadores } = req.body;
    if (!indicadores) return res.status(400).json({ error: 'Faltan indicadores' });

    const {
      tareasCompletadasPorDia = [],
      totalSemana = 0,
      totalHistorico = 0,
      porcentajeATiempo = 0,
      porcentajePostergadas = 0,
      presionTotal = 0,
      fuentePresion = '',
      ocioScore = null,
      balanceEstrategico = {},
      coherencia = {},
      momentum = [],
    } = indicadores;

    const diasSemana = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const distribucion = tareasCompletadasPorDia
      .map((v, i) => `${diasSemana[i]}: ${v}`)
      .join(', ');

    const momentumStr = momentum.length > 0
      ? momentum.map(m => `- "${m.meta}": score ${m.score}/100, última actividad hace ${m.diasDesdeActividad} días`).join('\n')
      : 'Sin datos de momentum';

    const prompt = `Sos Clarity, un coach personal inteligente y empático. Tu rol es acompañar al usuario para que cumpla sus metas sin perder su humanidad en el proceso. Conocés profundamente la diferencia entre productividad sostenible y agotamiento.

INDICADORES DE LA SEMANA:

Tareas completadas: ${totalSemana} esta semana (${totalHistorico} históricas)
Distribución diaria: ${distribucion}
A tiempo: ${porcentajeATiempo}% | Postergadas: ${porcentajePostergadas}%
Presión total: ${presionTotal}/100 | Fuente dominante: ${fuentePresion || 'no determinada'}
${ocioScore !== null ? `Ocio y vida personal: ${ocioScore}/100` : ''}
Balance estratégico: ${balanceEstrategico.estrategicas || 0}% estratégicas, ${balanceEstrategico.prioritarias || 0}% prioritarias, ${balanceEstrategico.operativas || 0}% operativas
Coherencia de metas: ${coherencia.tareasConProposito || 0}% tareas con propósito, ${coherencia.metasConectadas || 0}% metas conectadas

Momentum por meta:
${momentumStr}

INSTRUCCIONES:
Escribí un mensaje de exactamente 4 oraciones que:
1. Reconozca lo que hizo bien esta semana (sin exagerar, basándote en los datos reales)
2. Identifique LA cosa más importante que revelan los indicadores — algo que el usuario debería ver ahora
3. Valide cómo probablemente se está sintiendo (nombrá la emoción o estado implícito)
4. Cierre con un consejo concreto, humano y accionable para esta semana

REGLAS DE TONO:
- Directo pero cálido. No robótico, no motivacional vacío
- No recites los números — interpretá lo que significan
- Hablá en segunda persona (vos)
- Exactamente 4 oraciones. Ni más ni menos
- Nunca uses frases vacías como "¡Excelente trabajo!" o "¡Seguí así!"
- El mensaje tiene que sentirse como si lo escribiera alguien que te conoce bien y te quiere ver crecer — no un algoritmo

Respondé SOLO con el mensaje, sin introducción ni explicación.`;

    const res2 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    const data = await res2.json();
    if (!res2.ok) return res.status(500).json({ error: 'Groq error: ' + JSON.stringify(data) });

    const mensaje = data.choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ mensaje });

  } catch (e) {
    console.error('[coach] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

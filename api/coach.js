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
      porcentajeATiempo,
      porcentajePostergadas,
      presionTotal = 0,
      presionStatus = 'saludable',
      proyectosActivos = 0,
      tareasVencidas = 0,
      latenciaLaboral = 0,
      latenciaPersonal = 0,
      balanceEstrategico = {},
      coherencia = {},
      momentum = [],
      tareasResistidas = [],
    } = indicadores;

    const diasSemana = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const distribucion = tareasCompletadasPorDia.map((v, i) => `${diasSemana[i]}: ${v}`).join(', ');

    // Detectar patrón de la semana
    const pico = Math.max(...tareasCompletadasPorDia);
    const diaPico = diasSemana[tareasCompletadasPorDia.indexOf(pico)];
    const finDeSemana = tareasCompletadasPorDia.slice(5).reduce((a,b)=>a+b,0);
    const patron = tareasCompletadasPorDia[0]===0&&tareasCompletadasPorDia[6]===0
      ? 'solo días laborales'
      : tareasCompletadasPorDia.slice(0,5).reduce((a,b)=>a+b,0) > tareasCompletadasPorDia.slice(5).reduce((a,b)=>a+b,0)*3
      ? 'más cargado en días laborales'
      : 'distribuido también en fin de semana';

    const momentumStr = momentum.length > 0
      ? momentum.map(m => `  - "${m.meta}": momentum ${m.score}/100 (${m.diasDesdeActividad===0?'activo hoy':m.diasDesdeActividad===99?'sin actividad reciente':`última actividad hace ${m.diasDesdeActividad} día${m.diasDesdeActividad===1?'':'s'}`})`).join('\n')
      : '  Sin metas de este año configuradas';

    const resistidasStr = tareasResistidas.length > 0
      ? tareasResistidas.map(t => `  - "${t.titulo}" (${t.proyecto||'sin proyecto'}, pospuesta ${t.vecesPostergada} veces)`).join('\n')
      : '  Ninguna';

    const prompt = `Sos Clarity, un coach personal inteligente y empático. Tu rol es acompañar al usuario para que cumpla sus metas sin perder su humanidad en el proceso. Entendés que la productividad sostenible incluye el descanso, las emociones y el disfrute.

INDICADORES COMPLETOS DE LA SEMANA:

RENDIMIENTO:
- Tareas completadas: ${totalSemana} esta semana (${totalHistorico} históricas)
- Distribución diaria: ${distribucion}
- Patrón: ${patron}, pico el ${diaPico} con ${pico} tareas
- A tiempo: ${porcentajeATiempo !== null ? porcentajeATiempo + '%' : 'sin datos'}
- Tasa de postergación: ${porcentajePostergadas !== null ? porcentajePostergadas + '%' : 'sin datos'}

SALUD / CARGA MENTAL:
- Presión total: ${presionTotal}/100 (${presionStatus})
- Proyectos activos simultáneos: ${proyectosActivos}
- Tareas vencidas: ${tareasVencidas}
- Proyectos de trabajo sin actividad: ${latenciaLaboral}
- Proyectos personales sin actividad: ${latenciaPersonal}

TAREAS QUE VIENE RESISTIENDO:
${resistidasStr}

DIRECCIÓN ESTRATÉGICA:
- Balance esta semana: ${balanceEstrategico.estrategicas||0}% estratégicas, ${balanceEstrategico.prioritarias||0}% prioritarias, ${balanceEstrategico.operativas||0}% operativas
- Tareas con propósito conectado a metas: ${coherencia.tareasConProposito||0}%
- Metas de este año conectadas al mediano plazo: ${coherencia.metasAnioConectadas||0}%
- Metas de mediano plazo conectadas al largo plazo: ${coherencia.metasMedioConectadas||0}%

MOMENTUM POR META:
${momentumStr}

INSTRUCCIONES:
Escribí un mensaje de exactamente 4 oraciones que:
1. Reconozca lo que hizo bien esta semana basándote en los datos reales (sin exagerar)
2. Identifique LA cosa más importante que revelan los indicadores — algo que el usuario debería ver ahora
3. Valide cómo probablemente se está sintiendo (nombrá la emoción o estado implícito en los datos)
4. Cierre con un consejo concreto, humano y accionable para esta semana

REGLAS DE TONO:
- Directo pero cálido. No robótico, no motivacional vacío
- No recites los números — interpretá lo que significan
- Hablá en segunda persona (vos)
- Exactamente 4 oraciones. Ni más ni menos
- NUNCA empieces con la palabra "Vos" — arrancá con la observación ("Esta semana...", "Completaste...", "Los números muestran...", etc.)
- Nunca uses frases vacías como "¡Excelente trabajo!" o "¡Seguí así!"
- Si el ocio/personal está bajo, mencionalo — es el combustible que hace sostenible todo lo demás
- Si hay tareas muy resistidas, son una señal emocional importante — nombrala
- El mensaje tiene que sentirse como si lo escribiera alguien que te conoce bien y te quiere ver crecer

Respondé SOLO con el mensaje, sin introducción ni explicación.`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

    const data = await groqRes.json();
    if (!groqRes.ok) return res.status(500).json({ error: 'Groq error: ' + JSON.stringify(data) });

    const mensaje = data.choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ mensaje });

  } catch (e) {
    console.error('[coach] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

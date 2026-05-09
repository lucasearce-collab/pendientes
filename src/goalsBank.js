// goalsBank.js - Clarity
// Estructura: Arquetipo -> Sub-Arquetipo -> Horizonte -> Categoría -> [Metas]

export const BANCO_METAS = {
  impacto: {
    corporativo: {
      title: "Impacto",
      corto: {
        Dinero: [
          "Negociar un aumento basado en resultados concretos",
          "Empezar a ahorrar o invertir una parte fija de mi sueldo cada mes",
          "Ordenar mis finanzas para saber exactamente a dónde va mi dinero"
        ],
        Salud: [
          "Proteger tiempo para hacer algo físico al menos tres veces por semana",
          "Desconectarme del trabajo a una hora razonable y respetarla",
          "Dormir mejor — empezando por dejar el teléfono fuera del cuarto"
        ],
        Amor: [
          "Reservar tiempo para mi pareja sin que el trabajo lo interrumpa",
          "Cultivar relaciones con personas que me desafíen a mejorar",
          "Estar más presente con las personas que me importan"
        ]
      },
      medio: {
        Dinero: [
          "Llegar a un rol donde tenga más influencia y mejor compensación",
          "Tener un fondo de reserva que me dé libertad para elegir",
          "Empezar a generar algún ingreso más allá de mi sueldo"
        ],
        Salud: [
          "Completar un desafío físico que me exija de verdad",
          "Tener un espacio de terapia o coaching para procesar la presión del trabajo",
          "Lograr que el descanso y el ejercicio sean parte fija de mi semana"
        ],
        Amor: [
          "Ser un mentor real para alguien que esté empezando",
          "Tomarse unas vacaciones largas sin culpa y sin mirar el mail",
          "Rodearme de personas que me hagan mejor persona y mejor profesional"
        ]
      },
      largo: {
        Dinero: [
          "Alcanzar independencia financiera — que trabajar sea una elección",
          "Tener inversiones que generen ingresos sin que yo tenga que hacer nada",
          "Construir un patrimonio que cuide a las personas que quiero"
        ],
        Salud: [
          "Llegar a los 60 con energía y sin arrepentirme de no haberme cuidado",
          "Mantener la claridad mental para seguir tomando buenas decisiones",
          "Que mi cuerpo no sea un límite para lo que quiero hacer"
        ],
        Amor: [
          "Haber estado presente en los momentos que importan, no solo en los exitosos",
          "Tener relaciones profundas que no dependan de mi cargo o éxito",
          "Poder ayudar económicamente a la gente que quiero sin esfuerzo"
        ]
      }
    },
    freelancer: {
      title: "Impacto",
      corto: {
        Dinero: [
          "Subir mis tarifas para reflejar lo que realmente valgo",
          "Tener clientes fijos que cubran mis gastos básicos sin estrés",
          "Separar las finanzas del negocio de las personales de una vez"
        ],
        Salud: [
          "Respetar horarios de comida y no comer frente a la pantalla",
          "Dormir bien — dejar de trabajar de madrugada",
          "Moverme al menos 30 minutos al día, aunque sea caminar"
        ],
        Amor: [
          "Dejar los fines de semana libres de trabajo y clientes",
          "Conectar con otros freelancers para no trabajar en soledad",
          "Dedicar tiempo de calidad a las personas que me importan"
        ]
      },
      medio: {
        Dinero: [
          "Crear algo que genere ingresos aunque yo no esté trabajando",
          "Construir una reputación en mi nicho que traiga clientes solos",
          "Tener seis meses de fondo de emergencia para estar tranquilo"
        ],
        Salud: [
          "Tener una cobertura médica decente y usarla",
          "Incorporar el ejercicio al calendario como si fuera una reunión de trabajo",
          "Hacerme los chequeos preventivos que vengo postergando"
        ],
        Amor: [
          "Tomarse vacaciones reales — desconectado de verdad",
          "Armar una red de colegas con quienes colaborar y apoyarse",
          "Tener amigos y hobbies que no tengan nada que ver con mi trabajo"
        ]
      },
      largo: {
        Dinero: [
          "Trabajar solo con clientes que me entusiasmen y poder decir que no al resto",
          "Tener inversiones que cubran la mitad de lo que necesito para vivir",
          "Poder trabajar desde cualquier lugar del mundo sin complicaciones"
        ],
        Salud: [
          "Llegar a la vejez sin dolores crónicos por haber pasado años sentado",
          "Que el deporte sea parte de quién soy, no algo que debería hacer",
          "Tener la energía para seguir haciendo lo que me gusta por muchos años más"
        ],
        Amor: [
          "Haber estado presente para mi familia mientras construía mi carrera",
          "Dedicar tiempo y experiencia a causas que me importen",
          "Tener amigos de verdad en distintos lugares del mundo"
        ]
      }
    },
    founder: {
      title: "Impacto",
      corto: {
        Dinero: [
          "Delegar lo operativo para enfocarme en lo estratégico",
          "Mejorar los márgenes eliminando gastos que no aportan valor",
          "Tener un fondo de contingencia que cubra al menos tres meses de nómina"
        ],
        Salud: [
          "Entrenar dos veces por semana aunque la agenda esté llena",
          "Dormir mejor — el negocio no funciona mejor porque yo duerma menos",
          "Tener un espacio para procesar la presión de liderar"
        ],
        Amor: [
          "Que las conversaciones en casa no giren siempre alrededor del negocio",
          "Desconectarme los fines de semana de verdad",
          "Dedicar tiempo de calidad a mi pareja o familia, no solo sobras"
        ]
      },
      medio: {
        Dinero: [
          "Escalar el negocio para que no dependa completamente de mí",
          "Asegurar mi situación financiera personal más allá de la empresa",
          "Llegar a un punto donde pueda tomarme vacaciones sin que todo explote"
        ],
        Salud: [
          "Mejorar mis hábitos de sueño y nutrición para rendir mejor",
          "Delegar lo suficiente para poder descansar sin culpa",
          "Cuidar mi salud mental con la misma seriedad que cuido el negocio"
        ],
        Amor: [
          "Compensar el tiempo del arranque con presencia real ahora",
          "Construir un equipo en el que confíe y que me dé más libertad",
          "Conectar con otros founders para sentirme menos solo en el proceso"
        ]
      },
      largo: {
        Dinero: [
          "Tener opciones — vender, ceder el mando o seguir — que sea una elección libre",
          "No depender económicamente de un solo activo",
          "Invertir en otros proyectos y devolver algo al ecosistema"
        ],
        Salud: [
          "Demostrar que construir algo grande no tiene que destruir la salud",
          "Mantener la energía y claridad mental para lo que venga después",
          "Soltar lo operativo completamente y no echarlo de menos"
        ],
        Amor: [
          "Haber estado presente para mi familia mientras construía algo grande",
          "Ayudar a otros emprendedores a no cometer los errores que cometí",
          "Tener un círculo cercano que haya sobrevivido los años de construcción"
        ]
      }
    }
  },
  equilibrio: {
    creativo: {
      title: "Equilibrio",
      corto: {
        Dinero: [
          "Tener un ingreso que pague las cuentas sin ahogar mi creatividad",
          "Cobrar por mi trabajo creativo — aunque sea poco al principio",
          "Ordenar mis gastos para ganar tranquilidad y tiempo"
        ],
        Salud: [
          "Proteger las mañanas para crear sin interrupciones",
          "Salir a caminar en silencio — sin podcast, sin música",
          "Reducir el tiempo en redes para no intoxicarme de comparación"
        ],
        Amor: [
          "Encontrar un grupo donde pueda mostrar mi trabajo sin miedo",
          "Aprender a decir que no a planes que me drenan",
          "Tener vínculos donde pueda hablar de mis bloqueos sin vergüenza"
        ]
      },
      medio: {
        Dinero: [
          "Que la mitad de lo que gano venga de mi trabajo creativo",
          "Tener un espacio propio para crear — aunque sea pequeño",
          "Ahorrar para poder dedicarme a un proyecto grande sin presión financiera"
        ],
        Salud: [
          "Tener un espacio terapéutico para atravesar los altibajos creativos",
          "Hacer ejercicio regularmente para anclarme en los días difíciles",
          "Descansar de verdad — no solo entre proyectos sino dentro de ellos"
        ],
        Amor: [
          "Construir una comunidad alrededor de mi trabajo",
          "Colaborar con creadores que admiro y que me hagan mejor",
          "Cuidar mi relación de pareja para que no absorba mis neurosis creativas"
        ]
      },
      largo: {
        Dinero: [
          "Vivir de mi obra sin tener que vender lo que no quiero hacer",
          "Tener la libertad económica para elegir cada proyecto por amor, no por dinero",
          "Que mi trabajo siga generando valor aunque yo no esté activamente produciendo"
        ],
        Salud: [
          "Hacer las paces con mis límites y dejar de perseguir la perfección",
          "Llegar a viejo con energía para seguir creando",
          "Que mi cuerpo no pague el precio de años de estrés y mala postura"
        ],
        Amor: [
          "Haber dejado algo que importe — una obra, una historia, algo real",
          "Transmitir lo que aprendí a creadores más jóvenes",
          "Tener amistades basadas en el respeto mutuo que sobrevivieron el tiempo"
        ]
      }
    },
    nomade: {
      title: "Equilibrio",
      corto: {
        Dinero: [
          "Tener ingresos digitales que funcionen desde cualquier lugar",
          "Saber exactamente cuánto necesito para vivir bien en movimiento",
          "Ordenar las cuentas para que viajar no sea un caos financiero"
        ],
        Salud: [
          "Tener una rutina de ejercicio que pueda hacer en cualquier lugar",
          "Comer bien aunque esté viajando — no sobrevivir de delivery",
          "Dormir bien a pesar de los cambios de ambiente y zona horaria"
        ],
        Amor: [
          "Mantener el contacto con las personas que quiero aunque esté lejos",
          "Conocer gente local en cada lugar y no solo otros viajeros",
          "Si tengo pareja, encontrar la manera de que el viaje funcione para los dos"
        ]
      },
      medio: {
        Dinero: [
          "Trabajar menos horas sin ganar menos — automatizar o delegar",
          "Tener una base donde quedarme periodos más largos y gastar menos",
          "Diversificar los ingresos para que perder un cliente no paralice todo"
        ],
        Salud: [
          "Incorporar la aventura física — senderismo, surf, lo que el lugar ofrezca",
          "Encontrar calma en el movimiento constante, no a pesar de él",
          "Usar el acceso a distintos países para hacerme chequeos de calidad"
        ],
        Amor: [
          "Tener amigos en distintas ciudades con quienes reencontrarme",
          "Compartir este estilo de vida con alguien que lo disfrute tanto como yo",
          "Llevar a alguien que quiero a descubrir cómo vivo"
        ]
      },
      largo: {
        Dinero: [
          "Tener suficiente ahorrado para pausar y viajar sin trabajar durante meses",
          "Tener un lugar en el mundo que sienta mío",
          "Que mis activos no dependan de ningún país en particular"
        ],
        Salud: [
          "Seguir pudiendo explorar sin que el cuerpo me lo impida",
          "Disfrutar tanto de la intensidad de una ciudad como del silencio de la naturaleza",
          "Cuidarme para el largo plazo — no solo para el próximo destino"
        ],
        Amor: [
          "Tener un lugar al que volver cuando quiera — personas, no solo un lugar",
          "Haber aprendido algo real de cada cultura que atravesé",
          "Saber en qué punto quiero frenar y estar en paz con esa decisión"
        ]
      }
    },
    paz: {
      title: "Equilibrio",
      corto: {
        Dinero: [
          "Saldar las deudas que me generan ruido mental",
          "Saber exactamente a dónde va mi dinero cada mes",
          "Dejar de gastar por impulso — esperar antes de comprar lo no esencial"
        ],
        Salud: [
          "Empezar el día sin mirar el teléfono — aunque sea 20 minutos",
          "Ir al médico con todo lo que vengo postergando",
          "Caminar 20 minutos al día en silencio — sin auriculares"
        ],
        Amor: [
          "Decir que no sin culpa a los planes que me drenan",
          "Poner límites con quienes me demandan más de lo que puedo dar",
          "Pasar más tiempo con las personas que me hacen sentir bien"
        ]
      },
      medio: {
        Dinero: [
          "Tener ahorrado suficiente para poder dejar un trabajo tóxico si hace falta",
          "Elegir trabajos por calidad de vida, no solo por dinero",
          "Vivir bien con lo que tengo — sin estar corriendo detrás de más"
        ],
        Salud: [
          "Resolver los problemas físicos que arrastro hace tiempo",
          "Un fin de semana por mes completamente desconectado",
          "Que las cosas cotidianas me afecten menos — el tráfico, la gente, los imprevistos"
        ],
        Amor: [
          "Alejarse de vínculos que me cuestan más de lo que me aportan",
          "Tener una relación de pareja que sea refugio, no fuente de estrés",
          "Escuchar a los demás sin cargarme sus problemas"
        ]
      },
      largo: {
        Dinero: [
          "Tener una vida con pocos gastos fijos y mucha libertad",
          "Un hogar que sea simple, bonito y fácil de mantener",
          "Que el dinero deje de ser una fuente de ansiedad"
        ],
        Salud: [
          "Envejecer sin el desgaste que genera años de estrés crónico",
          "Que comer bien, dormir bien y moverme sean cosas que hago sin pensarlo",
          "Ser feliz sin necesitar estímulos externos constantes"
        ],
        Amor: [
          "Tener una relación de pareja donde pueda decir cualquier cosa",
          "Ser la persona a la que la familia busca cuando hay una crisis",
          "Atravesar las pérdidas de la vida con aceptación, no con resistencia"
        ]
      }
    }
  },
  vinculos: {
    padres: {
      title: "Vínculos",
      corto: {
        Dinero: [
          "Tener un fondo para gastos inesperados del hogar o de salud",
          "Organizar el presupuesto familiar para eliminar sorpresas de fin de mes",
          "Asegurarme de que todos en casa tengan buena cobertura médica"
        ],
        Salud: [
          "Cocinar en casa al menos cuatro veces por semana",
          "Turnarse con mi pareja para que cada uno tenga tiempo de ejercitarse",
          "Apagar los teléfonos a una hora fija para que todos duerman mejor"
        ],
        Amor: [
          "Cenar en familia sin pantallas al menos cuatro veces por semana",
          "Tener una salida a solas con cada hijo una vez al mes",
          "No dejar que la paternidad se coma completamente la relación de pareja"
        ]
      },
      medio: {
        Dinero: [
          "Ahorrar para la educación de mis hijos sin que eso genere estrés",
          "Hacer las mejoras que la casa necesita para que todos estén cómodos",
          "Poder viajar en familia sin recurrir a deudas"
        ],
        Salud: [
          "Hacer ejercicio en familia — aunque sea salir a caminar los fines de semana",
          "Aprender a manejar el caos del hogar sin reaccionar impulsivamente",
          "Cuidar mi energía física para poder estar presente con mis hijos"
        ],
        Amor: [
          "Construir tradiciones familiares que mis hijos recuerden cuando sean adultos",
          "Darles responsabilidades reales para prepararlos para la vida",
          "Tener una red de apoyo con otros padres para no cargar todo solo"
        ]
      },
      largo: {
        Dinero: [
          "Tener los recursos para ayudar a mis hijos a arrancar su vida adulta",
          "Pagar la casa y que sea un lugar sin deudas para lo que venga",
          "Dejar todo ordenado legalmente para evitar conflictos futuros"
        ],
        Salud: [
          "Cuidarme hoy para poder estar activo en la vida de mis nietos",
          "Que mi familia me vea como ejemplo de que la salud importa",
          "Mantener la curiosidad para seguir conectando con las generaciones que vienen"
        ],
        Amor: [
          "Que mis hijos vuelvan a casa porque quieren, no porque se sientan obligados",
          "Redescubrir la relación de pareja cuando los hijos sean independientes",
          "Haber sido un buen padre o madre — con todo lo que eso implica"
        ]
      }
    },
    pareja: {
      title: "Vínculos",
      corto: {
        Dinero: [
          "Ser honestos con el dinero — sin secretos ni cuentas separadas por las razones equivocadas",
          "Tener un plan para salir de las deudas que nos pesan",
          "Separar algo cada mes para hacer cosas juntos sin culpa"
        ],
        Salud: [
          "Que el dormitorio sea un lugar de descanso, no de discusiones",
          "Apoyarnos mutuamente para movernos más y comer mejor",
          "Repartir las tareas del hogar para que ninguno cargue con todo"
        ],
        Amor: [
          "Tener una salida romántica cada dos semanas, aunque sea simple",
          "Escaparse un fin de semana solos cada tanto",
          "Que cada uno mantenga su espacio propio y sus amistades"
        ]
      },
      medio: {
        Dinero: [
          "Ahorrar juntos para la entrada de nuestra primera propiedad",
          "Poder financiar un viaje largo juntos sin endeudarnos",
          "Tener estabilidad suficiente para que ambos podamos elegir mejor en el trabajo"
        ],
        Salud: [
          "Crear un hogar donde ambos podamos descansar de verdad",
          "Cuidarnos la salud mutuamente — ir al médico, hacerse los chequeos",
          "Estar estables antes de tomar decisiones grandes"
        ],
        Amor: [
          "Aprender a pelear bien — sin decir cosas que después no se pueden deshacer",
          "Empezar algo juntos — un proyecto, un hobby, algo que nos entusiasme a los dos",
          "Saber poner límites a las presiones familiares externas"
        ]
      },
      largo: {
        Dinero: [
          "Llegar a una situación donde los dos podamos trabajar menos si queremos",
          "Tener inversiones que nos den opciones cuando seamos mayores",
          "Dejar todo ordenado para cuidarnos mutuamente ante cualquier imprevisto"
        ],
        Salud: [
          "Llegar a los 60 con ganas de seguir explorando el mundo juntos",
          "Tener buena cobertura médica y usarla bien",
          "Haber construido una relación tan tranquila que nos haga bien a los dos"
        ],
        Amor: [
          "Seguir eligiéndonos después de todos los cambios que trae la vida",
          "Haber sido leales y presentes cuando más importaba",
          "Mirar atrás y saber que construimos algo real juntos"
        ]
      }
    },
    comunidad: {
      title: "Vínculos",
      corto: {
        Dinero: [
          "Ayudar a mis padres a ordenar sus finanzas si lo necesitan",
          "Separar algo cada mes para poder ayudar sin improvisación",
          "Contribuir a algo local — un club, una institución, lo que sea cercano"
        ],
        Salud: [
          "Acompañar a los adultos mayores de mi familia a sus turnos médicos",
          "Aprender a cuidar a otros sin descuidarme a mí mismo",
          "Buscar apoyo para procesar lo difícil de ver envejecer a quienes quiero"
        ],
        Amor: [
          "Visitar a mis mayores para conversar sin apuro",
          "Ser el que suma calma cuando hay conflictos familiares",
          "Ofrecer ayuda concreta a alguien cercano que la necesite"
        ]
      },
      medio: {
        Dinero: [
          "Ayudar a adaptar la casa de mis padres para que vivan más cómodos",
          "Involucrarme en alguna organización o causa que me importe",
          "Contratar ayuda para mis mayores si puedo, para aliviar la carga familiar"
        ],
        Salud: [
          "Cuidar mi fuerza física para poder ser un apoyo real para quienes lo necesitan",
          "Asegurarme de que mis mayores tengan lo que necesitan para estar bien",
          "Que mis padres tengan actividades y contacto social — no solo cuidados médicos"
        ],
        Amor: [
          "Documentar las historias de los mayores de mi familia antes de que se pierdan",
          "Organizar encuentros familiares regulares para que los vínculos no se diluyan",
          "Participar activamente en mi comunidad más cercana"
        ]
      },
      largo: {
        Dinero: [
          "Dejar el patrimonio familiar ordenado para evitar conflictos cuando no esté",
          "Que mis mayores puedan vivir su última etapa con dignidad y comodidad",
          "Poder apoyar causas que me importen sin que eso implique un sacrificio"
        ],
        Salud: [
          "Que mis seres queridos tengan los mejores cuidados posibles",
          "Cuidarme para no ser una carga prematura para los que vienen después",
          "Haber influido en los hábitos de mi familia con el ejemplo"
        ],
        Amor: [
          "Ser la persona de referencia y apoyo para mi entorno cuando más se necesita",
          "Que me recuerden por haber ayudado de verdad, no por haberlo prometido",
          "Despedir a quienes quiero con orgullo, habiendo estado presente"
        ]
      }
    }
  }
};

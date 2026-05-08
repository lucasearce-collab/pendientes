import { useState, useRef, useMemo, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── CONFIGURACIÓN DE SUPABASE ───────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── CONSTANTES DE DISEÑO Y DATOS ───────────────────────────────────────────
const AREAS = {
  trabajo:  { label: "Trabajo",       color: "#9B8878", dot: "#C4896A" },
  personal: { label: "Vida Personal", color: "#8A9E8A", dot: "#6B9E78" },
};

const SECTIONS = [
  { id: "hoy", label: "Hoy", subTabs: [{ id: "hoy", label: "Hoy" }, { id: "semana", label: "Semana" }] },
  { id: "metas", label: "Metas", subTabs: [{ id: "tareas", label: "Tareas" }, { id: "proyectos", label: "Proyectos" }, { id: "metas", label: "Metas" }] },
  { id: "progreso", label: "Progreso", subTabs: [{ id: "cerezo", label: "🌱" }, { id: "analitica", label: "Analítica" }] },
];

const ONBOARDING_DATA = [
  {
    id: 'largo',
    titulo: 'Largo Plazo (5+ años)',
    subtitulo: 'Tu Visión: Elegí tus nortes.',
    categorias: {
      dinero: ["Vivir de rentas / Libertad financiera", "Ser dueño de mi propio negocio", "Tener mi casa propia paga", "Ser un referente en mi profesión", "Comprarle una casa a mis viejos"],
      salud: ["Estado físico de atleta para siempre", "Paz mental innegociable", "Maestría en un hobby (música, arte)", "Recorrer el mundo sin fecha de vuelta"],
      amor: ["Formar mi propia familia", "Tener un grupo de amigos hermanos", "Ser un pilar de apoyo para mi entorno"]
    }
  },
  {
    id: 'mediano',
    titulo: 'Mediano Plazo (2-5 años)',
    subtitulo: 'Tu Construcción: ¿Qué bases vas a sentar?',
    categorias: {
      dinero: ["Cambiar a un trabajo mejor", "Comprar un auto o primer terreno", "Escalar mis ingresos significativamente", "Terminar mi carrera o especialización"],
      salud: ["Correr una maratón o gran desafío", "Sanar mi relación con la comida/cuerpo", "Tener el hábito de meditación firme", "Dedicarle 4 horas semanales a mi pasión"],
      amor: ["Encontrar una pareja para proyectar", "Mudanza a un hogar feliz", "Viajar con amigos o familia una vez al año", "Fortalecer el vínculo con mis hermanos"]
    }
  },
  {
    id: 'corto',
    titulo: 'Corto Plazo (Este año)',
    subtitulo: 'Tu Foco: ¿En qué ponés tu energía hoy?',
    categorias: {
      dinero: ["Armar mi fondo de emergencia", "Hacer un curso de una habilidad nueva", "Organizar mis finanzas y deudas", "Lanzar ese proyecto pendiente"],
      salud: ["Entrenar 3-4 veces por semana", "Dormir 7-8 horas de calidad siempre", "Hacer ese chequeo médico pendiente", "Aprender a cocinar recetas sanas"],
      amor: ["Cena semanal con familia sin pantallas", "Tener una cita especial por mes", "Llamar a mis padres más seguido", "Regalar una sorpresa a alguien"]
    }
  }
];

// ─── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [goals, setGoals] = useState([]);
  const [section, setSection] = useState("hoy");
  const [subView, setSubView] = useState("hoy");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    async function checkData() {
      const { data } = await supabase.from("goals").select("*").limit(1);
      if (!data || data.length === 0) {
        setOnboarding(true);
      }
      setLoading(false);
    }
    checkData();
  }, [session]);

  if (loading) return <div className="loader">◈ CLARITY</div>;
  if (!session) return <LoginScreen />;
  if (onboarding) return <OnboardingFlow uid={session.user.id} onComplete={() => setOnboarding(false)} />;

  return (
    <div className="app-container">
      <AppStyles />
      <nav className="sidebar">
        <div className="brand">Clarity</div>
        {SECTIONS.map(s => (
          <div key={s.id} className={`nav-item ${section === s.id ? 'active' : ''}`} onClick={() => setSection(s.id)}>
            {s.label}
          </div>
        ))}
      </nav>
      <main className="content">
        <header>
          <h1>{section.toUpperCase()}</h1>
        </header>
        {/* Aquí se renderizan los componentes de Tareas, Proyectos, etc. */}
      </main>
    </div>
  );
}

// ─── COMPONENTE ONBOARDING (ESTRATEGIA SALUD, DINERO, AMOR) ──────────────────
function OnboardingFlow({ uid, onComplete }) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState([]);
  const [customGoal, setCustomGoal] = useState("");
  const currentStep = ONBOARDING_DATA[step];

  const toggleChip = (text) => {
    setSelected(prev => prev.includes(text) ? prev.filter(t => t !== text) : [...prev, text]);
  };

  const handleNext = async () => {
    const horizon = currentStep.id;
    const toSave = selected.map(title => ({
      user_id: uid,
      title: title,
      horizon: horizon,
      status: 'active'
    }));

    if (customGoal.trim()) {
      toSave.push({ user_id: uid, title: customGoal.trim(), horizon: horizon, status: 'active' });
    }

    if (toSave.length > 0) {
      await supabase.from("goals").insert(toSave);
    }

    if (step < ONBOARDING_DATA.length - 1) {
      setStep(step + 1);
      setSelected([]);
      setCustomGoal("");
    } else {
      onComplete();
    }
  };

  return (
    <div className="onboarding-screen">
      <AppStyles />
      <div className="onboarding-card">
        <span className="step-indicator">ETAPA {step + 1} DE 3</span>
        <h2>{currentStep.titulo}</h2>
        <p className="subtitle">{currentStep.subtitulo}</p>

        {Object.entries(currentStep.categorias).map(([cat, items]) => (
          <div key={cat} className="category-group">
            <label>{cat === 'dinero' ? '💰 DINERO' : cat === 'salud' ? '🍎 SALUD' : '❤️ AMOR'}</label>
            <div className="chips-container">
              {items.map(item => (
                <div 
                  key={item} 
                  className={`chip ${selected.includes(item) ? 'active' : ''}`}
                  onClick={() => toggleChip(item)}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="custom-input-area">
          <input 
            type="text" 
            placeholder="¿Algo más específico? Escribilo acá..." 
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
          />
        </div>

        <button className="next-btn" onClick={handleNext}>
          {selected.length > 0 || customGoal ? "CONTINUAR" : "SALTAR ETAPA"}
        </button>
      </div>
    </div>
  );
}

// ─── COMPONENTES AUXILIARES ──────────────────────────────────────────────────
function LoginScreen() {
  return (
    <div className="login-screen">
      <AppStyles />
      <h1>Clarity</h1>
      <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}>
        Entrar con Google
      </button>
    </div>
  );
}

function AppStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');
      
      :root {
        --bg: #F5F2EE;
        --accent: #2C2825;
        --text-light: #B0AA9F;
        --chip-active: #F1E6E6; /* Rosa pálido */
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--accent); }

      .onboarding-screen {
        height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;
      }

      .onboarding-card {
        max-width: 500px; width: 100%; animation: fadeIn 0.5s ease;
      }

      .step-indicator { font-size: 10px; letter-spacing: 0.1em; color: var(--text-light); }
      h2 { font-size: 32px; font-weight: 300; margin: 10px 0; }
      .subtitle { color: var(--text-light); margin-bottom: 30px; }

      .category-group { margin-bottom: 25px; }
      .category-group label { font-size: 11px; font-weight: 500; display: block; margin-bottom: 12px; opacity: 0.6; }

      .chips-container { display: flex; flex-wrap: wrap; gap: 10px; }
      .chip {
        padding: 10px 18px; border-radius: 99px; background: #FFF; border: 1px solid #EAE6E0;
        font-size: 13px; cursor: pointer; transition: 0.2s;
      }
      .chip.active { background: var(--chip-active); border-color: #E5B7B7; }

      .custom-input-area input {
        width: 100%; padding: 15px; border: none; border-bottom: 1px solid #EAE6E0;
        background: transparent; font-family: inherit; outline: none; margin-top: 20px;
      }

      .next-btn {
        margin-top: 40px; width: 100%; padding: 18px; border: none;
        background: var(--accent); color: white; border-radius: 14px;
        font-weight: 500; letter-spacing: 0.05em; cursor: pointer;
      }

      .login-screen { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      
      @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    `}</style>
  );
}

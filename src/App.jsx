import { useState, useRef, useMemo, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Offline queue ───────────────────────────────────────────────────────────
const QUEUE_KEY = "pendientes_queue";

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)||"[]"); } catch { return []; }
}
function saveQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}

async function flushQueue() {
  const queue = loadQueue();
  if (!queue.length || !navigator.onLine) return;
  const failed = [];
  for (const op of queue) {
    try {
      if (op.type === "upsert") await supabase.from(op.table).upsert(op.data);
      else if (op.type === "delete") await supabase.from(op.table).delete().eq("id", op.id);
    } catch { failed.push(op); }
  }
  saveQueue(failed);
}

async function safeUpsert(table, data) {
  if (navigator.onLine) {
    const { error } = await supabase.from(table).upsert(data);
    if (error) { const q=loadQueue(); q.push({type:"upsert",table,data}); saveQueue(q); }
  } else {
    const q=loadQueue(); q.push({type:"upsert",table,data}); saveQueue(q);
  }
}

async function safeDelete(table, id) {
  if (navigator.onLine) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { const q=loadQueue(); q.push({type:"delete",table,id}); saveQueue(q); }
  } else {
    const q=loadQueue(); q.push({type:"delete",table,id}); saveQueue(q);
  }
}

async function trackEvent(eventType, entityId=null, entityType=null, metadata={}) {
  try {
    const { data:{ session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    await supabase.from("events").insert({
      user_id: session.user.id,
      event_type: eventType,
      entity_id: entityId || undefined,
      entity_type: entityType || undefined,
      metadata,
      occurred_at: new Date().toISOString(),
    });
  } catch(e) { console.warn("trackEvent failed:", e); }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const AREAS = {
  trabajo:  { label:"Trabajo",       color:"#9B8878", dot:"#C4896A" },
  personal: { label:"Vida Personal", color:"#8A9E8A", dot:"#6B9E78" },
};
const TASK_TYPE = {
  urgente:     { label:"Urgente",     color:"#C4896A", size:7,  ring:false },
  estrategica: { label:"Estratégica", color:"#5B6BAF", size:10, ring:true  },
  normal:      { label:"Normal",      color:null,      size:0,  ring:false },
};
const IMPORTANCE = {
  estrategica: { label:"Estratégico", color:"#5B6BAF", bg:"#F0F1F8" },
  urgente:     { label:"Prioritario", color:"#C49A7A", bg:"#FBF5F0" },
  normal:      { label:"Normal",      color:"#9B948C", bg:"#F5F3F1" },
};
const NAV = [
  { id:"hoy",       label:"Hoy",       icon:"◈" },
  { id:"tareas",    label:"Tareas",    icon:"☐" },
  { id:"proyectos", label:"Proyectos", icon:"⊞" },
  { id:"metas",     label:"Metas",     icon:"◎" },
  { id:"cerezo",    label:"🌱",         icon:"🌱" },
  { id:"analitica",  label:"◎",          icon:"◎" },
];

const HORIZONS = {
  anio:    { label:"Este año",  sub:"2025",    color:"#9B8878", bg:"#F5F1ED", ring:"#C4896A" },
  medio:   { label:"2–5 años", sub:"2026–30",  color:"#8A8EA8", bg:"#F1F2F5", ring:"#8A8EA8" },
  largo:   { label:"5+ años",  sub:"2031+",    color:"#5B6BAF", bg:"#F0F1F8", ring:"#5B6BAF" },
};

const goalToDb  = (g,uid) => ({ id:g.id, user_id:uid, title:g.title, description:g.description||"", horizon:g.horizon, parent_id:g.parentId||null, sort_order:g.sortOrder||0 });
const goalFromDb = r => ({ id:r.id, title:r.title, description:r.description||"", horizon:r.horizon, parentId:r.parent_id||null, sortOrder:r.sort_order||0 });

const todayStr   = () => new Date().toISOString().split("T")[0];
const tomorrow   = () => { const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; };
const nextMonday = () => { const d=new Date(); const diff=(8-d.getDay())%7||7; d.setDate(d.getDate()+diff); return d.toISOString().split("T")[0]; };
const isOverdue  = (date,done) => !done && date && date < todayStr();
const typeGroup  = t => { const tp=t.type||"normal"; if(tp==="estrategica") return 0; if(tp==="urgente") return 1; return 2; };
const dateGroup  = t => { const tod=todayStr(),tom=tomorrow(); if(!t.date) return 2; if(t.date<tod||t.date===tod||t.date===tom) return 0; return 1; };
const taskSort   = (a,b) => { if(a.done!==b.done) return a.done?1:-1; const dg=dateGroup(a)-dateGroup(b); if(dg!==0) return dg; const tg=typeGroup(a)-typeGroup(b); if(tg!==0) return tg; if(a.date&&b.date) return a.date<b.date?-1:a.date>b.date?1:0; return 0; };

const fmtDate = (d) => {
  if (!d) return "";
  const t = todayStr();
  if (d===t) return "Hoy";
  if (d===tomorrow()) return "Mañana";
  if (d<t) { const days=Math.round((new Date(t)-new Date(d))/86400000); return days===1?"Ayer":`Hace ${days}d`; }
  const [,m,day]=d.split("-"); return `${day}/${m}`;
};

const projToDb  = (p,uid) => ({ id:p.id, area:p.area, name:p.name, monto:p.monto||"", importance:p.importance||"normal", description:p.description||"", main_goal:p.mainGoal||"", secondary_goals:p.secondaryGoals||[], goal_id:p.goal_id||null, sort_order:p.sortOrder||0, user_id:uid });
const projFromDb = r => ({ id:r.id, area:r.area, name:r.name, monto:r.monto||"", importance:r.importance||"normal", description:r.description||"", mainGoal:r.main_goal||"", secondaryGoals:r.secondary_goals||[], goal_id:r.goal_id||null, sortOrder:r.sort_order||0 });
const taskToDb  = (t,uid) => ({ id:t.id, project_id:t.projectId, title:t.title, type:t.type||"normal", date:t.date||"", responsable:t.responsable||"", notes:t.notes||"", done:t.done||false, sort_order:t.sortOrder||0, user_id:uid });
const taskFromDb = r => ({ id:r.id, projectId:r.project_id, title:r.title, type:r.type||"normal", date:r.date||"", responsable:r.responsable||"", notes:r.notes||"", done:r.done||false, sortOrder:r.sort_order||0, completed_at:r.completed_at||null, snoozed_count:r.snoozed_count||0 });

function TypeDot({ type, done }) {
  const t = TASK_TYPE[type||"normal"];
  if (!t.color) return null;
  return <div style={{width:t.size,height:t.size,borderRadius:"50%",background:done?"#C8C3BB":t.color,flexShrink:0,boxShadow:(!done&&t.ring)?`0 0 0 2px white, 0 0 0 3.5px ${t.color}`:"none"}}/>;
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen() {
  const [loading, setLoading] = useState(false);
  async function login() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin }
    });
  }
  async function loginGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
  }
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F7F5F2",fontFamily:"'Lora',serif",flexDirection:"column",gap:32,padding:32}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,color:"#C8C3BB",marginBottom:16}}>◈</div>
        <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",letterSpacing:".14em",textTransform:"uppercase"}}>Clarity</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,width:"100%",maxWidth:280}}>
        <button onClick={login} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,background:"#2C2825",color:"white",border:"none",borderRadius:12,padding:"14px 28px",fontSize:14,fontFamily:"'DM Sans'",fontWeight:500,cursor:"pointer",opacity:loading?.6:1,width:"100%"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          {loading ? "Conectando..." : "Continuar con GitHub"}
        </button>
        <button onClick={loginGoogle} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,background:"white",color:"#2C2825",border:"1px solid #E5E1DB",borderRadius:12,padding:"14px 28px",fontSize:14,fontFamily:"'DM Sans'",fontWeight:500,cursor:"pointer",width:"100%"}}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continuar con Google
        </button>
      </div>
      <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#C8C3BB",textAlign:"center",fontStyle:"italic",lineHeight:1.7,maxWidth:220,margin:"0 auto"}}>
  "La calidad de tus pensamientos determina la calidad de tu vida."
  <div style={{fontStyle:"normal",fontSize:11,color:"#D5CFC8",marginTop:6,letterSpacing:".04em"}}>— Marco Aurelio</div>
</div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [session,  setSession]  = useState(null);
  const [authReady,setAuthReady]= useState(false);
  const [tasks,    setTasks]    = useState([]);
  const [projects, setProjects] = useState([]);
  const [goals,    setGoals]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [isDesktop,setIsDesktop]= useState(window.innerWidth>=768);
  const [view,     setView]     = useState("hoy");
  const [activeArea,setActiveArea]=useState("trabajo");
  const [activeProjId,setActiveProjId]=useState(null);
  const [sheet,    setSheet]    = useState(null);
  const [addSheet, setAddSheet] = useState(null);
  const [newProjSheet,setNewProjSheet]=useState(null);
  const [planSheet,setPlanSheet]=useState(null);
  const [goalSheet,setGoalSheet]=useState(null);
  const [swipedId, setSwipedId] = useState(null);
  const [celebrate, setCelebrate] = useState(null); // {type:'task'|'project', points:N}
  const [focusMode, setFocusMode] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [rescheduledCount, setRescheduledCount] = useState(0);
  const [points, setPoints] = useState(0);

  // Load points from Supabase only
  async function loadPoints(userId){
    const {data} = await supabase.from('user_profiles').select('points').eq('id',userId).single();
    if(data){
      setPoints(data.points||0);
    } else {
      // First time user - create profile with 0 points
      await supabase.from('user_profiles').insert({id:userId, points:0, updated_at:new Date().toISOString()});
      setPoints(0);
    }
    // Clean up any leftover localStorage
    localStorage.removeItem('clarity_points');
  }

  async function addPoints(n){
    setPoints(p=>p+n);
    if(session?.user?.id){
      await supabase.rpc('increment_points',{user_id:session.user.id, amount:n});
    }
  }

  const TREE_LEVELS = [
    {name:"Semilla",        min:0,      max:4999},
    {name:"Brote",          min:5000,   max:19999},
    {name:"Retoño",         min:20000,  max:59999},
    {name:"Cerezo en Flor", min:60000,  max:149999},
    {name:"Cerezo Maduro",  min:150000, max:399999},
    {name:"Cerezo Mayor",   min:400000, max:999999},
    {name:"Jindai Zakura",  min:1000000,max:Infinity},
  ];
  const currentLevel = TREE_LEVELS.findIndex((l,i)=>points>=l.min&&points<=l.max);
  const treeLevel = TREE_LEVELS[Math.max(0,currentLevel)];
  const touchStart = useRef(null);

  useEffect(()=>{
    const fn=()=>setIsDesktop(window.innerWidth>=768);
    window.addEventListener("resize",fn); return ()=>window.removeEventListener("resize",fn);
  },[]);

  useEffect(()=>{
    const onOnline=()=>{ setIsOnline(true); flushQueue(); };
    const onOffline=()=>setIsOnline(false);
    window.addEventListener("online",onOnline);
    window.addEventListener("offline",onOffline);
    return ()=>{ window.removeEventListener("online",onOnline); window.removeEventListener("offline",onOffline); };
  },[]);

  // Auth
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setSession(session); setAuthReady(true);
    });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_,session)=>{
      setSession(session);
    });
    return ()=>subscription.unsubscribe();
  },[]);

  // Load data
  useEffect(()=>{
    if (!session) { setLoading(false); return; }
    async function load() {
      setLoading(true);
      const [ps,ts,gs] = await Promise.all([
        supabase.from("projects").select("*").order("sort_order").order("created_at"),
        supabase.from("tasks").select("*").order("sort_order").order("created_at"),
        supabase.from("goals").select("*").order("sort_order").order("created_at"),
      ]);
      const userProjects=(ps.data||[]).map(projFromDb);
      const userTasks=(ts.data||[]).map(taskFromDb);
      const userGoals=(gs.data||[]).map(goalFromDb);
      setProjects(userProjects);
      setTasks(userTasks);
      setGoals(userGoals);
      setLoading(false);
      loadPoints(session.user.id);
      // Load rescheduled count for analytics
      supabase.from('events').select('id',{count:'exact'}).eq('user_id',session.user.id).eq('event_type','task_rescheduled').then(({count})=>setRescheduledCount(count||0));
      if(userProjects.length===0&&userTasks.length===0&&userGoals.length===0){
        setOnboarding(true);
      }
    }
    load();
  },[session]);

  if (!authReady) return <Loader/>;
  if (!session)   return <LoginScreen/>;
  if (loading)    return <Loader/>;

  const uid = session.user.id;
  const projectsForArea = a => projects.filter(p=>p.area===a);
  const tasksForProject = id => tasks.filter(t=>t.projectId===id);
  const overdueWork = tasks.filter(t=>{const p=projects.find(x=>x.id===t.projectId);return p?.area==="trabajo"&&isOverdue(t.date,t.done);}).sort(taskSort);
  const todayWork   = tasks.filter(t=>{const p=projects.find(x=>x.id===t.projectId);return p?.area==="trabajo"&&t.date===todayStr();}).sort(taskSort);
  const upcomingWork = tasks.filter(t=>{const p=projects.find(x=>x.id===t.projectId); if(!p||p.area!=="trabajo"||t.done) return false; return !t.date;}).sort(taskSort);

  async function addTask(task){
    const n={id:"t"+Date.now(),...task,done:false,notes:task.notes||"",responsable:task.responsable||"",sortOrder:tasks.length};
    setTasks(ts=>[n,...ts]); setAddSheet(null);
    await safeUpsert("tasks",taskToDb(n,uid));
  }
  async function toggleDone(id){
    const task=tasks.find(t=>t.id===id); if(!task) return;
    const u={...task,done:!task.done};
    setTasks(ts=>ts.map(t=>t.id===id?u:t)); setSwipedId(null);
    if(u.done){
      addPoints(500);
      const cel={type:'task',points:500};
      console.log('celebrate:', cel);
      setCelebrate(cel);
      setTimeout(()=>setCelebrate(null),2200);
      trackEvent("task_completed",id,"task",{type:task.type||"normal",projectId:task.projectId});
    }
    await safeUpsert("tasks",taskToDb(u,uid));
  }
  async function deleteTask(id){
    setTasks(ts=>ts.filter(t=>t.id!==id)); setSwipedId(null); setSheet(null);
    await safeDelete("tasks",id);
  }
  async function updateTask(u){
    const prev = tasks.find(t=>t.id===u.id);
    // Detect rescheduling: task was overdue and got a new future date
    if(prev&&prev.date&&u.date&&u.date>prev.date&&prev.date<todayStr()&&!u.done){
      trackEvent("task_rescheduled", u.id, "task", {
        oldDate: prev.date,
        newDate: u.date,
        projectId: u.projectId,
        type: u.type||"normal",
      });
    }
    setTasks(ts=>ts.map(t=>t.id===u.id?u:t)); setSheet(null);
    await safeUpsert("tasks",taskToDb(u,uid));
  }
  async function addProject(area,name){
    if(!name.trim()) return;
    const n={id:"p"+Date.now(),area,name:name.trim(),monto:"",importance:"normal",description:"",mainGoal:"",secondaryGoals:[]};
    setProjects(ps=>[...ps,n]); setNewProjSheet(null);
    await safeUpsert("projects",projToDb(n,uid));
  }
  async function updateProject(u){
    setProjects(ps=>ps.map(p=>p.id===u.id?u:p)); setPlanSheet(null);
    await safeUpsert("projects",projToDb(u,uid));
  }
  async function completeProject(pid){
    const proj=projects.find(p=>p.id===pid);
    if(!proj) return;
    const imp=proj.importance||"normal";
    const pts=imp==="estrategica"?10000:imp==="urgente"?7000:5000;
    addPoints(pts);
    setCelebrate({type:'project',points:pts,name:proj.name});
    setTimeout(()=>setCelebrate(null),3000);
    await supabase.from("projects").update({completed_at:new Date().toISOString()}).eq("id",pid);
    trackEvent("project_completed",pid,"project",{importance:imp,points:pts,name:proj.name,area:proj.area});
    setProjects(ps=>ps.filter(p=>p.id!==pid));
  }

  async function deleteProject(pid){
    setProjects(ps=>ps.filter(p=>p.id!==pid));
    setTasks(ts=>ts.filter(t=>t.projectId!==pid));
    if(activeProjId===pid) setActiveProjId(null);
    await safeDelete("tasks",pid); // project tasks
    await safeDelete("projects",pid);
  }
  async function reorderTasks(orderedIds){
    const map=Object.fromEntries(tasks.map(t=>[t.id,t]));
    const reordered=orderedIds.map((id,i)=>({...map[id],sortOrder:i})).filter(Boolean);
    setTasks(ts=>{const rest=ts.filter(t=>!orderedIds.includes(t.id));return[...reordered,...rest];});
    await Promise.all(reordered.map(t=>safeUpsert("tasks",taskToDb(t,uid))));
  }
  async function reorderProjects(orderedIds){
    const map=Object.fromEntries(projects.map(p=>[p.id,p]));
    const reordered=orderedIds.map((id,i)=>({...map[id],sortOrder:i})).filter(Boolean);
    setProjects(ps=>{const rest=ps.filter(p=>!orderedIds.includes(p.id));return[...reordered,...rest];});
    await Promise.all(reordered.map(p=>safeUpsert("projects",{...projToDb(p,uid),sort_order:p.sortOrder||0})));
  }
  async function reorderGoals(orderedIds){
    const map=Object.fromEntries(goals.map(g=>[g.id,g]));
    const reordered=orderedIds.map((id,i)=>({...map[id],sortOrder:i})).filter(Boolean);
    setGoals(gs=>{const rest=gs.filter(g=>!orderedIds.includes(g.id));return[...reordered,...rest];});
    await Promise.all(reordered.map(g=>safeUpsert("goals",{...goalToDb(g,uid),sort_order:g.sortOrder||0})));
  }
  async function completeGoal(gid){
    const goal=goals.find(g=>g.id===gid);
    if(!goal) return;
    addPoints(2000);
    setCelebrate({type:'project',points:2000,name:goal.title});
    setTimeout(()=>setCelebrate(null),3000);
    trackEvent("goal_completed", gid, "goal", {horizon:goal.horizon, title:goal.title});
    setGoals(gs=>gs.filter(g=>g.id!==gid));
    await safeDelete("goals",gid);
  }

  async function addGoal(g){
    addPoints(500);
    trackEvent("goal_created", g.id, "goal", {horizon:g.horizon});
    const n={id:"g"+Date.now(),...g};
    setGoals(gs=>[...gs,n]); setGoalSheet(null);
    await safeUpsert("goals",goalToDb(n,uid));
  }
  async function updateGoal(u){
    setGoals(gs=>gs.map(g=>g.id===u.id?u:g)); setGoalSheet(null);
    await safeUpsert("goals",goalToDb(u,uid));
  }
  async function deleteGoal(id){
    setGoals(gs=>gs.filter(g=>g.id!==id)); setGoalSheet(null);
    await safeDelete("goals",id);
  }
  async function signOut(){ await supabase.auth.signOut(); }

  function handleTouchStart(e,id){touchStart.current={x:e.touches[0].clientX,id};}
  function handleTouchEnd(e,id){
    if(!touchStart.current||touchStart.current.id!==id) return;
    const dx=e.changedTouches[0].clientX-touchStart.current.x;
    if(dx<-50) setSwipedId(id); else if(dx>20) setSwipedId(null);
    touchStart.current=null;
  }
  const sw={swipedId,setSwipedId,onTouchStart:handleTouchStart,onTouchEnd:handleTouchEnd};

  const sheets=(
    <>
      {sheet      &&<><div className="sheet-overlay" onClick={()=>setSheet(null)}/><EditSheet task={sheet} projects={projects} onSave={updateTask} onDelete={()=>deleteTask(sheet.id)} isDesktop={isDesktop}/></>}
      {addSheet   &&<><div className="sheet-overlay" onClick={()=>setAddSheet(null)}/><AddTaskSheet {...addSheet} onAdd={addTask} isDesktop={isDesktop}/></>}
      {newProjSheet&&<><div className="sheet-overlay" onClick={()=>setNewProjSheet(null)}/><NewProjectSheet area={newProjSheet.area} onAdd={addProject} isDesktop={isDesktop}/></>}
      {planSheet  &&<><div className="sheet-overlay" onClick={()=>setPlanSheet(null)}/><PlanProjectSheet project={planSheet} onSave={updateProject} isDesktop={isDesktop} goals={goals}/></>}
      {goalSheet  &&<><div className="sheet-overlay" onClick={()=>setGoalSheet(null)}/><GoalSheet goal={goalSheet} goals={goals} projects={projects} onSave={goalSheet.id?updateGoal:addGoal} onDelete={goalSheet.id?()=>deleteGoal(goalSheet.id):null} isDesktop={isDesktop}/></>}
    </>
  );

  const props={tasks,projects,goals,view,setView,focusMode,setFocusMode,points,treeLevel,TREE_LEVELS,celebrate,rescheduledCount,activeArea,setActiveArea,activeProjId,setActiveProjId,overdueWork,todayWork,upcomingWork,projectsForArea,tasksForProject,toggleDone,deleteTask,deleteProject,addTask,addProject,updateProject,reorderTasks,reorderProjects,reorderGoals,addGoal,updateGoal,deleteGoal,completeProject,completeGoal,setSheet,setAddSheet,setNewProjSheet,setPlanSheet,setGoalSheet,sw,sheets,signOut,isOnline};
  if(onboarding) return <OnboardingFlow uid={uid} supabase={supabase} onComplete={(gs,ps)=>{
    setGoals(gs.map(goalFromDb));
    setProjects(ps.map(projFromDb));
    setOnboarding(false);
    setView("metas");
  }} isDesktop={isDesktop}/>;
  return <>
    <AppLayout {...props} desktop={isDesktop}/>
    <CelebrationToast celebrate={celebrate}/>
  </>;
}

function Loader(){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F7F5F2",flexDirection:"column",gap:12}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>
      <div style={{fontSize:28,color:"#C8C3BB"}}>◈</div>
      <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#C8C3BB",letterSpacing:".08em"}}>cargando...</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESKTOP
// ═══════════════════════════════════════════════════════════════════════════════

function FocusProject({projects,tasksForProject,onToggle,onDelete,onOpen,onAddTask}){
  const [idx,setIdx]=useState(0);
  const touchStartX=useRef(0),touchStartY=useRef(0);

  useEffect(()=>{ if(idx>=projects.length) setIdx(Math.max(0,projects.length-1)); },[projects.length]);

  if(projects.length===0) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60vh",textAlign:"center",padding:"0 32px"}}>
      <div style={{fontFamily:"'DM Sans'",fontSize:14,color:"#C8C3BB"}}>Sin proyectos en esta área</div>
    </div>
  );

  const proj=projects[idx];
  const tasks=tasksForProject(proj.id).filter(t=>!t.done).sort(taskSort);
  const imp=IMPORTANCE[proj.importance||"normal"];

  function swipeStart(e){touchStartX.current=e.touches[0].clientX;touchStartY.current=e.touches[0].clientY;}
  function swipeEnd(e){
    const dx=e.changedTouches[0].clientX-touchStartX.current;
    const dy=Math.abs(e.changedTouches[0].clientY-touchStartY.current);
    if(dy>40) return;
    if(dx<-50&&idx<projects.length-1) setIdx(i=>i+1);
    if(dx>50&&idx>0) setIdx(i=>i-1);
  }

  return(
    <div style={{display:"flex",flexDirection:"column"}}>
      {/* Project card - centered, fills space */}
      <div style={{display:"flex",flexDirection:"column",padding:"8px 20px 16px"}}
        onTouchStart={swipeStart} onTouchEnd={swipeEnd}>
        
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:imp.color}}/>
            <span style={{fontFamily:"'DM Sans'",fontSize:11,color:imp.color,background:imp.bg,padding:"2px 8px",borderRadius:99}}>{imp.label}</span>
          </div>
          {proj.monto&&<span style={{fontFamily:"'DM Sans'",fontSize:13,color:"#9B8878",fontWeight:500}}>{proj.monto}</span>}
        </div>

        {/* Project name */}
        <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:22,fontWeight:300,color:"#2C2825",lineHeight:1.2,marginBottom:16}}>
          {proj.name}
        </div>

        {/* Tasks */}
        <div style={{background:"white",borderRadius:14,border:"1px solid #EAE6E0",overflow:"hidden",marginBottom:12}}>
          {tasks.length===0
            ?<div style={{padding:"32px 20px",textAlign:"center",fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",fontStyle:"italic"}}>Sin tareas pendientes</div>
            :tasks.map((task,i)=>(
              <div key={task.id} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderTop:i>0?"1px solid #F5F2EE":"none",cursor:"pointer"}}
                onClick={()=>onOpen(task)}>
                <button style={{width:24,height:24,borderRadius:"50%",border:"1.5px solid #C8C3BB",background:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
                  onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();particleBurst(r.left+r.width/2,r.top+r.height/2,11);onToggle(task.id);}}>
                </button>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'DM Sans'",fontSize:14,color:"#2C2825",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</div>
                  {(task.date||task.responsable)&&<div style={{display:"flex",gap:8,marginTop:2}}>
                    {task.date&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#9B948C"}}>{fmtDate(task.date)}</span>}
                    {task.responsable&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#8A9E8A"}}>→ {task.responsable}</span>}
                  </div>}
                </div>
                <TypeDot type={task.type} done={task.done}/>
              </div>
            ))
          }
          <div style={{padding:"10px 16px",borderTop:"1px solid #F5F2EE"}}>
            <button onClick={()=>onAddTask(proj)} style={{background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Sans'",fontSize:12,color:"#C8C3BB",padding:0}}>
              + agregar tarea
            </button>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px 24px"}}>
        <button onClick={()=>setIdx(i=>i-1)} disabled={idx===0}
          style={{background:"none",border:"none",cursor:idx===0?"default":"pointer",fontFamily:"'DM Sans'",fontSize:13,color:idx===0?"#E5E1DB":"#9B948C"}}>
          ← Anterior
        </button>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          {projects.map((_,i)=>(
            <div key={i} onClick={()=>setIdx(i)} style={{width:i===idx?14:6,height:6,borderRadius:99,background:i===idx?"#6B6258":"#E5E1DB",transition:"width .2s",cursor:"pointer"}}/>
          ))}
          <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",marginLeft:4}}>{idx+1}/{projects.length}</span>
        </div>
        <button onClick={()=>setIdx(i=>i+1)} disabled={idx===projects.length-1}
          style={{background:"none",border:"none",cursor:idx===projects.length-1?"default":"pointer",fontFamily:"'DM Sans'",fontSize:13,color:idx===projects.length-1?"#E5E1DB":"#9B948C"}}>
          Siguiente →
        </button>
      </div>
    </div>
  );
}

// ─── Focus Plan (Proyectos tab) ───────────────────────────────────────────────
function ProjectFocusView({projects,onEdit,onDelete,onComplete,desktop}){
  const [idx,setIdx]=useState(0);
  const [conf,setConf]=useState(false);
  const touchStartX=useRef(0),touchStartY=useRef(0);

  useEffect(()=>{setConf(false);},[idx]);
  useEffect(()=>{if(idx>=projects.length)setIdx(Math.max(0,projects.length-1));},[projects.length]);

  if(projects.length===0) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60vh",textAlign:"center",padding:"0 32px"}}>
      <div style={{fontFamily:"'DM Sans'",fontSize:14,color:"#C8C3BB"}}>Sin proyectos en esta área</div>
    </div>
  );

  const proj=projects[idx];
  const imp=IMPORTANCE[proj.importance||"normal"];

  function swipeStart(e){touchStartX.current=e.touches[0].clientX;touchStartY.current=e.touches[0].clientY;}
  function swipeEnd(e){
    const dx=e.changedTouches[0].clientX-touchStartX.current;
    const dy=Math.abs(e.changedTouches[0].clientY-touchStartY.current);
    if(dy>40) return;
    if(dx<-50&&idx<projects.length-1){setIdx(i=>i+1);setConf(false);}
    if(dx>50&&idx>0){setIdx(i=>i-1);setConf(false);}
  }

  const Dots = () => (
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      {projects.map((_,i)=>(
        <div key={i} onClick={()=>{setIdx(i);setConf(false);}}
          style={{width:i===idx?14:6,height:6,borderRadius:99,background:i===idx?"#6B6258":"#E5E1DB",transition:"width .2s",cursor:"pointer"}}/>
      ))}
      <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",marginLeft:4}}>{idx+1}/{projects.length}</span>
    </div>
  );

  const CardContent = () => (<>
    {proj.description&&<p style={{fontFamily:"'DM Sans'",fontSize:14,color:"#6B6258",marginBottom:16,lineHeight:1.6}}>{proj.description}</p>}
    {proj.mainGoal&&<div style={{marginBottom:proj.secondaryGoals?.length>0?16:0}}>
      <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase",marginBottom:4}}>Objetivo principal</div>
      <div style={{fontFamily:"'DM Sans'",fontSize:desktop?14:15,color:"#2C2825",fontWeight:500,lineHeight:1.4}}>{proj.mainGoal}</div>
    </div>}
    {proj.secondaryGoals?.length>0&&<div>
      <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase",marginBottom:8}}>Objetivos secundarios</div>
      {proj.secondaryGoals.map((g,i)=>(
        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
          <div style={{width:4,height:4,borderRadius:"50%",background:"#C8C3BB",flexShrink:0,marginTop:6}}/>
          <span style={{fontFamily:"'DM Sans'",fontSize:13,color:"#6B6258"}}>{g}</span>
        </div>
      ))}
    </div>}
    {!proj.description&&!proj.mainGoal&&<div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",fontStyle:"italic"}}>Sin objetivos definidos</div>}
  </>);

  const Nav = ({compact}) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:compact?"12px 0":"12px 20px 24px"}}>
      <button onClick={()=>{setIdx(i=>Math.max(i-1,0));setConf(false);}} disabled={idx===0}
        style={{background:"none",border:"none",cursor:idx===0?"default":"pointer",fontFamily:"'DM Sans'",fontSize:13,color:idx===0?"#E5E1DB":"#9B948C"}}>← Anterior</button>
      <Dots/>
      <button onClick={()=>{setIdx(i=>Math.min(i+1,projects.length-1));setConf(false);}} disabled={idx===projects.length-1}
        style={{background:"none",border:"none",cursor:idx===projects.length-1?"default":"pointer",fontFamily:"'DM Sans'",fontSize:13,color:idx===projects.length-1?"#E5E1DB":"#9B948C"}}>Siguiente →</button>
    </div>
  );

  if(desktop) return(
    <div style={{padding:"16px 20px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <Dots/>
        <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F"}}></span>
      </div>
      <div onTouchStart={swipeStart} onTouchEnd={swipeEnd}
        style={{background:"white",borderRadius:16,border:"1px solid #EAE6E0",overflow:"hidden",marginBottom:16}}>
        <div style={{height:3,background:imp?.color||"#E5E1DB"}}/>
        <div style={{padding:"20px"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
            <div>
              <div style={{fontFamily:"'Lora',serif",fontSize:20,fontWeight:500,color:"#2C2825",marginBottom:4}}>{proj.name}</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {proj.monto&&<span style={{fontFamily:"'DM Sans'",fontSize:13,color:"#9B8878",fontWeight:500}}>{proj.monto}</span>}
                {imp&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:imp.color,background:imp.bg,padding:"2px 8px",borderRadius:99}}>{imp.label}</span>}
              </div>
            </div>
            <button onClick={()=>onEdit(proj)} style={{background:"none",border:"1px solid #E5E1DB",borderRadius:8,padding:"6px 12px",fontFamily:"'DM Sans'",fontSize:12,color:"#B0AA9F",cursor:"pointer",flexShrink:0}}>Editar</button>
          </div>
          <CardContent/>
        </div>
      </div>
      <Nav compact/>
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column"}}>
      <div style={{flex:1,padding:"8px 20px"}} onTouchStart={swipeStart} onTouchEnd={swipeEnd}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <span style={{fontFamily:"'DM Sans'",fontSize:11,color:imp.color,background:imp.bg,padding:"3px 10px",borderRadius:99}}>{imp.label}</span>
          {proj.monto&&<span style={{fontFamily:"'DM Sans'",fontSize:13,color:"#9B8878",fontWeight:500}}>{proj.monto}</span>}
        </div>
        <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:22,fontWeight:300,color:"#2C2825",lineHeight:1.2,marginBottom:16}}>{proj.name}</div>
        <div style={{background:"white",borderRadius:14,border:"1px solid #EAE6E0",padding:"20px",marginBottom:12}}>
          <CardContent/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onEdit(proj)} style={{flex:1,background:"none",border:"1px solid #E5E1DB",borderRadius:10,padding:"11px",fontFamily:"'DM Sans'",fontSize:13,color:"#6B6258",cursor:"pointer"}}>Editar</button>
          {conf
            ?<><button onClick={()=>onDelete(proj.id)} style={{flex:1,background:"none",border:"1px solid #C4896A",borderRadius:10,padding:"11px",fontFamily:"'DM Sans'",fontSize:13,color:"#C4896A",cursor:"pointer"}}>Confirmar</button>
              <button onClick={()=>setConf(false)} style={{flex:1,background:"none",border:"1px solid #E5E1DB",borderRadius:10,padding:"11px",fontFamily:"'DM Sans'",fontSize:13,color:"#B0AA9F",cursor:"pointer"}}>✕</button></>
            :<button onClick={()=>setConf(true)} style={{flex:1,background:"none",border:"1px solid #E5E1DB",borderRadius:10,padding:"11px",fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",cursor:"pointer"}}>Eliminar</button>
          }
        </div>
      </div>
      <Nav/>
    </div>
  );
}




// ─── Focus Project Mode (Tareas) ─────────────────────────────────────────────
function FocusProjectMode({projects,tasksForProject,onToggle,onDelete,onOpen,onAddTask,desktop}){
  const [idx,setIdx]=useState(0);
  const touchStartX=useRef(0);

  const proj=projects[idx];
  const tasks=proj?tasksForProject(proj.id).filter(t=>!t.done).sort(taskSort):[];
  const imp=proj?IMPORTANCE[proj.importance||"normal"]:null;

  function handleSwipeStart(e){touchStartX.current=e.touches[0].clientX;}
  function handleSwipeEnd(e){
    const dx=e.changedTouches[0].clientX-touchStartX.current;
    if(dx<-50&&idx<projects.length-1)setIdx(i=>i+1);
    if(dx>50&&idx>0)setIdx(i=>i-1);
  }

  if(projects.length===0) return(
    <div style={{textAlign:"center",padding:"60px 20px",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14}}>Sin proyectos aún</div>
  );

  return(
    <div style={{padding:"16px 20px"}}>
      {/* Progress */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div style={{display:"flex",gap:4}}>
          {projects.map((_,i)=>(
            <div key={i} onClick={()=>setIdx(i)} style={{width:i===idx?18:6,height:6,borderRadius:99,background:i===idx?"#6B6258":"#E5E1DB",transition:"width .2s",cursor:"pointer"}}/>
          ))}
        </div>
        <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F"}}>{idx+1}/{projects.length}</span>
      </div>

      {/* Project card */}
      <div onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
        {/* Type + name header outside card */}
        <div style={{marginBottom:8}}>
          {imp&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:imp.color,fontWeight:500,marginBottom:2}}>{imp.label}</div>}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontFamily:"'Lora',serif",fontSize:22,fontWeight:500,color:"#2C2825"}}>{proj.name}</div>
            <button onClick={()=>onAddTask(proj)} style={{background:"none",border:"1px solid #E5E1DB",borderRadius:8,padding:"6px 12px",fontFamily:"'DM Sans'",fontSize:12,color:"#B0AA9F",cursor:"pointer",flexShrink:0,marginLeft:12}}>+ tarea</button>
          </div>
          {proj.monto&&<div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#9B8878",fontWeight:500,marginTop:2}}>{proj.monto}</div>}
        </div>

        {/* Tasks - adaptive card */}
        <div style={{background:"white",borderRadius:16,border:"1px solid #EAE6E0",marginBottom:16,overflow:"hidden"}}>
          {tasks.length===0
            ?<div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",fontStyle:"italic",padding:"16px 20px"}}>Sin tareas pendientes</div>
            :tasks.map((task,i)=>(
              <div key={task.id} onClick={()=>onOpen(task)}
                style={{display:"flex",alignItems:"center",gap:12,padding:"13px 20px",borderBottom:i<tasks.length-1?"1px solid #F5F2EE":"none",cursor:"pointer"}}>
                <button style={{width:22,height:22,borderRadius:"50%",border:"1.5px solid #C8C3BB",background:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
                  onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();particleBurst(r.left+r.width/2,r.top+r.height/2,11);onToggle(task.id);}}>
                </button>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'DM Sans'",fontSize:14,color:"#2C2825",lineHeight:1.4}}>{task.title}</div>
                  {(task.date||task.responsable)&&<div style={{display:"flex",gap:6,marginTop:2}}>
                    {task.date&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#9B948C"}}>{fmtDate(task.date)}</span>}
                    {task.responsable&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#8A9E8A"}}>→ {task.responsable}</span>}
                  </div>}
                </div>
                <TypeDot type={task.type} done={task.done}/>
              </div>
            ))
          }
        </div>
      </div>

      {/* Nav */}
      <div style={{display:"flex",justifyContent:"space-between",padding:desktop?"0":"0 20px"}}>
        <button onClick={()=>setIdx(i=>Math.max(i-1,0))} disabled={idx===0}
          style={{background:"none",border:"none",cursor:idx===0?"default":"pointer",fontFamily:"'DM Sans'",fontSize:13,color:idx===0?"#E5E1DB":"#9B948C"}}>← Anterior</button>
        <button onClick={()=>setIdx(i=>Math.min(i+1,projects.length-1))} disabled={idx===projects.length-1}
          style={{background:"none",border:"none",cursor:idx===projects.length-1?"default":"pointer",fontFamily:"'DM Sans'",fontSize:13,color:idx===projects.length-1?"#E5E1DB":"#9B948C"}}>Siguiente →</button>
      </div>
    </div>
  );
}

// ─── Focus Strategy Mode (Proyectos) ─────────────────────────────────────────

// ─── Grouped Projects View ────────────────────────────────────────────────────
function GroupedProjectsView({projects,tasksForProject,onToggle,onDelete,onOpen,onAddTask,onComplete,reorderTasks,sw,desktop}){
  const GROUPS = [
    {key:"urgente",     label:"Prioritarios", color:"#C49A7A", bg:"#FBF5F0"},
    {key:"estrategica", label:"Estratégicos",  color:"#5B6BAF", bg:"#F0F1F8"},
    {key:"normal",      label:"Normales",      color:"#9B948C", bg:"#F5F3F1"},
  ];
  const [open,setOpen]=useState({urgente:true,estrategica:true,normal:false});

  const ProjCard = ({proj}) => desktop
    ?<DProjBlock key={proj.id} project={proj} area={proj.area} tasks={tasksForProject(proj.id)}
        onToggle={onToggle} onOpen={onOpen} onComplete={onComplete}
        onAddTask={()=>onAddTask(proj)} reorderTasks={reorderTasks} sw={{swipedId:null,setSwipedId:()=>{}}}/>
    :<ProjBlock key={proj.id} project={proj} area={proj.area} tasks={tasksForProject(proj.id)}
        onToggle={onToggle} onDelete={onDelete} onOpen={onOpen}
        onAddTask={()=>onAddTask(proj)} reorderTasks={reorderTasks} {...(sw||{})}/>;

  if(desktop){
    const prioritarios = projects.filter(p=>(p.importance||"normal")==="urgente");
    const estrategicos = projects.filter(p=>(p.importance||"normal")==="estrategica");
    const normales     = projects.filter(p=>(p.importance||"normal")==="normal");
    const GroupHeader  = ({label,color}) => (
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0 8px",borderBottom:"1px solid #EAE6E0",marginBottom:4}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:color}}/>
        <span style={{fontFamily:"'DM Sans'",fontSize:11,fontWeight:500,letterSpacing:".1em",textTransform:"uppercase",color}}>{label}</span>
      </div>
    );
    return(
      <div>
        <div style={{display:"flex",gap:40,alignItems:"flex-start",marginBottom:normales.length>0?32:0}}>
          <div style={{flex:1,minWidth:0}}>
            {prioritarios.length>0?<><GroupHeader label="Prioritarios" color="#C49A7A"/>{prioritarios.map(p=><ProjCard key={p.id} proj={p}/>)}</>
              :<div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",padding:"20px 0"}}>Sin proyectos prioritarios</div>}
          </div>
          <div style={{width:1,background:"#EAE6E0",alignSelf:"stretch",flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            {estrategicos.length>0?<><GroupHeader label="Estratégicos" color="#5B6BAF"/>{estrategicos.map(p=><ProjCard key={p.id} proj={p}/>)}</>
              :<div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",padding:"20px 0"}}>Sin proyectos estratégicos</div>}
          </div>
        </div>
        {normales.length>0&&<>
          <div style={{height:1,background:"#EAE6E0",marginBottom:16}}/>
          <GroupHeader label="Normales" color="#9B948C"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {normales.map(p=><ProjCard key={p.id} proj={p}/>)}
          </div>
        </>}
      </div>
    );
  }

  return(
    <div>
      {GROUPS.map(g=>{
        const gprojects=projects.filter(p=>(p.importance||"normal")===g.key);
        if(gprojects.length===0) return null;
        const isOpen=open[g.key];
        const totalPending=gprojects.reduce((sum,p)=>sum+tasksForProject(p.id).filter(t=>!t.done).length,0);
        return(
          <div key={g.key} style={{marginBottom:4}}>
            <div onClick={()=>setOpen(o=>({...o,[g.key]:!o[g.key]}))}
              style={{display:"flex",alignItems:"center",gap:10,padding:"12px 20px",cursor:"pointer",userSelect:"none",borderBottom:"1px solid #EAE6E0"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:g.color,flexShrink:0}}/>
              <span style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:500,color:g.color,flex:1}}>{g.label}</span>
              {totalPending>0&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:g.color,background:g.bg,padding:"2px 8px",borderRadius:99}}>{totalPending}</span>}
              <span style={{fontFamily:"'DM Sans'",fontSize:14,color:"#C8C3BB",marginLeft:4}}>{isOpen?"▾":"›"}</span>
            </div>
            {isOpen&&gprojects.map(proj=><ProjCard key={proj.id} proj={proj}/>)}
          </div>
        );
      })}
    </div>
  );
}






// ─── Analitica View ───────────────────────────────────────────────────────────
function AnaliticaView({tasks, projects, goals, desktop, rescheduledCount=0}){
  const today = todayStr();

  // ── Week data ──
  const weekDays = [];
  for(let i=6;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    weekDays.push(d.toISOString().slice(0,10));
  }
  const DAY_LABELS = ['L','M','X','J','V','S','D'];

  const completedByDay = weekDays.map(d=>
    tasks.filter(t=>(t.completed_at&&t.completed_at.slice(0,10)===d)).length
  );
  const maxDay = Math.max(...completedByDay, 1);

  // ── Peak hour ──
  const hourCounts = Array(24).fill(0);
  tasks.filter(t=>t.completed_at).forEach(t=>{
    const h = new Date(t.completed_at).getHours();
    hourCounts[h]++;
  });
  const maxHour = Math.max(...hourCounts, 1);
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const peakLabel = peakHour===0?'12am':peakHour<12?`${peakHour}am`:peakHour===12?'12pm':`${peakHour-12}pm`;
  const hasHourData = tasks.some(t=>t.completed_at);

  // ── Tareas a tiempo ──
  const completedWithDate = tasks.filter(t=>t.done&&t.date);
  const onTime = completedWithDate.filter(t=>
    !t.completed_at || t.completed_at.slice(0,10)<=t.date
  ).length;
  const onTimePct = completedWithDate.length>0 ? Math.round((onTime/completedWithDate.length)*100) : null;

  // ── Tasa postergación ──
  const totalWithDate = tasks.filter(t=>t.date).length;
  const snoozeRate = totalWithDate>0 ? Math.round((rescheduledCount/totalWithDate)*100) : null;

  // ── CEO indicator ──
  const completedThisWeek = tasks.filter(t=>t.done&&(
    (t.completed_at&&t.completed_at.slice(0,10)>=weekDays[0]) || (!t.completed_at)
  ));
  const getImportance = t => {
    const p = projects.find(x=>x.id===t.projectId);
    return p ? (p.importance||'normal') : 'normal';
  };
  const estrategicas = completedThisWeek.filter(t=>getImportance(t)==='estrategica').length;
  const prioritarias = completedThisWeek.filter(t=>getImportance(t)==='urgente').length;
  const normales = completedThisWeek.filter(t=>getImportance(t)==='normal').length;
  const totalCEO = estrategicas+prioritarias+normales||1;
  const estrategicasPct = Math.round((estrategicas/totalCEO)*100);
  const prioritariasPct = Math.round((prioritarias/totalCEO)*100);
  const normalesPct = Math.round((normales/totalCEO)*100);

  // ── Salud ──
  const overdueCount = tasks.filter(t=>!t.done&&t.date&&t.date<today).length;
  const openPriority = projects.filter(p=>!p.completed_at&&(p.importance==='urgente'||p.importance==='estrategica')).length;
  const openTotal = projects.filter(p=>!p.completed_at).length;
  const cogLoadStatus = openPriority>=5?'red':openPriority>=3?'yellow':'green';
  const portfolioStatus = openTotal>15?'red':openTotal>10?'yellow':'green';

  const pad = '0';

  const SectionLabel = ({children, mt}) => (
    <div style={{fontFamily:"'DM Sans'",fontSize:10,fontWeight:500,letterSpacing:'.12em',textTransform:'uppercase',color:'#B0AA9F',marginBottom:14,marginTop:mt||28}}>
      {children}
    </div>
  );

  const noData = <span style={{fontFamily:"'DM Sans'",fontSize:11,color:'#D5CFC8',fontStyle:'italic'}}>Acumulando datos...</span>;

  return(
    <div style={{paddingBottom:48,padding:'0 20px 48px',fontFamily:"'DM Sans',sans-serif"}}>

      {/* ── Visión semanal ── */}
      <SectionLabel mt={0}>Visión semanal</SectionLabel>

      {/* Bar chart */}
      <div style={{background:'white',borderRadius:16,border:'1px solid #EAE6E0',padding:'20px 16px 16px',marginBottom:12,marginBottom:12}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
          <div>
            <div style={{fontSize:13,fontWeight:500,color:'#2C2825'}}>Tareas completadas</div>
            <div style={{fontFamily:"'DM Sans'",fontSize:11,color:'#B0AA9F',marginTop:2}}>Últimos 7 días</div>
          </div>
          {peakHour>0&&<div style={{fontSize:10,color:'#9B8878',background:'#F5F1ED',padding:'3px 8px',borderRadius:99}}>
            Pico: {peakLabel}
          </div>}
        </div>
        {/* Bars */}
        <div style={{display:'flex',alignItems:'flex-end',gap:8,height:80}}>
          {completedByDay.map((count,i)=>{
            const pct = (count/maxDay)*100;
            const isToday = weekDays[i]===today;
            return(
              <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                <div style={{flex:1,display:'flex',alignItems:'flex-end',width:'100%'}}>
                  <div style={{
                    width:'100%',borderRadius:'6px 6px 0 0',
                    height:Math.max(pct,4)+'%',
                    background:isToday?'#2C2825':pct>50?'#C4B5A5':'#EAE6E0',
                    position:'relative',
                  }}>
                    {count>0&&<span style={{
                      position:'absolute',top:-18,left:'50%',transform:'translateX(-50%)',
                      fontSize:10,color:'#9B8878',fontWeight:500,whiteSpace:'nowrap'
                    }}>{count}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Day labels */}
        <div style={{display:'flex',gap:8,marginTop:8}}>
          {weekDays.map((d,i)=>{
            const isToday = d===today;
            const dow = new Date(d+'T12:00:00').getDay();
            const label = ['D','L','M','X','J','V','S'][dow];
            return(
              <div key={i} style={{flex:1,textAlign:'center',fontSize:10,
                color:isToday?'#2C2825':'#C8C3BB',
                fontWeight:isToday?500:400,letterSpacing:'.06em',textTransform:'uppercase'}}>
                {label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hours heatmap */}
      <div style={{background:'white',borderRadius:16,border:'1px solid #EAE6E0',padding:'20px 16px 14px',marginBottom:12,marginBottom:12}}>
        <div style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:500,color:'#2C2825',marginBottom:4}}>Ventanas de claridad</div>
        <div style={{fontSize:11,color:'#B0AA9F',marginBottom:14}}>Horas de mayor ejecución</div>
        {hasHourData
          ? <>
            <div style={{display:'flex',gap:3,flexWrap:'nowrap'}}>
              {hourCounts.map((val,i)=>{
                const intensity = val/maxHour;
                const bg = intensity===0?'#F5F2EE':intensity<0.3?'#E8E2DB':intensity<0.6?'#C4B5A5':intensity<0.85?'#9B8878':'#2C2825';
                return(<div key={i} style={{flex:1,height:28,borderRadius:4,background:bg,minWidth:0}}/>);
              })}
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:6}}>
              {['6am','12pm','6pm','12am'].map(l=>(
                <span key={l} style={{fontSize:9,color:'#C8C3BB'}}>{l}</span>
              ))}
        {(()=>{
          const sh=Array(24).fill(0);
          tasks.filter(t=>t.done&&t.completed_at).forEach(t=>{
            const p=projects.find(x=>x.id===t.projectId);
            if(p&&p.importance==='estrategica') sh[new Date(t.completed_at).getHours()]++;
          });
          if(!sh.some(h=>h>0)) return null;
          const best=sh.indexOf(Math.max(...sh));
          const label=best===0?'12am':best<12?`${best}am`:best===12?'12pm':`${best-12}pm`;
          return <div style={{fontFamily:"'DM Sans'",fontSize:11,color:'#9B8878',marginTop:10,padding:'8px 12px',background:'#F5F1ED',borderRadius:8}}>
            ◈ Completás más tareas estratégicas a las <strong>{label}</strong> — protegé esa hora.
          </div>;
        })()}
            </div>
          </>
          : <div style={{fontFamily:"'DM Sans'",fontSize:11,color:'#D5CFC8',fontStyle:'italic',padding:'8px 0'}}>Acumulando datos...</div>
        }
      </div>

      {/* ── Rendimiento ── */}
      <SectionLabel>Rendimiento</SectionLabel>

      <div style={{display:'flex',gap:10,marginBottom:10,}}>
        <div style={{flex:1,background:'white',borderRadius:14,border:'1px solid #EAE6E0',padding:'16px 14px'}}>
          <div style={{fontSize:28,fontWeight:300,color:'#2C2825',letterSpacing:'-.02em',lineHeight:1,marginBottom:4}}>
            {onTimePct!==null?<>{onTimePct}<span style={{fontSize:16,color:'#B0AA9F'}}>%</span></>:noData}
          </div>
          <div style={{fontSize:11,color:'#B0AA9F',lineHeight:1.4}}>Tareas a tiempo</div>
          {onTimePct!==null&&<div style={{fontSize:10,marginTop:8,color:onTimePct>=70?'#8FAF8A':onTimePct>=50?'#C4A882':'#C4896A'}}>
            {onTimePct>=70?'↑ Buen ritmo':onTimePct>=50?'→ En proceso':'↓ Revisar fechas'}
          </div>}
        </div>
        <div style={{flex:1,background:'white',borderRadius:14,border:'1px solid #EAE6E0',padding:'16px 14px'}}>
          <div style={{fontSize:28,fontWeight:300,color:'#2C2825',letterSpacing:'-.02em',lineHeight:1,marginBottom:4}}>
            {snoozeRate!==null?<>{snoozeRate}<span style={{fontSize:16,color:'#B0AA9F'}}>%</span></>:noData}
          </div>
          <div style={{fontSize:11,color:'#B0AA9F',lineHeight:1.4}}>Postergación de tareas</div>
          {snoozeRate!==null&&<div style={{fontSize:10,marginTop:8,color:snoozeRate<=15?'#8FAF8A':snoozeRate<=35?'#C4A882':'#C4896A'}}>
            {snoozeRate<=15?'↑ Muy bajo':snoozeRate<=35?'→ Moderado':'↓ Alto'}
          </div>}
        </div>
      </div>

      {/* Velocidad de proyectos */}
      {(()=>{
        const closed = projects.filter(p=>p.completed_at&&p.created_at);
        if(closed.length===0) return null;
        const avgDays = Math.round(closed.reduce((acc,p)=>{
          return acc+(new Date(p.completed_at)-new Date(p.created_at))/(1000*60*60*24);
        },0)/closed.length);
        return(
          <div style={{background:'white',borderRadius:14,border:'1px solid #EAE6E0',padding:'16px 14px',marginBottom:10}}>
            <div style={{fontFamily:"'DM Sans'",fontSize:28,fontWeight:300,color:'#2C2825',letterSpacing:'-.02em',lineHeight:1,marginBottom:4}}>
              {avgDays}<span style={{fontFamily:"'DM Sans'",fontSize:16,color:'#B0AA9F'}}> días</span>
            </div>
            <div style={{fontFamily:"'DM Sans'",fontSize:11,color:'#B0AA9F',lineHeight:1.4}}>Velocidad de proyectos</div>
            <div style={{fontFamily:"'DM Sans'",fontSize:10,marginTop:8,color:'#C8C3BB'}}>{closed.length} proyecto{closed.length>1?'s':''} cerrado{closed.length>1?'s':''}</div>
          </div>
        );
      })()}

      {/* CEO indicator */}
      <div style={{background:'white',borderRadius:16,border:'1px solid #EAE6E0',padding:'20px 16px',marginBottom:10,marginBottom:10}}>
        <div style={{fontSize:13,fontWeight:500,color:'#2C2825',marginBottom:4}}>Indicador CEO</div>
        <div style={{fontSize:11,color:'#B0AA9F',marginBottom:18}}>¿Dónde está tu tiempo esta semana?</div>
        {totalCEO===1&&completedThisWeek.length===0
          ? <div style={{fontSize:12,color:'#D5CFC8'}}>Completá tareas esta semana para ver el indicador</div>
          : <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {[
              {label:'Estratégico',pct:estrategicasPct,color:'#5B6BAF'},
              {label:'Prioritario',pct:prioritariasPct,color:'#C49A7A'},
              {label:'Normal',pct:normalesPct,color:'#9B948C'},
            ].map(({label,pct,color})=>(
              <div key={label} style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:11,color,width:80,flexShrink:0}}>{label}</span>
                <div style={{flex:1,height:6,background:'#F5F2EE',borderRadius:99,overflow:'hidden'}}>
                  <div style={{height:'100%',width:pct+'%',background:color,opacity:.75,borderRadius:99,transition:'width .6s cubic-bezier(.34,1,.64,1)'}}/>
                </div>
                <span style={{fontSize:11,color:'#C8C3BB',width:32,textAlign:'right',flexShrink:0}}>{pct}%</span>
              </div>
            ))}
          </div>
        }
      </div>

      {/* ── Salud ── */}
      <SectionLabel>Salud del sistema</SectionLabel>

      {[
        {
          status: overdueCount===0?'green':overdueCount<=3?'yellow':'red',
          icon: overdueCount===0?'✓':overdueCount<=3?'⚡':'⚠',
          title: overdueCount===0?'Sin tareas vencidas':overdueCount<=3?'Tareas por actualizar':'Atención: tareas vencidas',
          value: overdueCount===0?'Todo al día — buen ritmo.'
            :overdueCount<=3?`${overdueCount} ${overdueCount===1?'tarea':'tareas'} con fecha vencida. Actualizá las fechas o completalas.`
            :`${overdueCount} tareas vencidas acumuladas. Revisá y reagendá para despejar el camino.`,
        },
        {
          status: cogLoadStatus,
          icon: cogLoadStatus==='green'?'✓':cogLoadStatus==='yellow'?'⚡':'⚠',
          title: cogLoadStatus==='green'?'Carga cognitiva saludable':cogLoadStatus==='yellow'?'Carga cognitiva elevada':'Carga cognitiva crítica',
          value: cogLoadStatus==='green'
            ?`${openPriority} proyectos de alta prioridad. Dentro del rango recomendado.`
            :cogLoadStatus==='yellow'
            ?`${openPriority} proyectos prioritarios/estratégicos abiertos. Considerá cerrar o delegar alguno.`
            :`${openPriority} proyectos de alta prioridad simultáneos. Demasiados frentes abiertos. Elegí los más importantes y pausá el resto.`,
        },
        {
          status: portfolioStatus,
          icon: portfolioStatus==='green'?'✓':portfolioStatus==='yellow'?'⚡':'⚠',
          title: portfolioStatus==='green'?'Portafolio equilibrado':portfolioStatus==='yellow'?'Portafolio amplio':'Portafolio sobrecargado',
          value: portfolioStatus==='green'
            ?`${openTotal} proyectos activos. Manejable y enfocado.`
            :portfolioStatus==='yellow'
            ?`${openTotal} proyectos activos. Estás cerca del límite para mantener claridad.`
            :`${openTotal} proyectos activos. Difícil avanzar en todos. Cerrá los que terminaron o no son prioridad ahora.`,
        },
      ].map(({status,icon,title,value})=>(
        <div key={title} style={{background:'white',borderRadius:14,border:'1px solid #EAE6E0',
          padding:'16px',marginBottom:10,display:'flex',alignItems:'flex-start',gap:14}}>
          <div style={{
            width:44,height:44,borderRadius:'50%',display:'flex',alignItems:'center',
            justifyContent:'center',fontSize:18,flexShrink:0,marginTop:2,
            background:status==='green'?'#F0F7EE':status==='yellow'?'#FBF8EE':'#FBF0EE',
          }}>{icon}</div>
          <div>
            <div style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:500,color:'#2C2825',marginBottom:4}}>{title}</div>
            <div style={{fontFamily:"'DM Sans'",fontSize:12,color:'#9B8878',lineHeight:1.6}}>{value}</div>
          </div>
        </div>
      ))}

    </div>
  );
}

// ─── Onboarding Flow ──────────────────────────────────────────────────────────
function OnboardingFlow({uid, supabase, onComplete, isDesktop}){
  const [step, setStep] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [data, setData] = useState({largo:[], medio:[], anio:[], proyectos:[]});
  const [input, setInput] = useState('');
  const [selectedMetaId, setSelectedMetaId] = useState(null);
  const [saving, setSaving] = useState(false);

  const COLORS = {largo:'#5B6BAF', medio:'#8A8EA8', anio:'#9B8878', proyecto:'#8FAF8A'};

  const STEPS = [
    {type:'terms'},
    {type:'intro'},
    {type:'metas', horizon:'largo', label:'5+ años', sub:'2031+', color:COLORS.largo, title:'Tu visión a largo plazo', q:'¿Dónde querés estar en 5 años o más? Empezá por lo grande.'},
    {type:'metas', horizon:'medio', label:'2–5 años', sub:'2026–30', color:COLORS.medio, title:'Tus metas de mediano plazo', q:'¿Qué necesitás lograr en los próximos 2 a 5 años para acercarte a esa visión?'},
    {type:'metas', horizon:'anio', label:'Este año', sub:'2025', color:COLORS.anio, title:'Tus metas para este año', q:'¿Qué querés conseguir este año? Esto es lo que vas a ejecutar en los próximos meses.'},
    {type:'proyectos', color:COLORS.proyecto, title:'Tus proyectos actuales', q:'¿En qué proyectos estás trabajando ahora? Relacioná cada uno con una meta de este año.'},
    {type:'done'},
  ];

  const totalSteps = 4; // metas (3) + proyectos (1)
  const stepNum = step <= 1 ? 0 : step - 1; // visible step number

  async function finish(){
    setSaving(true);
    const goalsToSave = [];
    ['largo','medio','anio'].forEach(h=>{
      (data[h]||[]).forEach((title,i)=>{
        goalsToSave.push({id:crypto.randomUUID(), user_id:uid, title, horizon:h, sort_order:i, created_at:new Date().toISOString()});
      });
    });
    const projectsToSave = data.proyectos.map((p,i)=>{
      const goal = p.metaId!==null ? goalsToSave.filter(g=>g.horizon==='anio')[p.metaId] : null;
      return {id:crypto.randomUUID(), user_id:uid, name:p.name, area:'Trabajo', importance:'normal', sort_order:i, goal_id:goal?goal.id:null, created_at:new Date().toISOString()};
    });
    if(goalsToSave.length>0) await supabase.from('goals').insert(goalsToSave);
    if(projectsToSave.length>0) await supabase.from('projects').insert(projectsToSave);
    // Save terms acceptance
    await supabase.from('user_profiles').upsert({id:uid, terms_accepted:true, terms_accepted_at:new Date().toISOString()});
    onComplete(goalsToSave, projectsToSave);
  }

  function addItem(horizon){
    if(!input.trim()) return;
    setData(d=>({...d, [horizon]:[...d[horizon], input.trim()]}));
    setInput('');
  }

  function removeItem(horizon, i){
    setData(d=>({...d, [horizon]:d[horizon].filter((_,j)=>j!==i)}));
  }

  function addProyecto(){
    if(!input.trim()) return;
    const metaTitle = selectedMetaId!==null && data.anio[selectedMetaId] ? data.anio[selectedMetaId] : null;
    setData(d=>({...d, proyectos:[...d.proyectos, {name:input.trim(), metaId:selectedMetaId, metaTitle}]}));
    setInput('');
  }

  function removeProyecto(i){
    setData(d=>({...d, proyectos:d.proyectos.filter((_,j)=>j!==i)}));
  }

  const s = STEPS[step];
  const bg = '#F5F2EE';
  const pct = step<=1?0:step===STEPS.length-1?100:Math.round(((step-1)/totalSteps)*100);

  // ── TERMS ──
  if(s.type==='terms') return(
    <div style={{minHeight:'100vh',background:bg,display:'flex',flexDirection:'column',fontFamily:"'DM Sans',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');*{box-sizing:border-box;}body{background:#F5F2EE!important;overflow:auto!important;}`}</style>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'52px 24px 0'}}>
        <span style={{fontSize:9,letterSpacing:'.22em',textTransform:'uppercase',color:'#C8C3BB'}}>Clarity</span>
      </div>
      <div style={{flex:1,padding:'32px 24px 0'}}>
        <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:14}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:'#9B8878'}}/>
          <span style={{fontSize:10,fontWeight:500,letterSpacing:'.12em',textTransform:'uppercase',color:'#9B8878'}}>Antes de empezar</span>
        </div>
        <div style={{fontSize:26,fontWeight:300,color:'#2C2825',letterSpacing:'-.02em',marginBottom:8}}>Términos de uso</div>
        <div style={{fontSize:13,color:'#B0AA9F',lineHeight:1.65,marginBottom:20}}>Clarity es una herramienta de gestión personal. Al continuar aceptás las siguientes condiciones.</div>
        <div style={{background:'white',borderRadius:14,border:'1px solid #EAE6E0',padding:20,marginBottom:16,maxHeight:200,overflowY:'auto'}}>
          {[
            {title:'Propiedad intelectual', text:'Clarity, su diseño, nombre, sistema de niveles y toda la propiedad intelectual asociada pertenecen exclusivamente a su creador. Está prohibida su reproducción, copia o distribución sin autorización expresa.'},
            {title:'Tus datos', text:'Tus metas, proyectos y tareas son privados. Nunca los compartiremos con terceros ni los utilizaremos con fines comerciales.'},
            {title:'Versión Beta', text:'Clarity está en desarrollo activo. Podés encontrar bugs o cambios. Agradecemos tu feedback para mejorar la app.'},
            {title:'Uso personal', text:'Esta versión beta es de uso personal y no comercial. El acceso puede ser revocado en cualquier momento durante el período beta.'},
          ].map(({title,text})=>(
            <div key={title} style={{marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:500,color:'#9B8878',marginBottom:6}}>{title}</div>
              <div style={{fontSize:12,color:'#B0AA9F',lineHeight:1.7}}>{text}</div>
            </div>
          ))}
        </div>
        <div onClick={()=>setTermsAccepted(a=>!a)}
          style={{display:'flex',alignItems:'flex-start',gap:12,cursor:'pointer',padding:16,background:'white',borderRadius:12,border:`1px solid ${termsAccepted?'#9B8878':'#EAE6E0'}`,marginBottom:12,transition:'border-color .2s'}}>
          <div style={{width:20,height:20,borderRadius:6,border:`1.5px solid ${termsAccepted?'#2C2825':'#C8C3BB'}`,background:termsAccepted?'#2C2825':'transparent',flexShrink:0,marginTop:1,display:'flex',alignItems:'center',justifyContent:'center',transition:'all .2s'}}>
            {termsAccepted&&<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          <span style={{fontSize:13,color:'#2C2825',lineHeight:1.5}}>Leí y acepto los Términos de Uso de Clarity</span>
        </div>
        <button onClick={()=>termsAccepted&&setStep(1)} disabled={!termsAccepted}
          style={{width:'100%',background:termsAccepted?'#2C2825':'#C8C3BB',color:'white',border:'none',borderRadius:12,padding:14,fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,cursor:termsAccepted?'pointer':'not-allowed',transition:'all .3s'}}>
          Continuar →
        </button>
      </div>
    </div>
  );

  // ── INTRO ──
  if(s.type==='intro') return(
    <div style={{minHeight:'100vh',background:bg,display:'flex',flexDirection:'column',fontFamily:"'DM Sans',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');*{box-sizing:border-box;}body{background:#F5F2EE!important;overflow:auto!important;}`}</style>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'52px 24px 0'}}>
        <span style={{fontSize:9,letterSpacing:'.22em',textTransform:'uppercase',color:'#C8C3BB'}}>Clarity</span>
      </div>
      <div style={{flex:1,padding:'32px 24px 0'}}>
        <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:14}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:'#C4A882'}}/>
          <span style={{fontSize:10,fontWeight:500,letterSpacing:'.12em',textTransform:'uppercase',color:'#C4A882'}}>Bienvenido</span>
        </div>
        <div style={{fontSize:26,fontWeight:300,color:'#2C2825',letterSpacing:'-.02em',marginBottom:8}}>Clarity funciona en capas</div>
        <div style={{fontSize:13,color:'#B0AA9F',lineHeight:1.65,marginBottom:24}}>Todo se conecta. Tus tareas diarias existen para avanzar proyectos, que a su vez existen para lograr metas. Vamos a construir ese árbol juntos.</div>
        <div style={{background:'white',borderRadius:14,border:'1px solid #EAE6E0',padding:20,marginBottom:24}}>
          {[
            {icon:'🎯', color:'#EEF0F8', titleColor:'#5B6BAF', title:'Metas de vida', desc:'Tu visión a largo, mediano y corto plazo'},
            {icon:'📁', color:'#EEF6EE', titleColor:'#8FAF8A', title:'Proyectos', desc:'Iniciativas concretas que avanzás semana a semana'},
            {icon:'✓', color:'#F5F1ED', titleColor:'#9B8878', title:'Tareas', desc:'Las acciones concretas de tu día a día'},
          ].map(({icon,color,titleColor,title,desc},i,arr)=>(
            <React.Fragment key={title}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:32,height:32,borderRadius:8,background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>{icon}</div>
                <div>
                  <div style={{fontSize:12,fontWeight:500,color:titleColor,marginBottom:1}}>{title}</div>
                  <div style={{fontSize:11,color:'#B0AA9F',lineHeight:1.4}}>{desc}</div>
                </div>
              </div>
              {i<arr.length-1&&(
                <div style={{display:'flex',alignItems:'center',gap:8,margin:'10px 0',padding:'0 4px'}}>
                  <div style={{width:32,display:'flex',justifyContent:'center'}}><div style={{width:1,height:14,background:'#EAE6E0'}}/></div>
                  <div style={{flex:1,display:'flex',alignItems:'center',gap:8}}>
                    <div style={{flex:1,height:1,background:'#EAE6E0'}}/>
                    <span style={{fontSize:10,color:'#C8C3BB'}}>{i===0?'impulsan':'se ejecutan en'}</span>
                    <div style={{flex:1,height:1,background:'#EAE6E0'}}/>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
        <div style={{fontSize:12,color:'#C8C3BB',textAlign:'center',lineHeight:1.6}}>Cada tarea que completás hace avanzar un proyecto.<br/>Cada proyecto completado acerca una meta.</div>
      </div>
      <div style={{padding:'16px 24px 36px',display:'flex',justifyContent:'space-between'}}>
        <button onClick={()=>setStep(0)} style={{background:'none',border:'none',cursor:'pointer',fontFamily:"'DM Sans'",fontSize:13,color:'#C8C3BB'}}>← Anterior</button>
        <button onClick={()=>setStep(2)} style={{background:'#2C2825',color:'white',border:'none',borderRadius:12,padding:'13px 26px',fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,cursor:'pointer'}}>Empezar →</button>
      </div>
    </div>
  );

  // ── METAS ──
  if(s.type==='metas'){
    const items = data[s.horizon]||[];
    return(
      <div style={{minHeight:'100vh',background:bg,display:'flex',flexDirection:'column',fontFamily:"'DM Sans',sans-serif"}}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');*{box-sizing:border-box;}body{background:#F5F2EE!important;overflow:auto!important;}`}</style>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'52px 24px 0'}}>
          <span style={{fontSize:9,letterSpacing:'.22em',textTransform:'uppercase',color:'#C8C3BB'}}>Clarity</span>
          <span style={{fontSize:11,color:'#C8C3BB'}}>{stepNum} de {totalSteps}</span>
        </div>
        <div style={{margin:'16px 24px 0',height:2,background:'#EAE6E0',borderRadius:99,overflow:'hidden'}}>
          <div style={{height:'100%',width:pct+'%',background:'linear-gradient(to right,#C4A882,#9B8878)',borderRadius:99,transition:'width .5s cubic-bezier(.34,1,.64,1)'}}/>
        </div>
        <div style={{flex:1,padding:'32px 24px 0'}}>
          <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:14}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:s.color}}/>
            <span style={{fontSize:10,fontWeight:500,letterSpacing:'.12em',textTransform:'uppercase',color:s.color}}>{s.label}</span>
            <span style={{fontSize:10,color:'#C8C3BB'}}>{s.sub}</span>
          </div>
          <div style={{fontSize:26,fontWeight:300,color:'#2C2825',letterSpacing:'-.02em',marginBottom:8}}>{s.title}</div>
          <div style={{fontSize:13,color:'#B0AA9F',lineHeight:1.65,marginBottom:24}}>{s.q}</div>
          <div style={{display:'flex',gap:8,marginBottom:14}}>
            <input value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&addItem(s.horizon)}
              style={{flex:1,padding:'13px 16px',borderRadius:12,border:'1px solid #E5E1DB',background:'white',fontFamily:"'DM Sans'",fontSize:14,color:'#2C2825',outline:'none'}}
              placeholder="Escribí una meta..." autoFocus/>
            <button onClick={()=>addItem(s.horizon)} disabled={!input.trim()}
              style={{width:46,borderRadius:12,border:'none',background:'#2C2825',color:'white',fontSize:18,cursor:input.trim()?'pointer':'not-allowed',opacity:input.trim()?1:.25,flexShrink:0}}>+</button>
          </div>
          {items.length>0&&(
            <div style={{background:'white',borderRadius:14,border:'1px solid #EAE6E0',overflow:'hidden',marginBottom:20}}>
              {items.map((item,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',borderBottom:i<items.length-1?'1px solid #F5F2EE':'none'}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:s.color,flexShrink:0}}/>
                  <span style={{flex:1,fontSize:14,color:'#2C2825'}}>{item}</span>
                  <button onClick={()=>removeItem(s.horizon,i)} style={{background:'none',border:'none',cursor:'pointer',color:'#D5CFC8',fontSize:18,lineHeight:1}}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{padding:'16px 24px 36px',display:'flex',justifyContent:'space-between'}}>
          <button onClick={()=>setStep(step-1)} style={{background:'none',border:'none',cursor:'pointer',fontFamily:"'DM Sans'",fontSize:13,color:'#C8C3BB'}}>← Anterior</button>
          <button onClick={()=>setStep(step+1)}
            style={{background:items.length===0?'#9B8878':'#2C2825',color:'white',border:'none',borderRadius:12,padding:'13px 26px',fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,cursor:'pointer'}}>
            {items.length===0?'Saltar →':'Siguiente →'}
          </button>
        </div>
      </div>
    );
  }

  // ── PROYECTOS ──
  if(s.type==='proyectos'){
    const metasAnio = data.anio||[];
    return(
      <div style={{minHeight:'100vh',background:bg,display:'flex',flexDirection:'column',fontFamily:"'DM Sans',sans-serif"}}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');*{box-sizing:border-box;}body{background:#F5F2EE!important;overflow:auto!important;}`}</style>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'52px 24px 0'}}>
          <span style={{fontSize:9,letterSpacing:'.22em',textTransform:'uppercase',color:'#C8C3BB'}}>Clarity</span>
          <span style={{fontSize:11,color:'#C8C3BB'}}>{stepNum} de {totalSteps}</span>
        </div>
        <div style={{margin:'16px 24px 0',height:2,background:'#EAE6E0',borderRadius:99,overflow:'hidden'}}>
          <div style={{height:'100%',width:'100%',background:'linear-gradient(to right,#C4A882,#9B8878)',borderRadius:99,transition:'width .5s'}}/>
        </div>
        <div style={{flex:1,padding:'32px 24px 0'}}>
          <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:14}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:s.color}}/>
            <span style={{fontSize:10,fontWeight:500,letterSpacing:'.12em',textTransform:'uppercase',color:s.color}}>Proyectos</span>
          </div>
          <div style={{fontSize:26,fontWeight:300,color:'#2C2825',letterSpacing:'-.02em',marginBottom:8}}>{s.title}</div>
          <div style={{fontSize:13,color:'#B0AA9F',lineHeight:1.65,marginBottom:20}}>
            {metasAnio.length>0?'Relacioná cada proyecto con la meta de este año que impulsa.':s.q}
          </div>
          <div style={{display:'flex',gap:8,marginBottom:14}}>
            <input value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&addProyecto()}
              style={{flex:1,padding:'13px 16px',borderRadius:12,border:'1px solid #E5E1DB',background:'white',fontFamily:"'DM Sans'",fontSize:14,color:'#2C2825',outline:'none'}}
              placeholder="Nombre del proyecto..." autoFocus/>
            <button onClick={addProyecto} disabled={!input.trim()}
              style={{width:46,borderRadius:12,border:'none',background:'#2C2825',color:'white',fontSize:18,cursor:input.trim()?'pointer':'not-allowed',opacity:input.trim()?1:.25,flexShrink:0}}>+</button>
          </div>
          {metasAnio.length>0&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:500,letterSpacing:'.1em',textTransform:'uppercase',color:'#B0AA9F',marginBottom:8}}>Relacionar con meta de este año</div>
              <div style={{background:'white',borderRadius:12,border:'1px solid #EAE6E0',overflow:'hidden'}}>
                {[{id:null,title:'Sin relacionar'},...metasAnio.map((m,i)=>({id:i,title:m}))].map(({id,title})=>(
                  <div key={id??'none'} onClick={()=>setSelectedMetaId(id)}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'1px solid #F5F2EE',cursor:'pointer',background:selectedMetaId===id?'#F5F1ED':'transparent',transition:'background .15s'}}>
                    <div style={{width:16,height:16,borderRadius:'50%',border:`1.5px solid ${selectedMetaId===id?'#9B8878':'#C8C3BB'}`,background:selectedMetaId===id?'#9B8878':'transparent',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .2s',flexShrink:0}}>
                      {selectedMetaId===id&&<div style={{width:6,height:6,borderRadius:'50%',background:'white'}}/>}
                    </div>
                    <span style={{fontSize:13,color:id===null?'#B0AA9F':'#2C2825'}}>{title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.proyectos.length>0&&(
            <div style={{background:'white',borderRadius:14,border:'1px solid #EAE6E0',overflow:'hidden',marginBottom:20}}>
              {data.proyectos.map((p,i)=>(
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'13px 16px',borderBottom:i<data.proyectos.length-1?'1px solid #F5F2EE':'none'}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:s.color,flexShrink:0,marginTop:5}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,color:'#2C2825'}}>{p.name}</div>
                    {p.metaTitle?<div style={{fontSize:11,color:'#B0AA9F',marginTop:2}}>→ {p.metaTitle}</div>:<div style={{fontSize:11,color:'#EAE6E0',marginTop:2}}>Sin meta asignada</div>}
                  </div>
                  <button onClick={()=>removeProyecto(i)} style={{background:'none',border:'none',cursor:'pointer',color:'#D5CFC8',fontSize:18,lineHeight:1}}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{padding:'16px 24px 12px',display:'flex',justifyContent:'space-between'}}>
          <button onClick={()=>setStep(step-1)} style={{background:'none',border:'none',cursor:'pointer',fontFamily:"'DM Sans'",fontSize:13,color:'#C8C3BB'}}>← Anterior</button>
          <button onClick={()=>data.proyectos.length>0?setStep(step+1):setStep(step+1)}
            style={{background:data.proyectos.length===0?'#9B8878':'#2C2825',color:'white',border:'none',borderRadius:12,padding:'13px 26px',fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,cursor:'pointer'}}>
            {data.proyectos.length===0?'Saltar →':'Empezar →'}
          </button>
        </div>
        <div style={{textAlign:'center',paddingBottom:24}}>
          <button onClick={()=>onComplete([],[])} style={{background:'none',border:'none',cursor:'pointer',fontFamily:"'DM Sans'",fontSize:12,color:'#C8C3BB',textDecoration:'underline',textUnderlineOffset:2}}>
            Prefiero empezar desde cero
          </button>
        </div>
      </div>
    );
  }

  // ── DONE ──
  const totalMetas = (data.largo||[]).length + (data.medio||[]).length + (data.anio||[]).length;
  const totalProyectos = (data.proyectos||[]).length;
  const relacionados = (data.proyectos||[]).filter(p=>p.metaId!==null).length;

  return(
    <div style={{minHeight:'100vh',background:bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',sans-serif",padding:32,textAlign:'center'}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');*{box-sizing:border-box;}body{background:#F5F2EE!important;}`}</style>
      <div style={{fontSize:40,marginBottom:20}}>🌱</div>
      <div style={{fontSize:28,fontWeight:300,color:'#2C2825',letterSpacing:'-.02em',marginBottom:8}}>Tu árbol está listo</div>
      <div style={{fontSize:14,color:'#B0AA9F',lineHeight:1.7,marginBottom:8,maxWidth:280}}>
        {totalMetas} meta{totalMetas!==1?'s':''} · {totalProyectos} proyecto{totalProyectos!==1?'s':''}
        {relacionados>0?` · ${relacionados} relacion${relacionados!==1?'es':''}`:''}.
      </div>
      <div style={{fontSize:12,color:'#C8C3BB',lineHeight:1.7,maxWidth:260,marginBottom:32}}>
        Ahora podés agregar tareas desde la tab Tareas y asignarlas a cada proyecto. Cada tarea completada suma puntos y hace crecer tu cerezo.
      </div>
      {saving
        ?<div style={{fontSize:14,color:'#B0AA9F'}}>Guardando...</div>
        :<button onClick={finish} style={{background:'#2C2825',color:'white',border:'none',borderRadius:12,padding:'14px 36px',fontFamily:"'DM Sans'",fontSize:15,fontWeight:500,cursor:'pointer'}}>
          Entrar a Clarity →
        </button>
      }
    </div>
  );
}


function CelebrationToast({celebrate}){
  if(!celebrate) return null;
  const isProject = celebrate.type==='project';
  return(
    <div style={{
      position:"fixed",
      bottom:96,
      left:"50%",
      transform:"translateX(-50%)",
      background:isProject?"#2C2825":"#FFFFFF",
      color:isProject?"#FFFFFF":"#2C2825",
      borderRadius:14,
      padding:"12px 20px",
      boxShadow:"0 4px 20px rgba(0,0,0,0.15)",
      fontFamily:"'DM Sans',sans-serif",
      fontSize:14,
      fontWeight:500,
      zIndex:99999,
      pointerEvents:"none",
      whiteSpace:"nowrap",
      border:isProject?"none":"1px solid #EAE6E0",
    }}>
      {isProject?"🌸 ":"✓ "}{isProject?celebrate.name:"Tarea completada"} · <span style={{fontWeight:300,opacity:.7}}>+{celebrate.points.toLocaleString()} pts</span>
    </div>
  );
}


// ─── Particle Burst ───────────────────────────────────────────────────────────
const BURST_COLORS = ['#E8B4C0','#9B8878','#8FAF8A','#C49A7A','#5B6BAF','#D4896A','#B0AA9F'];
// Inject particle CSS once into document head
function particleBurst(x, y, count=11){
  for(let i=0;i<count;i++){
    const p = document.createElement('div');
    const angle = (Math.PI*2/count)*i + Math.random()*.5;
    const dist = 28 + Math.random()*36;
    const tx = Math.round(Math.cos(angle)*dist);
    const ty = Math.round(Math.sin(angle)*dist - 14);
    const size = Math.round(5 + Math.random()*5);
    const color = BURST_COLORS[i%BURST_COLORS.length];
    const delay = Math.round(Math.random()*60);
    p.style.position = 'fixed';
    p.style.left = (x - size/2) + 'px';
    p.style.top = (y - size/2) + 'px';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.background = color;
    p.style.borderRadius = '50%';
    p.style.pointerEvents = 'none';
    p.style.zIndex = '999999';
    p.style.transition = `transform ${550+delay}ms cubic-bezier(.25,.46,.45,.94), opacity ${550+delay}ms ease`;
    p.style.transform = 'translate(0,0) scale(1)';
    p.style.opacity = '1';
    document.body.appendChild(p);
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        p.style.transform = `translate(${tx}px,${ty}px) scale(0)`;
        p.style.opacity = '0';
      });
    });
    setTimeout(()=>{ if(p.parentNode) p.remove(); }, 650);
  }
}

// ─── Cerezo View ──────────────────────────────────────────────────────────────
const TREE_SVGS = [
  `<svg viewBox="0 0 80 90" width="100%" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="40" cy="76" rx="18" ry="4" fill="#C4B5A5" opacity="0.3"/>
    <path d="M40 50 C47 48 53 58 51 70 C49 78 45 82 40 82 C35 82 31 78 29 70 C27 58 33 48 40 50Z" fill="#8B6F5E" opacity="0.82"/>
    <path d="M38 68 C36 72 38 76 40 74 C42 76 44 72 42 68" stroke="#7A5C4A" stroke-width="1" fill="none" opacity="0.4"/>
    <path d="M40 50 C41 42 38 36 40 30" stroke="#8B7355" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M40 34 C35 30 32 26 34 22 C37 24 39 30 40 34Z" fill="#8FAF8A" opacity="0.72"/>
  </svg>`,
  `<svg viewBox="0 0 80 100" width="100%" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="40" cy="82" rx="20" ry="5" fill="#C4B5A5" opacity="0.3"/>
    <path d="M40 82 C41 70 39 58 42 44 C43 36 41 28 40 20" stroke="#8B7355" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M41 42 C36 38 27 32 25 24 C29 22 35 28 39 36Z" fill="#8FAF8A" opacity="0.72"/>
    <path d="M41 48 C47 42 56 38 57 30 C53 29 47 34 43 40Z" fill="#9BBF9B" opacity="0.68"/>
    <path d="M40 20 C38 16 36 12 38 8 C40 10 41 14 40 20Z" fill="#ECC0C8" opacity="0.8"/>
    <path d="M40 20 C42 16 44 12 42 8 C40 10 39 14 40 20Z" fill="#F2D0D8" opacity="0.75"/>
    <circle cx="40" cy="7" r="3" fill="#E8B4C0" opacity="0.88"/>
  </svg>`,
  `<svg viewBox="0 0 100 110" width="100%" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="90" rx="28" ry="6" fill="#C4B5A5" opacity="0.3"/>
    <path d="M49 90 C48 76 49 62 51 48 C52 40 50 32 49 20" stroke="#8B7355" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M50 46 C43 40 34 34 28 24" stroke="#9B8060" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M50 38 C58 32 67 28 70 18" stroke="#9B8060" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M50 62 C43 58 35 54 31 44" stroke="#9B8060" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M28 24 C22 18 20 10 24 6 C28 8 30 16 30 24Z" fill="#8FAF8A" opacity="0.56"/>
    <path d="M28 24 C22 20 16 16 16 8 C20 6 26 12 28 20Z" fill="#9BBF9B" opacity="0.5"/>
    <path d="M70 18 C74 12 72 4 66 2 C64 6 66 12 68 18Z" fill="#8FAF8A" opacity="0.56"/>
    <path d="M31 44 C25 40 20 32 22 24 C28 22 32 32 32 40Z" fill="#9BBF9B" opacity="0.5"/>
    <circle cx="20" cy="6" r="3.5" fill="#E8B4C0" opacity="0.88"/>
    <circle cx="28" cy="2" r="3" fill="#F2D0D8" opacity="0.82"/>
    <circle cx="66" cy="2" r="3.5" fill="#E8B4C0" opacity="0.88"/>
    <circle cx="49" cy="16" r="3" fill="#F2D0D8" opacity="0.82"/>
  </svg>`,
  `<svg viewBox="0 0 140 140" width="100%" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="68" cy="116" rx="42" ry="8" fill="#C4B5A5" opacity="0.28"/>
    <path d="M65 116 C63 100 64 82 66 66 C67 54 66 42 64 28" stroke="#7A6248" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    <path d="M65 60 C53 52 38 44 26 30" stroke="#8B7355" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M66 52 C79 44 93 38 102 24" stroke="#8B7355" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M65 74 C55 68 42 64 34 52" stroke="#9B8060" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M66 70 C77 64 90 60 97 48" stroke="#9B8060" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M64 28 C60 18 60 8 64 2 C68 6 68 16 66 26Z" fill="#8FAF8A" opacity="0.46"/>
    <path d="M26 30 C18 22 16 10 22 6 C28 8 30 18 30 28Z" fill="#8FAF8A" opacity="0.5"/>
    <path d="M26 30 C16 24 10 14 12 4 C18 0 26 10 26 22Z" fill="#9BBF9B" opacity="0.44"/>
    <path d="M102 24 C110 16 112 4 106 0 C100 2 98 12 98 22Z" fill="#8FAF8A" opacity="0.5"/>
    <path d="M34 52 C26 46 20 34 24 24 C30 22 36 32 36 44Z" fill="#9BBF9B" opacity="0.44"/>
    <path d="M97 48 C105 42 109 30 105 20 C99 20 95 30 94 42Z" fill="#9BBF9B" opacity="0.44"/>
    <circle cx="18" cy="4" r="4.5" fill="#E8B4C0" opacity="0.92"/>
    <circle cx="28" cy="0" r="4" fill="#F2D0D8" opacity="0.9"/>
    <circle cx="36" cy="4" r="4" fill="#ECC0C8" opacity="0.88"/>
    <circle cx="104" cy="0" r="4.5" fill="#E8B4C0" opacity="0.92"/>
    <circle cx="112" cy="6" r="4" fill="#F2D0D8" opacity="0.9"/>
    <circle cx="96" cy="2" r="4" fill="#ECC0C8" opacity="0.88"/>
    <circle cx="58" cy="2" r="4.5" fill="#E8B4C0" opacity="0.92"/>
    <circle cx="70" cy="0" r="4" fill="#F2D0D8" opacity="0.9"/>
    <circle cx="22" cy="24" r="4" fill="#ECC0C8" opacity="0.84"/>
    <circle cx="100" cy="18" r="4" fill="#E8B4C0" opacity="0.84"/>
    <path d="M46 100 C48 96 52 98 50 102 C48 106 44 104 46 100Z" fill="#E8B4C0" opacity="0.42" transform="rotate(-14,48,100)"/>
    <path d="M84 104 C86 100 90 102 88 106 C86 110 82 108 84 104Z" fill="#F2D0D8" opacity="0.38" transform="rotate(10,86,104)"/>
  </svg>`,
  `<svg viewBox="0 0 160 150" width="100%" xmlns="http://www.w3.org/2000/svg">
    <path d="M72 136 C58 130 42 136 30 132" stroke="#5C4433" stroke-width="1.5" fill="none" opacity="0.3" stroke-linecap="round"/>
    <path d="M86 136 C100 130 116 136 128 132" stroke="#5C4433" stroke-width="1.5" fill="none" opacity="0.3" stroke-linecap="round"/>
    <ellipse cx="80" cy="138" rx="52" ry="9" fill="#C4B5A5" opacity="0.26"/>
    <path d="M76 138 C74 122 75 104 77 86 C78 74 76 62 74 44" stroke="#5C4433" stroke-width="8.5" fill="none" stroke-linecap="round"/>
    <path d="M85 138 C87 122 86 106 85 88 C84 76 82 64 80 48" stroke="#6B5240" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.34"/>
    <path d="M75 54 C60 44 42 36 28 18" stroke="#6B5240" stroke-width="4.2" fill="none" stroke-linecap="round"/>
    <path d="M77 46 C94 36 112 28 126 12" stroke="#6B5240" stroke-width="4.2" fill="none" stroke-linecap="round"/>
    <path d="M75 70 C62 62 46 56 34 44" stroke="#7A6248" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M77 64 C92 56 108 50 118 38" stroke="#7A6248" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M75 88 C64 82 50 76 40 64" stroke="#8B7355" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M77 84 C90 78 104 72 112 60" stroke="#8B7355" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M28 18 C18 6 14 -8 20 -14 C28 -10 32 4 32 18Z" fill="#6B9B6B" opacity="0.44"/>
    <path d="M28 18 C16 12 8 2 10 -10 C18 -14 26 -2 28 12Z" fill="#7A9E7A" opacity="0.4"/>
    <path d="M126 12 C136 0 140 -14 134 -20 C126 -16 122 -2 122 12Z" fill="#6B9B6B" opacity="0.44"/>
    <path d="M34 44 C22 36 14 22 18 10 C26 6 34 20 36 36Z" fill="#7A9E7A" opacity="0.42"/>
    <path d="M118 38 C130 30 136 16 132 4 C124 2 118 16 116 32Z" fill="#7A9E7A" opacity="0.42"/>
    <path d="M74 44 C66 28 66 10 76 2 C84 6 84 24 80 42Z" fill="#8FAF8A" opacity="0.4"/>
    <circle cx="18" cy="-14" r="5" fill="#E8B4C0" opacity="0.92"/>
    <circle cx="28" cy="-18" r="4.5" fill="#F2D0D8" opacity="0.9"/>
    <circle cx="10" cy="-2" r="4.5" fill="#ECC0C8" opacity="0.88"/>
    <circle cx="134" cy="-18" r="5" fill="#E8B4C0" opacity="0.92"/>
    <circle cx="124" cy="-22" r="4.5" fill="#F2D0D8" opacity="0.9"/>
    <circle cx="142" cy="-8" r="4.5" fill="#ECC0C8" opacity="0.88"/>
    <circle cx="72" cy="0" r="5" fill="#F2D0D8" opacity="0.92"/>
    <circle cx="82" cy="-4" r="4.5" fill="#ECC0C8" opacity="0.9"/>
    <circle cx="36" cy="10" r="4.2" fill="#E8B4C0" opacity="0.84"/>
    <circle cx="116" cy="4" r="4.2" fill="#F2D0D8" opacity="0.84"/>
    <circle cx="40" cy="34" r="4.2" fill="#ECC0C8" opacity="0.82"/>
    <circle cx="112" cy="28" r="4.2" fill="#E8B4C0" opacity="0.82"/>
    <path d="M48 118 C50 114 54 116 52 120 C50 124 46 122 48 118Z" fill="#E8B4C0" opacity="0.44" transform="rotate(-18,50,118)"/>
    <path d="M80 122 C82 118 86 120 84 124 C82 128 78 126 80 122Z" fill="#F2D0D8" opacity="0.4" transform="rotate(12,82,122)"/>
    <path d="M110 118 C112 114 116 116 114 120 C112 124 108 122 110 118Z" fill="#ECC0C8" opacity="0.4" transform="rotate(-10,112,118)"/>
  </svg>`,
  `<svg viewBox="20 0 160 230" width="100%" xmlns="http://www.w3.org/2000/svg">
    <path d="M88 210 C78 206 62 210 50 206" stroke="#4A3428" stroke-width="1.8" fill="none" opacity="0.35" stroke-linecap="round"/>
    <path d="M112 210 C122 206 138 210 150 206" stroke="#4A3428" stroke-width="1.8" fill="none" opacity="0.35" stroke-linecap="round"/>
    <path d="M96 214 C92 220 96 228 100 225 C104 228 108 220 104 214" stroke="#5C4433" stroke-width="1.4" fill="none" opacity="0.28" stroke-linecap="round"/>
    <ellipse cx="100" cy="212" rx="55" ry="8" fill="#C4B5A5" opacity="0.22"/>
    <path d="M92 212 C89 192 90 170 92 150 C93 134 91 120 90 100" stroke="#4A3428" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="M106 212 C108 192 107 172 106 152 C105 136 104 122 102 102" stroke="#5C4433" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.35"/>
    <path d="M93 167 C91 171 93 176 95 174" stroke="#3A2818" stroke-width="1.3" fill="none" opacity="0.18" stroke-linecap="round"/>
    <path d="M91 110 C76 100 58 88 42 68" stroke="#5C4433" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M93 102 C110 90 128 80 144 60" stroke="#5C4433" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M91 124 C74 116 56 110 44 96" stroke="#6B5240" stroke-width="3.8" fill="none" stroke-linecap="round"/>
    <path d="M93 118 C110 110 128 104 138 90" stroke="#6B5240" stroke-width="3.8" fill="none" stroke-linecap="round"/>
    <path d="M91 142 C76 136 62 128 52 116" stroke="#7A6248" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M93 136 C108 130 122 122 130 110" stroke="#7A6248" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M92 100 C90 88 88 76 86 62" stroke="#6B5240" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M42 68 C34 58 28 46 24 34" stroke="#8B7355" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M42 68 C36 64 28 60 20 52" stroke="#8B7355" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M144 60 C150 50 154 38 156 26" stroke="#8B7355" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M144 60 C152 56 158 52 164 44" stroke="#8B7355" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M44 96 C34 90 24 82 18 70" stroke="#8B7355" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M138 90 C148 84 156 76 160 64" stroke="#8B7355" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M86 62 C80 50 76 38 74 24" stroke="#8B7355" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M86 62 C94 52 100 42 104 28" stroke="#8B7355" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M24 34 C18 26 16 16 18 8" stroke="#A89070" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M156 26 C160 16 158 6 154 0" stroke="#A89070" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M74 24 C70 14 72 4 76 -2" stroke="#A89070" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M104 28 C108 18 108 8 104 0" stroke="#A89070" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <circle cx="76" cy="0" r="5.5" fill="#E8B4C0" opacity="0.92"/>
    <circle cx="88" cy="-4" r="5" fill="#F2D0D8" opacity="0.92"/>
    <circle cx="100" cy="-6" r="5.5" fill="#ECC0C8" opacity="0.94"/>
    <circle cx="112" cy="-4" r="5" fill="#F5D8E0" opacity="0.92"/>
    <circle cx="122" cy="0" r="5" fill="#E8B4C0" opacity="0.9"/>
    <circle cx="70" cy="8" r="4.8" fill="#F2D0D8" opacity="0.9"/>
    <circle cx="84" cy="4" r="4.5" fill="#ECC0C8" opacity="0.9"/>
    <circle cx="100" cy="2" r="5" fill="#E8B4C0" opacity="0.92"/>
    <circle cx="116" cy="4" r="4.5" fill="#F5D8E0" opacity="0.9"/>
    <circle cx="128" cy="10" r="4.8" fill="#ECC0C8" opacity="0.9"/>
    <circle cx="20" cy="6" r="5" fill="#E8B4C0" opacity="0.92"/>
    <circle cx="14" cy="16" r="4.8" fill="#F2D0D8" opacity="0.9"/>
    <circle cx="22" cy="20" r="5" fill="#ECC0C8" opacity="0.9"/>
    <circle cx="152" cy="0" r="5" fill="#E8B4C0" opacity="0.92"/>
    <circle cx="162" cy="8" r="4.8" fill="#F2D0D8" opacity="0.9"/>
    <circle cx="154" cy="14" r="5" fill="#ECC0C8" opacity="0.9"/>
    <circle cx="10" cy="28" r="4.5" fill="#E8B4C0" opacity="0.88"/>
    <circle cx="20" cy="32" r="4.8" fill="#F5D8E0" opacity="0.88"/>
    <circle cx="168" cy="18" r="4.5" fill="#E8B4C0" opacity="0.88"/>
    <circle cx="158" cy="24" r="4.8" fill="#F5D8E0" opacity="0.88"/>
    <circle cx="12" cy="42" r="4.5" fill="#ECC0C8" opacity="0.86"/>
    <circle cx="22" cy="46" r="4.8" fill="#E8B4C0" opacity="0.86"/>
    <circle cx="168" cy="34" r="4.5" fill="#ECC0C8" opacity="0.86"/>
    <circle cx="158" cy="38" r="4.8" fill="#E8B4C0" opacity="0.86"/>
    <circle cx="16" cy="60" r="4.8" fill="#F2D0D8" opacity="0.86"/>
    <circle cx="52" cy="36" r="4.5" fill="#E8B4C0" opacity="0.84"/>
    <circle cx="64" cy="28" r="4.5" fill="#F2D0D8" opacity="0.84"/>
    <circle cx="130" cy="28" r="4.5" fill="#E8B4C0" opacity="0.84"/>
    <circle cx="120" cy="20" r="4.5" fill="#F5D8E0" opacity="0.84"/>
    <circle cx="28" cy="92" r="4.5" fill="#E8B4C0" opacity="0.83"/>
    <circle cx="40" cy="84" r="4.5" fill="#F2D0D8" opacity="0.83"/>
    <circle cx="152" cy="90" r="4.5" fill="#E8B4C0" opacity="0.83"/>
    <circle cx="142" cy="98" r="4.5" fill="#F2D0D8" opacity="0.83"/>
    <path d="M46 186 C48 182 52 184 50 188 C48 192 44 190 46 186Z" fill="#E8B4C0" opacity="0.5" transform="rotate(-15,48,187)"/>
    <path d="M68 194 C70 190 74 192 72 196 C70 200 66 198 68 194Z" fill="#F2D0D8" opacity="0.46" transform="rotate(10,70,194)"/>
    <path d="M90 188 C92 184 96 186 94 190 C92 194 88 192 90 188Z" fill="#ECC0C8" opacity="0.46" transform="rotate(-8,92,188)"/>
    <path d="M112 192 C114 188 118 190 116 194 C114 198 110 196 112 192Z" fill="#E8B4C0" opacity="0.46" transform="rotate(12,114,192)"/>
    <path d="M134 186 C136 182 140 184 138 188 C136 192 132 190 134 186Z" fill="#F5D8E0" opacity="0.48" transform="rotate(-20,136,186)"/>
    <path d="M156 194 C158 190 162 192 160 196 C158 200 154 198 156 194Z" fill="#ECC0C8" opacity="0.44" transform="rotate(8,158,194)"/>
  </svg>`,

  `<svg viewBox="0 0 280 300" width="100%" xmlns="http://www.w3.org/2000/svg">
<ellipse cx="130" cy="272" rx="95" ry="12" fill="#D8CDBF" opacity="0.22"/>
  <ellipse cx="120" cy="278" rx="70" ry="7" fill="#CABFB0" opacity="0.16"/>

  <!-- ROOTS -->
  <path d="M108 270 C94 260 72 264 52 256 C36 250 20 254 4 246" stroke="#2E1608" stroke-width="5" fill="none" opacity="0.36" stroke-linecap="round"/>
  <path d="M140 272 C156 262 176 266 196 258 C212 252 228 256 244 248" stroke="#2E1608" stroke-width="5" fill="none" opacity="0.36" stroke-linecap="round"/>
  <path d="M118 274 C108 284 112 294 124 290 C136 294 140 284 130 274" stroke="#3C2010" stroke-width="3.5" fill="none" opacity="0.24" stroke-linecap="round"/>
  <path d="M96 268 C78 258 56 264 36 254" stroke="#2E1608" stroke-width="3" fill="none" opacity="0.22" stroke-linecap="round"/>
  <path d="M152 268 C170 258 192 264 212 254" stroke="#2E1608" stroke-width="3" fill="none" opacity="0.22" stroke-linecap="round"/>

  <!-- TRUNK - leans left, massive base -->
  <path d="M100 272 C90 240 84 204 80 168 C76 136 72 104 66 72 C62 48 56 26 50 4" stroke="#200C04" stroke-width="46" fill="none" stroke-linecap="round" opacity="0.12"/>
  <path d="M100 272 C90 240 84 204 80 168 C76 136 72 104 66 72 C62 48 56 26 50 4" stroke="#2A1408" stroke-width="38" fill="none" stroke-linecap="round"/>
  <path d="M132 272 C126 240 122 206 120 170 C118 138 116 106 114 74 C112 50 110 28 108 6" stroke="#3C2010" stroke-width="22" fill="none" stroke-linecap="round" opacity="0.46"/>
  <path d="M112 272 C106 242 102 208 100 172 C98 140 96 108 94 76 C92 52 90 30 88 8" stroke="#4E2C18" stroke-width="10" fill="none" stroke-linecap="round" opacity="0.28"/>
  <path d="M118 272 C114 244 110 212 108 176 C106 144 104 114 102 82" stroke="#5E3C24" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.16"/>

  <!-- BARK fissures -->
  <path d="M86 232 C81 240 84 249 90 246" stroke="#180804" stroke-width="3" fill="none" opacity="0.2" stroke-linecap="round"/>
  <path d="M84 198 C79 206 82 214 88 211" stroke="#180804" stroke-width="2.8" fill="none" opacity="0.18" stroke-linecap="round"/>
  <path d="M82 166 C77 173 80 180 86 177" stroke="#180804" stroke-width="2.5" fill="none" opacity="0.17" stroke-linecap="round"/>
  <path d="M80 136 C75 142 78 149 84 146" stroke="#180804" stroke-width="2.3" fill="none" opacity="0.16" stroke-linecap="round"/>
  <path d="M78 108 C73 114 76 120 82 117" stroke="#180804" stroke-width="2" fill="none" opacity="0.15" stroke-linecap="round"/>
  <path d="M76 82 C71 88 74 93 80 90" stroke="#180804" stroke-width="1.8" fill="none" opacity="0.14" stroke-linecap="round"/>
  <path d="M112 218 C117 226 115 234 109 231" stroke="#180804" stroke-width="2.8" fill="none" opacity="0.18" stroke-linecap="round"/>
  <path d="M114 186 C119 193 117 200 111 197" stroke="#180804" stroke-width="2.5" fill="none" opacity="0.17" stroke-linecap="round"/>
  <path d="M115 156 C120 162 118 169 112 166" stroke="#180804" stroke-width="2.3" fill="none" opacity="0.16" stroke-linecap="round"/>
  <path d="M116 128 C121 134 119 140 113 137" stroke="#180804" stroke-width="2" fill="none" opacity="0.15" stroke-linecap="round"/>

  <!-- SUPPORT STAKE - the real Jindai Zakura is held up -->
  <path d="M90 270 C88 240 86 210 84 180 C80 150 78 120 80 90" stroke="#9B8060" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.45"/>
  <path d="M84 180 C92 176 100 174 108 172" stroke="#9B8060" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.35"/>

  <!-- BRANCHES - heavy, drooping, wise -->
  <path d="M66 100 C44 110 16 116 -12 122 C-28 126 -42 130 -52 136" stroke="#3C2010" stroke-width="9" fill="none" stroke-linecap="round"/>
  <path d="M-52 136 C-60 144 -64 154 -62 164" stroke="#4E2C18" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M108 80 C136 76 164 72 190 68 C206 66 220 64 234 62" stroke="#3C2010" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M234 62 C246 60 256 62 262 70" stroke="#4E2C18" stroke-width="5.5" fill="none" stroke-linecap="round"/>
  <path d="M60 60 C40 48 18 36 -2 24 C-16 14 -28 4 -36 -8" stroke="#4E2C18" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M-36 -8 C-44 -20 -48 -34 -44 -46" stroke="#5C3820" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M100 40 C124 30 150 18 174 6 C190 -2 204 -12 216 -22" stroke="#4E2C18" stroke-width="6.5" fill="none" stroke-linecap="round"/>
  <path d="M216 -22 C226 -32 232 -44 228 -56" stroke="#5C3820" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <path d="M72 148 C52 156 28 162 4 168 C-12 172 -26 176 -38 182" stroke="#5C3820" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M-38 182 C-48 188 -54 196 -52 206" stroke="#6B4E36" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <path d="M118 130 C144 124 170 118 194 112 C212 108 226 106 238 104" stroke="#5C3820" stroke-width="5.5" fill="none" stroke-linecap="round"/>
  <path d="M78 192 C58 198 34 204 10 210 C-4 214 -16 218 -24 224" stroke="#6B4E36" stroke-width="5" fill="none" stroke-linecap="round"/>

  <!-- Secondary branches -->
  <path d="M-52 136 C-62 130 -70 122 -72 110" stroke="#6B4E36" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M-52 136 C-64 140 -72 148 -70 160" stroke="#6B4E36" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M234 62 C244 54 252 44 250 32" stroke="#6B4E36" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M-44 -46 C-50 -58 -50 -72 -44 -82" stroke="#7A6248" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M-44 -46 C-54 -54 -58 -66 -54 -76" stroke="#7A6248" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M228 -56 C234 -68 232 -82 226 -90" stroke="#7A6248" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M228 -56 C238 -64 242 -76 238 -86" stroke="#7A6248" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M-72 110 C-80 100 -84 88 -80 76" stroke="#7A6248" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M-38 182 C-50 188 -56 200 -52 212" stroke="#7A6248" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M-24 224 C-32 230 -38 240 -34 250" stroke="#8B7355" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M238 104 C250 100 260 96 266 86" stroke="#7A6248" stroke-width="2.5" fill="none" stroke-linecap="round"/>

  <!-- Fine terminal branches -->
  <path d="M-44 -82 C-50 -92 -48 -104 -42 -110" stroke="#9B8878" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M-54 -76 C-62 -86 -62 -98 -56 -104" stroke="#9B8878" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M226 -90 C230 -102 228 -114 222 -120" stroke="#9B8878" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M238 -86 C244 -98 244 -110 238 -116" stroke="#9B8878" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M-80 76 C-86 64 -84 52 -78 44" stroke="#9B8878" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M250 32 C258 22 260 10 256 0" stroke="#9B8878" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M266 86 C274 76 276 64 272 54" stroke="#9B8878" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M-52 212 C-60 220 -60 232 -54 240" stroke="#9B8878" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M-34 250 C-40 258 -38 268 -32 274" stroke="#A89878" stroke-width="1.5" fill="none" stroke-linecap="round"/>

  <!-- BLOSSOMS - sparse, concentrated at tips, white-pink, ancient -->
  <!-- Left far drooping tip -->
  <circle cx="-62" cy="162" r="5.5" fill="#F8EDF4" opacity="0.92"/>
  <circle cx="-56" cy="170" r="5" fill="#F2E2EC" opacity="0.9"/>
  <circle cx="-68" cy="168" r="5" fill="#FAF4F8" opacity="0.9"/>
  <circle cx="-62" cy="176" r="4.5" fill="#F8EDF4" opacity="0.88"/>
  <circle cx="-52" cy="162" r="4.5" fill="#F2E2EC" opacity="0.88"/>
  <circle cx="-72" cy="156" r="4.5" fill="#FAF4F8" opacity="0.86"/>
  <circle cx="-58" cy="156" r="4" fill="#F8EDF4" opacity="0.85"/>

  <!-- Left upper tip -->
  <circle cx="-44" cy="-82" r="5.5" fill="#F8EDF4" opacity="0.92"/>
  <circle cx="-52" cy="-90" r="5" fill="#F2E2EC" opacity="0.9"/>
  <circle cx="-36" cy="-88" r="5" fill="#FAF4F8" opacity="0.9"/>
  <circle cx="-48" cy="-96" r="4.5" fill="#F8EDF4" opacity="0.88"/>
  <circle cx="-38" cy="-78" r="4.5" fill="#F2E2EC" opacity="0.86"/>
  <circle cx="-56" cy="-78" r="4" fill="#FAF4F8" opacity="0.85"/>
  <circle cx="-44" cy="-70" r="4" fill="#F8EDF4" opacity="0.84"/>
  <circle cx="-62" cy="-104" r="4.5" fill="#F2E2EC" opacity="0.86"/>
  <circle cx="-54" cy="-108" r="4" fill="#FAF4F8" opacity="0.84"/>

  <!-- Left mid tip -->
  <circle cx="-80" cy="74" r="5" fill="#F8EDF4" opacity="0.9"/>
  <circle cx="-86" cy="82" r="4.5" fill="#F2E2EC" opacity="0.88"/>
  <circle cx="-74" cy="80" r="4.5" fill="#FAF4F8" opacity="0.88"/>
  <circle cx="-82" cy="90" r="4" fill="#F8EDF4" opacity="0.86"/>
  <circle cx="-72" cy="68" r="4" fill="#F2E2EC" opacity="0.85"/>

  <!-- Left very low droop -->
  <circle cx="-52" cy="210" r="5" fill="#F8EDF4" opacity="0.9"/>
  <circle cx="-46" cy="218" r="4.5" fill="#F2E2EC" opacity="0.88"/>
  <circle cx="-58" cy="216" r="4.5" fill="#FAF4F8" opacity="0.88"/>
  <circle cx="-52" cy="224" r="4" fill="#F8EDF4" opacity="0.86"/>
  <circle cx="-40" cy="210" r="4" fill="#F2E2EC" opacity="0.85"/>
  <circle cx="-34" cy="250" r="4.5" fill="#F8EDF4" opacity="0.86"/>
  <circle cx="-28" cy="258" r="4" fill="#F2E2EC" opacity="0.84"/>
  <circle cx="-40" cy="256" r="4" fill="#FAF4F8" opacity="0.84"/>

  <!-- Right far tip -->
  <circle cx="262" cy="70" r="5.5" fill="#F8EDF4" opacity="0.92"/>
  <circle cx="256" cy="62" r="5" fill="#F2E2EC" opacity="0.9"/>
  <circle cx="268" cy="64" r="5" fill="#FAF4F8" opacity="0.9"/>
  <circle cx="260" cy="56" r="4.5" fill="#F8EDF4" opacity="0.88"/>
  <circle cx="270" cy="74" r="4.5" fill="#F2E2EC" opacity="0.88"/>
  <circle cx="252" cy="70" r="4" fill="#FAF4F8" opacity="0.86"/>

  <!-- Right upper tip -->
  <circle cx="226" cy="-90" r="5.5" fill="#F8EDF4" opacity="0.92"/>
  <circle cx="218" cy="-82" r="5" fill="#F2E2EC" opacity="0.9"/>
  <circle cx="234" cy="-86" r="5" fill="#FAF4F8" opacity="0.9"/>
  <circle cx="222" cy="-96" r="4.5" fill="#F8EDF4" opacity="0.88"/>
  <circle cx="238" cy="-94" r="4.5" fill="#F2E2EC" opacity="0.88"/>
  <circle cx="220" cy="-106" r="4.5" fill="#FAF4F8" opacity="0.86"/>
  <circle cx="230" cy="-110" r="4" fill="#F8EDF4" opacity="0.85"/>

  <!-- Right low tip -->
  <circle cx="266" cy="54" r="5" fill="#F8EDF4" opacity="0.9"/>
  <circle cx="274" cy="62" r="4.5" fill="#F2E2EC" opacity="0.88"/>
  <circle cx="272" cy="48" r="4.5" fill="#FAF4F8" opacity="0.88"/>
  <circle cx="256" cy="0" r="5" fill="#F8EDF4" opacity="0.9"/>
  <circle cx="262" cy="-8" r="4.5" fill="#F2E2EC" opacity="0.88"/>
  <circle cx="250" cy="-4" r="4.5" fill="#FAF4F8" opacity="0.88"/>
  <circle cx="258" cy="-14" r="4" fill="#F8EDF4" opacity="0.86"/>

  <!-- Sparse mid branch flowers -->
  <circle cx="-12" cy="122" r="4.5" fill="#F8EDF4" opacity="0.86"/>
  <circle cx="-20" cy="130" r="4" fill="#F2E2EC" opacity="0.84"/>
  <circle cx="-4" cy="128" r="4" fill="#FAF4F8" opacity="0.84"/>
  <circle cx="-62" cy="110" r="4.5" fill="#F8EDF4" opacity="0.85"/>
  <circle cx="-70" cy="120" r="4" fill="#F2E2EC" opacity="0.83"/>
  <circle cx="238" cy="100" r="4.5" fill="#F8EDF4" opacity="0.85"/>
  <circle cx="246" cy="108" r="4" fill="#F2E2EC" opacity="0.83"/>
  <circle cx="-16" cy="168" r="4.5" fill="#FAF4F8" opacity="0.84"/>
  <circle cx="-8" cy="174" r="4" fill="#F8EDF4" opacity="0.82"/>
  <circle cx="4" cy="168" r="4" fill="#F2E2EC" opacity="0.82"/>
  <circle cx="50" cy="-4" r="4.5" fill="#F8EDF4" opacity="0.86"/>
  <circle cx="42" cy="-12" r="4" fill="#F2E2EC" opacity="0.84"/>
  <circle cx="174" cy="6" r="4.5" fill="#F8EDF4" opacity="0.86"/>
  <circle cx="166" cy="-2" r="4" fill="#F2E2EC" opacity="0.84"/>

  <!-- FALLING PETALS - few, unhurried, each one matters -->
  <path d="M30 262 C32 258 36 260 34 264 C32 268 28 266 30 262Z" fill="#F8EDF4" opacity="0.52" transform="rotate(-22,32,262)"/>
  <path d="M62 268 C64 264 68 266 66 270 C64 274 60 272 62 268Z" fill="#F2E2EC" opacity="0.48" transform="rotate(14,64,268)"/>
  <path d="M98 262 C100 258 104 260 102 264 C100 268 96 266 98 262Z" fill="#FAF4F8" opacity="0.48" transform="rotate(-8,100,262)"/>
  <path d="M136 266 C138 262 142 264 140 268 C138 272 134 270 136 266Z" fill="#F8EDF4" opacity="0.48" transform="rotate(18,138,266)"/>
  <path d="M172 262 C174 258 178 260 176 264 C174 268 170 266 172 262Z" fill="#F2E2EC" opacity="0.48" transform="rotate(-12,174,262)"/>
  <path d="M208 266 C210 262 214 264 212 268 C210 272 206 270 208 266Z" fill="#FAF4F8" opacity="0.5" transform="rotate(10,210,266)"/>
  <path d="M18 238 C20 234 24 236 22 240 C20 244 16 242 18 238Z" fill="#F2E2EC" opacity="0.42" transform="rotate(-26,20,238)"/>
  <path d="M96 238 C98 234 102 236 100 240 C98 244 94 242 96 238Z" fill="#F8EDF4" opacity="0.4" transform="rotate(-8,98,238)"/>
  <path d="M180 238 C182 234 186 236 184 240 C182 244 178 242 180 238Z" fill="#FAF4F8" opacity="0.4" transform="rotate(-14,182,238)"/>
  <path d="M40 208 C42 205 45 207 43 210 C41 213 38 211 40 208Z" fill="#FAF4F8" opacity="0.34" transform="rotate(-24,42,208)"/>
  <path d="M146 208 C148 205 151 207 149 210 C147 213 144 211 146 208Z" fill="#F2E2EC" opacity="0.32" transform="rotate(-8,148,208)"/>
  <path d="M70 178 C72 176 74 177 73 179 C72 181 70 180 70 178Z" fill="#F8EDF4" opacity="0.26" transform="rotate(-20,72,178)"/>
  <path d="M160 174 C162 172 164 173 163 175 C162 177 160 176 160 174Z" fill="#F2E2EC" opacity="0.24" transform="rotate(14,162,174)"/>
  </svg>`,
];

function CerezoView({points, treeLevel, TREE_LEVELS, desktop}){
  const levelIdx = TREE_LEVELS.findIndex(l=>l.name===treeLevel?.name);
  const nextLevel = TREE_LEVELS[levelIdx+1];
  const progress = nextLevel
    ? Math.min(100, ((points - treeLevel.min) / (nextLevel.min - treeLevel.min)) * 100)
    : 100;

  return(
    <div style={{
      padding: desktop ? "0" : "24px 20px",
      maxWidth: desktop ? 560 : undefined,
      display:"flex", flexDirection:"column", alignItems:"center",
      textAlign:"center"
    }}>
      {/* Tree illustration */}
      <div
        style={{width: desktop?220:180, height: desktop?220:180, marginBottom:16}}
        dangerouslySetInnerHTML={{__html: TREE_SVGS[Math.max(0,Math.min(5,levelIdx))]}}
      />

      {/* Level name */}
      <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",letterSpacing:".14em",textTransform:"uppercase",marginBottom:6}}>
        {treeLevel?.name}
      </div>

      {/* Points */}
      <div style={{fontFamily:"'DM Sans'",fontSize:28,fontWeight:300,color:"#2C2825",letterSpacing:"-.02em",marginBottom:4}}>
        {points.toLocaleString()}
      </div>
      <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#C8C3BB",marginBottom:20}}>puntos</div>

      {/* Progress to next level */}
      {nextLevel&&(
        <div style={{width:"100%",maxWidth:220,marginBottom:8}}>
          <div style={{height:3,background:"#EAE6E0",borderRadius:99,overflow:"hidden",marginBottom:8}}>
            <div style={{height:"100%",width:`${progress}%`,background:"linear-gradient(to right,#C4A882,#8FAF8A)",borderRadius:99,transition:"width .4s ease"}}/>
          </div>
          <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB"}}>
            {(nextLevel.min - points).toLocaleString()} puntos para {nextLevel.name}
          </div>
        </div>
      )}
      {!nextLevel&&(
        <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#9B8878",fontStyle:"italic"}}>
          Has alcanzado el nivel más alto
        </div>
      )}

      {/* All levels */}
      <div style={{width:"100%",maxWidth:280,marginTop:28}}>
        {TREE_LEVELS.map((l,i)=>(
          <div key={l.name} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:"1px solid #F5F2EE",opacity:i<=levelIdx?1:0.4}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:i<=levelIdx?"#9B8878":"#E5E1DB",flexShrink:0}}/>
            <div style={{fontFamily:"'DM Sans'",fontSize:12,color:i===levelIdx?"#2C2825":"#B0AA9F",fontWeight:i===levelIdx?500:400,flex:1,textAlign:"left"}}>{l.name}</div>
            <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB"}}>{l.min.toLocaleString()}</div>
          </div>
        ))}
      </div>


    </div>
  );
}


// ─── Desktop Hoy - Two Column ─────────────────────────────────────────────────

// ─── Desktop Tareas - Two Column ──────────────────────────────────────────────

// ─── Focus Mode ───────────────────────────────────────────────────────────────
function FocusMode({overdueWork,todayWork,upcomingWork,tasks,projects,onToggle,onDelete,onOpen,desktop}){
  const typeOrder = t => (t.type||"normal")==="urgente"?0:(t.type||"normal")==="estrategica"?1:2;
  const allTasks = [
    // 1. Vencidas - más antigua primero
    ...overdueWork.filter(t=>!t.done).sort((a,b)=>{
      if(a.date!==b.date) return a.date<b.date?-1:1;
      return typeOrder(a)-typeOrder(b);
    }),
    // 2. Próximas a vencer (con fecha >= hoy) - más próxima primero
    ...tasks.filter(t=>{
      const p=projects.find(x=>x.id===t.projectId);
      return p&&!t.done&&t.date&&t.date>=todayStr()&&!overdueWork.find(o=>o.id===t.id);
    }).sort((a,b)=>{
      if(a.date!==b.date) return a.date<b.date?-1:1;
      return typeOrder(a)-typeOrder(b);
    }),
    // 3. Sin fecha (lo antes posible): prioritario > estratégico > normal
    ...upcomingWork.filter(t=>!t.done).sort((a,b)=>typeOrder(a)-typeOrder(b)),
  ];

  const [idx,setIdx] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(()=>{
    if(idx>=allTasks.length) setIdx(Math.max(0,allTasks.length-1));
  },[allTasks.length]);

  function handleSwipeStart(e){
    touchStartX.current=e.touches[0].clientX;
    touchStartY.current=e.touches[0].clientY;
  }
  function handleSwipeEnd(e){
    const dx=e.changedTouches[0].clientX-touchStartX.current;
    const dy=Math.abs(e.changedTouches[0].clientY-touchStartY.current);
    if(dy>40) return; // vertical scroll, ignore
    if(dx<-50&&idx<allTasks.length-1) setIdx(i=>i+1); // swipe left = next
    if(dx>50&&idx>0) setIdx(i=>i-1); // swipe right = prev
  }

  const task = allTasks[idx];
  const proj = task ? projects.find(p=>p.id===task.projectId) : null;
  const isOverdue = task ? (task.date && task.date < todayStr()) : false;
  const isToday = task ? task.date===todayStr() : false;

  function handleDone(e){
    const btn = e ? e.currentTarget : null;
    if(btn){ const r=btn.getBoundingClientRect(); particleBurst(r.left+r.width/2,r.top+r.height/2,13); }
    const card = btn ? btn.closest('[data-focus-card]') : null;
    if(card){
      card.style.animation='flyUp .38s cubic-bezier(.4,0,.2,1) forwards';
      setTimeout(()=>{
        onToggle(task.id);
        setIdx(i=>i<allTasks.length-1?i+1:0);
        card.style.animation='slideInCard .32s cubic-bezier(.34,1.56,.64,1) forwards';
        setTimeout(()=>{ if(card) card.style.animation=''; },350);
      },370);
    } else {
      onToggle(task.id);
      setIdx(i=>i<allTasks.length-1?i+1:0);
    }
  }
  function handleNext(){ setIdx(i=>Math.min(i+1,allTasks.length-1)); }
  function handlePrev(){ setIdx(i=>Math.max(i-1,0)); }
  function handleSkip(){
    // Move task to end of list by going next
    setIdx(i=>i<allTasks.length-1?i+1:0);
  }

  if(allTasks.length===0) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 32px",textAlign:"center"}}>
      <div style={{fontSize:24,marginBottom:12,color:"#C8C3BB"}}>◈</div>
      <div style={{fontFamily:"'DM Sans'",fontSize:15,color:"#9B948C",marginBottom:4}}>Todo al día</div>
      <div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#C8C3BB"}}>No hay tareas pendientes para hoy</div>
    </div>
  );

  return(
    <div style={{padding:desktop?"0":"0",maxWidth:desktop?560:undefined}}>
      <div style={{marginBottom:12}} onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
        <span style={{fontFamily:"'DM Sans'",fontSize:10,color:(task.type||"normal")==="urgente"?"#C49A7A":(task.type||"normal")==="estrategica"?"#5B6BAF":"#B0AA9F",fontWeight:500,letterSpacing:".12em",textTransform:"uppercase"}}>{proj?.name}</span>
        {task.date&&<span style={{fontFamily:"'DM Sans'",fontSize:10,color:isOverdue?"#C4896A":"#C8C3BB",marginLeft:10}}>{fmtDate(task.date)}</span>}
        {task.responsable&&<span style={{fontFamily:"'DM Sans'",fontSize:10,color:"#C8C3BB",marginLeft:8}}>→ {task.responsable}</span>}
      </div>
      <div style={{background:"white",borderRadius:16,border:"1px solid #EAE6E0",padding:"22px 20px 18px",marginBottom:14}} onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
        <div style={{fontFamily:"'DM Sans'",fontSize:17,fontWeight:400,color:"#2C2825",lineHeight:1.55,marginBottom:task.notes?14:20}}>{task.title}</div>
        {task.notes&&<div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#9B948C",lineHeight:1.6,marginBottom:16,padding:"10px 12px",background:"#F7F5F2",borderRadius:10}}>{task.notes}</div>}
        <div style={{display:"flex",gap:10,marginBottom:8}}>
          <button onClick={(e)=>handleDone(e)} style={{flex:1,background:"#2C2825",color:"white",border:"1px solid #2C2825",borderRadius:12,padding:"13px",fontFamily:"'DM Sans'",fontSize:14,fontWeight:400,cursor:"pointer"}}>✓ Hecho</button>
          <button onClick={handleSkip} style={{flex:1,background:"none",color:"#9B948C",border:"1px solid #E5E1DB",borderRadius:12,padding:"13px",fontFamily:"'DM Sans'",fontSize:14,cursor:"pointer"}}>Más tarde</button>
        </div>
        <button onClick={()=>onOpen(task)} style={{width:"100%",background:"none",border:"none",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:11,padding:"2px 0",cursor:"pointer"}}>Editar tarea</button>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <button onClick={handlePrev} disabled={idx===0} style={{background:"none",border:"none",cursor:idx===0?"default":"pointer",fontFamily:"'DM Sans'",fontSize:13,color:idx===0?"#E5E1DB":"#C8C3BB",padding:"4px 0"}}>←</button>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{display:"flex",gap:3}}>
            {allTasks.slice(0,Math.min(allTasks.length,10)).map((_,i)=>(
              <div key={i} onClick={()=>setIdx(i)} style={{width:i===idx?18:5,height:4,borderRadius:99,background:i===idx?"#9B8878":"#E5E1DB",transition:"width .2s",cursor:"pointer"}}/>
            ))}
            {allTasks.length>10&&<span style={{fontFamily:"'DM Sans'",fontSize:10,color:"#D5CFC8",marginLeft:2}}>+{allTasks.length-10}</span>}
          </div>
          <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB"}}>{idx+1}/{allTasks.length}</span>
        </div>
        <button onClick={handleNext} disabled={idx===allTasks.length-1} style={{background:"none",border:"none",cursor:idx===allTasks.length-1?"default":"pointer",fontFamily:"'DM Sans'",fontSize:13,color:idx===allTasks.length-1?"#E5E1DB":"#C8C3BB",padding:"4px 0"}}>→</button>
      </div>
    </div>
  );
}

// ─── Grouped Tasks View ───────────────────────────────────────────────────────
function GroupedTasksView({projects,tasksForProject,onToggle,onDelete,onOpen,onAddTask,reorderTasks,sw,desktop}){
  const groups = [
    {key:"estrategica", label:"Estratégicas", color:"#5B6BAF", bg:"#F0F1F8"},
    {key:"urgente",     label:"Prioritarias", color:"#C49A7A", bg:"#FBF5F0"},
    {key:"normal",      label:"Normales",     color:"#9B948C", bg:"#F5F3F1"},
  ];
  const [open,setOpen]=useState({estrategica:true,urgente:true,normal:false});

  // Collect all tasks across all projects, grouped by type
  const allTasks = projects.flatMap(proj=>
    tasksForProject(proj.id).filter(t=>!t.done).map(t=>({...t,_proj:proj}))
  );

  return(
    <div>
      {groups.map(g=>{
        const gtasks=allTasks.filter(t=>(t.type||"normal")===g.key).sort(taskSort);
        if(gtasks.length===0) return null;
        const isOpen=open[g.key];
        return(
          <div key={g.key} style={{marginBottom:4}}>
            {/* Group header */}
            <div onClick={()=>setOpen(o=>({...o,[g.key]:!o[g.key]}))}
              style={{display:"flex",alignItems:"center",gap:10,padding:desktop?"12px 0":"12px 20px",cursor:"pointer",userSelect:"none",borderBottom:"1px solid #EAE6E0"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:g.color,flexShrink:0}}/>
              <span style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:500,color:g.color,flex:1}}>{g.label}</span>
              <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",background:g.bg,padding:"2px 8px",borderRadius:99}}>{gtasks.length}</span>
              <span style={{fontFamily:"'DM Sans'",fontSize:14,color:"#C8C3BB",marginLeft:4}}>{isOpen?"▾":"›"}</span>
            </div>
            {/* Tasks */}
            {isOpen&&(
              <div>
                {gtasks.map(task=>{
                  const proj=task._proj;
                  return(
                    <div key={task.id}
                      style={{display:"flex",alignItems:"center",gap:12,padding:desktop?"12px 0 12px 20px":"12px 20px",borderBottom:"1px solid #F5F2EE",cursor:"pointer"}}
                      onClick={()=>onOpen(task)}>
                      <button style={{width:22,height:22,borderRadius:"50%",border:`1.5px solid ${task.done?"#B5A99A":"#C8C3BB"}`,background:task.done?"#B5A99A":"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
                        onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();particleBurst(r.left+r.width/2,r.top+r.height/2,11);onToggle(task.id);}}>
                        {task.done&&<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2,6 5,9 10,3"/></svg>}
                      </button>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'DM Sans'",fontSize:14,color:"#2C2825",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</div>
                        <div style={{display:"flex",gap:8,marginTop:2}}>
                          <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#9B948C",fontWeight:500}}>{proj.name}</span>
                          {task.date&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#9B948C"}}>{fmtDate(task.date)}</span>}
                          {task.responsable&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#8A9E8A"}}>→ {task.responsable}</span>}
                        </div>
                      </div>
                      <TypeDot type={task.type} done={task.done}/>
                    </div>
                  );
                })}
                {/* Add task buttons per project */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",padding:desktop?"8px 0 4px 20px":"8px 20px 4px"}}>
                  {projects.map(proj=>(
                    <button key={proj.id} onClick={()=>onAddTask(proj)}
                      style={{background:"none",border:"1px dashed #D5CFC8",borderRadius:99,cursor:"pointer",fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB",padding:"3px 10px"}}>
                      + {proj.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProjBlock({project,area,tasks,onToggle,onDelete,onOpen,onAddTask,reorderTasks,swipedId,setSwipedId,onTouchStart,onTouchEnd}){
  const [exp,setExp]=useState(false);
  const imp=IMPORTANCE[project.importance||"normal"];
  const pending=tasks.filter(t=>!t.done).length;
  return(
    <div style={{borderBottom:"1px solid #EAE6E0"}}>
      <div style={{padding:"14px 20px 8px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flex:1,cursor:"pointer"}} onClick={()=>setExp(e=>!e)}>
            <div style={{width:6,height:6,borderRadius:"50%",background:AREAS[area].color,opacity:.6,flexShrink:0}}/>
            <span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:600,color:"#3A3530"}}>{project.name}</span>
            {project.monto&&<span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#9B8878",fontWeight:500}}>{project.monto}</span>}
            {pending>0&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F"}}>{pending}</span>}
          </div>
          <span style={{fontFamily:"'DM Sans'",fontSize:11,color:imp.color,background:imp.bg,padding:"2px 8px",borderRadius:99}}>{imp.label}</span>
        </div>
        <button className="m-ib" onClick={onAddTask}>+ tarea</button>
      </div>
      {exp&&(tasks.length>0
        ?<TaskRows tasks={tasks} projects={[]} onToggle={onToggle} onDelete={onDelete} onOpen={onOpen} area={area} reorderTasks={reorderTasks} swipedId={swipedId} setSwipedId={setSwipedId} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}/>
        :<div style={{padding:"4px 20px 12px",fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",fontStyle:"italic"}}>Sin tareas aún</div>
      )}
    </div>
  );
}

function PlanBlock({project,onEdit,onDelete,onComplete}){
  const [conf,setConf]=useState(false);
  const [exp,setExp]=useState(false);
  const imp=IMPORTANCE[project.importance||"normal"];
  const has=project.description||project.mainGoal||(project.secondaryGoals?.length>0);
  return(
    <div style={{margin:"10px 20px",background:"white",borderRadius:12,border:"1px solid #EAE6E0"}}>
      <div style={{padding:"14px 16px",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10,flex:1,minWidth:0}}>
          <div onClick={()=>{if(window.confirm("¿Completar proyecto?"))onComplete&&onComplete(project.id);}} style={{width:20,height:20,borderRadius:"50%",border:"1.5px solid #C8C3BB",flexShrink:0,marginTop:2,cursor:"pointer"}} />
          <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setExp(e=>!e)}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:has&&!exp?3:0}}>
            <span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:600,color:"#3A3530"}}>{project.name}</span>
            {project.monto&&<span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#9B8878",fontWeight:500}}>{project.monto}</span>}
            <span style={{fontFamily:"'DM Sans'",fontSize:11,color:imp.color,background:imp.bg,padding:"2px 7px",borderRadius:99}}>{imp.label}</span>
          </div>
          {!exp&&project.mainGoal&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#9B948C",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{project.mainGoal}</div>}
          {!has&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#D5CFC8",fontStyle:"italic"}}>Sin objetivos · tap en Editar</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button className="m-ib" onClick={onEdit}>Editar</button>
          {conf?<><button className="m-ib" style={{color:"#C4896A",borderColor:"#C4896A"}} onClick={onDelete}>Confirmar</button><button className="m-ib" onClick={()=>setConf(false)}>✕</button></>:<button className="m-ib" style={{color:"#D5CFC8"}} onClick={()=>setConf(true)}>Eliminar</button>}
        </div>
      </div>
      {exp&&has&&<div style={{padding:"0 16px 14px",borderTop:"1px solid #F5F2EE"}}>
        {project.description&&<p style={{fontFamily:"'DM Sans'",fontSize:13,color:"#6B6258",marginBottom:10,marginTop:10,lineHeight:1.6}}>{project.description}</p>}
        {project.mainGoal&&<div style={{marginBottom:8}}><div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase",marginBottom:3}}>Objetivo principal</div><div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#3A3530",fontWeight:500}}>{project.mainGoal}</div></div>}
        {project.secondaryGoals?.length>0&&<div><div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase",marginBottom:6}}>Objetivos secundarios</div>{project.secondaryGoals.map((g,i)=><div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:4}}><div style={{width:4,height:4,borderRadius:"50%",background:"#C8C3BB",flexShrink:0,marginTop:6}}/><span style={{fontFamily:"'DM Sans'",fontSize:13,color:"#6B6258"}}>{g}</span></div>)}</div>}
      </div>}
    </div>
  );
}

function TaskRows({tasks,projects,onToggle,onDelete,onOpen,overdue=false,reorderTasks,swipedId,setSwipedId,onTouchStart,onTouchEnd}){
  const [order,setOrder]=useState(null);
  const [dragIdx,setDragIdx]=useState(null);
  const [overIdx,setOverIdx]=useState(null);
  const longPressTimer=useRef(null);
  const touchMoved=useRef(false);
  const touchStartY=useRef(0),touchStartX=useRef(0);
  const rowRefs=useRef([]);
  const sorted=order?order.map(id=>tasks.find(t=>t.id===id)).filter(Boolean):[...tasks].sort(taskSort);

  function handleRowTouchStart(e,idx,taskId){
    touchStartX.current=e.touches[0].clientX;touchStartY.current=e.touches[0].clientY;touchMoved.current=false;
    longPressTimer.current=setTimeout(()=>setDragIdx(idx),400);
    onTouchStart(e,taskId);
  }
  function handleRowTouchMove(e){
    const dx=Math.abs(e.touches[0].clientX-touchStartX.current),dy=Math.abs(e.touches[0].clientY-touchStartY.current);
    if(dx>6||dy>6){touchMoved.current=true;clearTimeout(longPressTimer.current);}
    if(dragIdx===null) return;
    e.preventDefault();
    const y=e.touches[0].clientY;let found=null;
    rowRefs.current.forEach((el,i)=>{if(!el)return;const r=el.getBoundingClientRect();if(y>=r.top&&y<=r.bottom)found=i;});
    if(found!==null&&found!==dragIdx) setOverIdx(found);
  }
  function handleRowTouchEnd(e,idx,taskId){
    clearTimeout(longPressTimer.current);
    if(dragIdx!==null){
      if(overIdx!==null&&overIdx!==dragIdx){
        const r=[...sorted];const[m]=r.splice(dragIdx,1);r.splice(overIdx,0,m);
        const ids=r.map(t=>t.id);setOrder(ids);reorderTasks&&reorderTasks(ids);
      }
      setDragIdx(null);setOverIdx(null);return;
    }
    onTouchEnd(e,taskId);
  }

  return(
    <div>
      {sorted.map((task,idx)=>{
        const proj=projects.find(p=>p.id===task.projectId);
        const swiped=swipedId===task.id,isDragging=dragIdx===idx,isOver=overIdx===idx&&dragIdx!==null&&dragIdx!==idx;
        return(
          <div key={task.id} ref={el=>rowRefs.current[idx]=el}
            style={{position:"relative",overflow:"visible",opacity:isDragging?.35:1,borderTop:isOver?"2px solid #9B8878":"none"}}
            onTouchStart={e=>handleRowTouchStart(e,idx,task.id)}
            onTouchMove={handleRowTouchMove}
            onTouchEnd={e=>handleRowTouchEnd(e,idx,task.id)}>
            <div style={{position:"absolute",right:0,top:0,height:"100%",display:"flex",alignItems:"stretch",zIndex:0}}>
              <button style={{border:"none",cursor:"pointer",fontSize:12,fontWeight:500,width:54,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:3,background:"#8FAF8A",color:"white"}} onClick={(e)=>{const r=e.currentTarget.getBoundingClientRect();particleBurst(r.left+r.width/2,r.top+r.height/2,11);onToggle(task.id);}}><span style={{fontSize:15}}>✓</span><span>{task.done?"Reabrir":"Listo"}</span></button>
              <button style={{border:"none",cursor:"pointer",fontSize:12,fontWeight:500,width:54,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:3,background:"#C4997A",color:"white"}} onClick={()=>onDelete(task.id)}><span style={{fontSize:15}}>✕</span><span>Borrar</span></button>
            </div>
            <div style={{background:isDragging?"#EDE9E4":overdue?"#FBF8F4":"#F7F5F2",position:"relative",zIndex:1,transform:swiped?"translateX(-108px)":"translateX(0)",transition:"transform .25s cubic-bezier(.4,0,.2,1)",padding:"13px 20px",borderBottom:"1px solid #EAE6E0",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}
              onClick={()=>{if(swiped){setSwipedId(null);return;}if(!touchMoved.current)onOpen(task);}}>
              <button style={{width:24,height:24,borderRadius:"50%",border:`1.5px solid ${task.done?"#B5A99A":"#C8C3BB"}`,background:task.done?"#B5A99A":"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
                onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();particleBurst(r.left+r.width/2,r.top+r.height/2,11);onToggle(task.id);}}>
                {task.done&&<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2,6 5,9 10,3"/></svg>}
              </button>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'DM Sans'",fontSize:14,color:task.done?"#C8C3BB":overdue?"#9B8878":"#2C2825",textDecoration:task.done?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</div>
                <div style={{display:"flex",gap:8,marginTop:2,flexWrap:"wrap"}}>
                  {proj&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#9B948C",fontWeight:500}}>{proj.name}</span>}
                  {task.date&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:overdue?"#C4896A":"#9B948C"}}>{fmtDate(task.date)}</span>}
                  {task.responsable&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#8A9E8A",fontWeight:500}}>→ {task.responsable}</span>}
                </div>
              </div>
              <TypeDot type={task.type} done={task.done}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AppStyles(){return(<style>{`
  @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}body{background:#F7F5F2;}
  .m-np{cursor:pointer;border:none;font-family:'DM Sans',sans-serif;font-size:13px;padding:7px 14px;border-radius:99px;transition:all .2s;}
  .m-at{cursor:pointer;border:none;font-family:'DM Sans',sans-serif;font-size:12px;padding:6px 12px;border-radius:99px;transition:all .2s;white-space:nowrap;}
  .m-ib{background:none;border:1px solid #E5E1DB;border-radius:6px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:11px;color:#B0AA9F;padding:5px 10px;white-space:nowrap;}
  .m-newp{display:flex;align-items:center;gap:8px;background:none;border:1px dashed #D5CFC8;border-radius:10px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;color:#C8C3BB;padding:12px 20px;margin:12px 20px;width:calc(100% - 40px);}
  .sheet-overlay{position:fixed;inset:0;background:rgba(44,40,37,.45);z-index:100;animation:fadeIn .2s;}
  .sheet{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:#F7F5F2;border-radius:20px 20px 0 0;padding:20px 20px 44px;z-index:101;animation:slideUp .28s cubic-bezier(.4,0,.2,1);max-height:92vh;overflow-y:auto;}
  .d-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:520px;background:#F7F5F2;border-radius:16px;padding:28px;z-index:101;animation:fadeIn .2s;box-shadow:0 20px 60px rgba(0,0,0,.15);max-height:90vh;overflow-y:auto;}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateX(-50%) translateY(100%)}to{transform:translateX(-50%) translateY(0)}}
  .si{width:100%;background:white;border:1px solid #E5E1DB;border-radius:10px;padding:10px 14px;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;color:#3A3530;}.si:focus{border-color:#B5A99A;}
  .sl{font-family:'DM Sans';font-size:10px;color:#B0AA9F;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px;display:block;}
  .sv{width:100%;background:#6B6258;color:white;border:none;border-radius:12px;padding:13px;font-size:15px;font-family:'DM Sans',sans-serif;font-weight:500;cursor:pointer;margin-top:16px;}
  .hd{width:36px;height:4px;background:#D5CFC8;border-radius:99px;margin:0 auto 20px;}
  .dc{cursor:pointer;border:1px solid #E5E1DB;border-radius:99px;padding:4px 11px;font-size:11px;font-family:'DM Sans';color:#8C877F;background:white;transition:all .2s;white-space:nowrap;}.dc.on{background:#6B6258;border-color:#6B6258;color:white;}
  .impb{cursor:pointer;border-radius:8px;padding:8px 12px;font-family:'DM Sans';font-size:13px;border:1px solid #E5E1DB;background:white;transition:all .2s;flex:1;text-align:center;}
  .typb{cursor:pointer;border-radius:10px;padding:10px 14px;font-family:'DM Sans';font-size:13px;border:1.5px solid #E5E1DB;background:white;transition:all .2s;flex:1;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px;}


  @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}body{background:#F7F5F2;overflow:hidden;}
  @keyframes fadeSlideUp{from{opacity:0;transform:translateX(-50%) translateY(16px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}
  @keyframes particle{0%{transform:translate(0,0) scale(1);opacity:1;}100%{transform:translate(var(--tx),var(--ty)) scale(0);opacity:0;}}
  @keyframes flyUp{0%{transform:translateY(0) scale(1);opacity:1;}100%{transform:translateY(-110px) scale(.94);opacity:0;}}
  @keyframes slideInCard{0%{transform:translateY(28px);opacity:0;}100%{transform:translateY(0);opacity:1;}}
  .clarity-particle{position:fixed;border-radius:50%;pointer-events:none;z-index:99999;animation:particle .55s cubic-bezier(.25,.46,.45,.94) forwards;}
  .d-nav{display:flex;align-items:center;gap:8px;width:100%;border:none;background:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;padding:8px 10px;border-radius:8px;text-align:left;transition:all .15s;}
  .d-nav:hover{background:#E8E3DC;color:#3A3530!important;}
  .d-proj{display:flex;align-items:center;justify-content:space-between;width:100%;border:none;background:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;padding:6px 10px;border-radius:6px;transition:all .15s;gap:6px;}
  .d-proj:hover{background:#E8E3DC;}
  .d-apill{cursor:pointer;border-radius:99px;padding:6px 14px;font-size:12px;font-family:'DM Sans',sans-serif;transition:all .2s;white-space:nowrap;}
  .d-tr{transition:background .12s;cursor:grab;}.d-tr:hover{background:#F5F2EE!important;}
  .d-ci{width:22px;height:22px;border-radius:50%;border:1.5px solid #C8C3BB;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;}
  .d-ci:hover{border-color:#9B8878;}.d-ci.done{background:#B5A99A;border-color:#B5A99A;}
  .d-ib{background:none;border:1px solid #E5E1DB;border-radius:6px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:11px;color:#B0AA9F;padding:4px 9px;transition:all .15s;white-space:nowrap;}
  .d-ib:hover{border-color:#B5A99A;color:#6B6258;}
  .d-newp{display:flex;align-items:center;gap:8px;background:none;border:1px dashed #D5CFC8;border-radius:10px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;color:#C8C3BB;padding:12px 18px;margin-top:8px;transition:all .2s;width:100%;}
  .d-newp:hover{border-color:#B5A99A;color:#9B8878;}
  .sheet-overlay{position:fixed;inset:0;background:rgba(44,40,37,.45);z-index:100;animation:fadeIn .2s;}
  .sheet{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:#F7F5F2;border-radius:20px 20px 0 0;padding:20px 20px 44px;z-index:101;animation:slideUp .28s cubic-bezier(.4,0,.2,1);max-height:92vh;overflow-y:auto;}
  .d-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:520px;background:#F7F5F2;border-radius:16px;padding:28px;z-index:101;animation:fadeIn .2s;box-shadow:0 20px 60px rgba(0,0,0,.15);max-height:90vh;overflow-y:auto;}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateX(-50%) translateY(100%)}to{transform:translateX(-50%) translateY(0)}}
  .si{width:100%;background:white;border:1px solid #E5E1DB;border-radius:10px;padding:10px 14px;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;color:#3A3530;}.si:focus{border-color:#B5A99A;}
  .sl{font-family:'DM Sans';font-size:10px;color:#B0AA9F;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px;display:block;}
  .sv{width:100%;background:#6B6258;color:white;border:none;border-radius:12px;padding:13px;font-size:15px;font-family:'DM Sans',sans-serif;font-weight:500;cursor:pointer;margin-top:16px;transition:background .15s;}.sv:hover{background:#4A433C;}
  .hd{width:36px;height:4px;background:#D5CFC8;border-radius:99px;margin:0 auto 20px;}
  .dc{cursor:pointer;border:1px solid #E5E1DB;border-radius:99px;padding:4px 11px;font-size:11px;font-family:'DM Sans';color:#8C877F;background:white;transition:all .2s;white-space:nowrap;}.dc.on{background:#6B6258;border-color:#6B6258;color:white;}
  .impb{cursor:pointer;border-radius:8px;padding:8px 12px;font-family:'DM Sans';font-size:13px;border:1px solid #E5E1DB;background:white;transition:all .2s;flex:1;text-align:center;}
  .typb{cursor:pointer;border-radius:10px;padding:10px 14px;font-family:'DM Sans';font-size:13px;border:1.5px solid #E5E1DB;background:white;transition:all .2s;flex:1;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px;}
`}</style>);}

function TypeSelector({value,onChange}){
  return(<div style={{marginBottom:14}}>
    <span className="sl">Tipo de tarea</span>
    <div style={{display:"flex",gap:8}}>
      {Object.entries(TASK_TYPE).map(([k,v])=>(
        <button key={k} className="typb" onClick={()=>onChange(k)}
          style={{borderColor:value===k?(v.color||"#6B6258"):"#E5E1DB",background:value===k?(k==="estrategica"?"#F0F1F8":k==="urgente"?"#FBF3EE":"#F5F3F1"):"white",color:value===k?(v.color||"#6B6258"):"#B0AA9F",fontWeight:value===k?500:400}}>
          {v.color&&<div style={{width:v.size,height:v.size,borderRadius:"50%",background:v.color,flexShrink:0,boxShadow:v.ring?`0 0 0 2px white, 0 0 0 3px ${v.color}`:"none"}}/>}
          {v.label}
        </button>
      ))}
    </div>
  </div>);
}

function EditSheet({task,projects,onSave,onDelete,isDesktop}){
  const [form,setForm]=useState({...task,type:task.type||"normal"});
  const proj=projects.find(p=>p.id===task.projectId);
  const isWork=proj?.area==="trabajo";
  const cls=isDesktop?"d-modal":"sheet";
  return(<div className={cls}>
    {!isDesktop&&<div className="hd"/>}
    {isDesktop&&<span className="sl">Editar tarea</span>}
    <input className="si" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} autoFocus
      style={{fontSize:16,fontWeight:500,marginBottom:16,border:"none",background:"transparent",padding:"4px 0",borderBottom:"1px solid #E5E1DB",borderRadius:0}}/>
    <TypeSelector value={form.type} onChange={v=>setForm(f=>({...f,type:v}))}/>
    <div style={{marginBottom:14}}>
      <span className="sl">Responsable (opcional)</span>
      <input className="si" value={form.responsable||""} onChange={e=>setForm(f=>({...f,responsable:e.target.value}))} placeholder="Nombre de quien lo ejecuta..."/>
    </div>
    {isWork&&<div style={{marginBottom:12}}>
      <span className="sl">Fecha (opcional)</span>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {[{l:"Hoy",v:todayStr()},{l:"Mañana",v:tomorrow()}].map(q=>(
          <button key={q.l} className={`dc${form.date===q.v?" on":""}`} onClick={()=>setForm(f=>({...f,date:q.v}))}>{q.l}</button>
        ))}
        <button className={`dc${form.date===""?" on":""}`} onClick={()=>setForm(f=>({...f,date:""}))}>Lo antes posible</button>
        <input type="date" value={form.date||""} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
          style={{border:"1px solid #E5E1DB",borderRadius:99,padding:"4px 11px",fontSize:11,fontFamily:"'DM Sans'",outline:"none",color:"#8C877F",background:"white"}}/>
      </div>
    </div>}
    <textarea className="si" rows={3} placeholder="Notas..." value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{resize:"none",fontFamily:"'DM Sans'",fontSize:14}}/>
    <button className="sv" onClick={()=>onSave(form)}>Guardar</button>
    <button onClick={onDelete} style={{width:"100%",background:"none",border:"none",color:"#C4A89A",fontFamily:"'DM Sans'",fontSize:14,padding:"14px 0 0",cursor:"pointer"}}>Eliminar tarea</button>
  </div>);
}

function AddTaskSheet({projectId,area,projectName,onAdd,isDesktop}){
  const [title,setTitle]=useState("");
  const [type,setType]=useState("normal");
  const [date,setDate]=useState("");
  const [responsable,setResponsable]=useState("");
  const isWork=area==="trabajo";
  const cls=isDesktop?"d-modal":"sheet";
  function go(){if(!title.trim())return;onAdd({projectId,title:title.trim(),type,date,responsable});}
  return(<div className={cls}>
    {!isDesktop&&<div className="hd"/>}
    <span className="sl">{projectName}</span>
    <input className="si" value={title} onChange={e=>setTitle(e.target.value)} autoFocus
      placeholder="¿Qué hay que hacer?" onKeyDown={e=>e.key==="Enter"&&go()} style={{marginBottom:16}}/>
    <TypeSelector value={type} onChange={setType}/>
    <div style={{marginBottom:14}}>
      <span className="sl">Responsable (opcional)</span>
      <input className="si" value={responsable} onChange={e=>setResponsable(e.target.value)} placeholder="Nombre de quien lo ejecuta..."/>
    </div>
    {isWork&&<div style={{marginBottom:14}}>
      <span className="sl">Fecha (opcional)</span>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {[{l:"Hoy",v:todayStr()},{l:"Mañana",v:tomorrow()}].map(q=>(
          <button key={q.l} className={`dc${date===q.v?" on":""}`} onClick={()=>setDate(p=>p===q.v?"":q.v)}>{q.l}</button>
        ))}
        <button className={`dc${date===""?" on":""}`} onClick={()=>setDate("")}>Lo antes posible</button>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{border:"1px solid #E5E1DB",borderRadius:99,padding:"4px 11px",fontSize:11,fontFamily:"'DM Sans'",outline:"none",color:"#8C877F",background:"white"}}/>
      </div>
    </div>}
    <button className="sv" onClick={go}>Agregar tarea</button>
  </div>);
}

function NewProjectSheet({area,onAdd,isDesktop}){
  const [name,setName]=useState("");
  const cls=isDesktop?"d-modal":"sheet";
  return(<div className={cls}>
    {!isDesktop&&<div className="hd"/>}
    <span className="sl" style={{color:AREAS[area].color}}>{AREAS[area].label}</span>
    <input className="si" value={name} onChange={e=>setName(e.target.value)} autoFocus
      placeholder="Nombre del proyecto..." onKeyDown={e=>e.key==="Enter"&&onAdd(area,name)} style={{marginBottom:0}}/>
    <button className="sv" onClick={()=>onAdd(area,name)}>Crear proyecto</button>
  </div>);
}


// ─── Metas View ───────────────────────────────────────────────────────────────

function MetasView({goals,projects,onNew,onEdit,onReorder,completeGoal,isDesktop}){
  const horizons = [
    {key:"anio",  label:"Este año",  sub:"2025",   color:"#9B8878", bg:"#F5F1ED", border:"#C4A882"},
    {key:"medio", label:"2–5 años",  sub:"2026–30", color:"#8A8EA8", bg:"#F1F2F5", border:"#8A8EA8"},
    {key:"largo", label:"5+ años",   sub:"2031+",   color:"#5B6BAF", bg:"#F0F1F8", border:"#5B6BAF"},
  ];

  // Build connections: for each goal, find children (goals that have this as parent)
  const getChildren = (id) => goals.filter(g=>g.parentId===id);
  const getProjects = (goalId) => projects.filter(p=>p.goal_id===goalId);

  const p = isDesktop ? "28px 0 40px" : "16px 0 40px";

  return(
    <div style={{padding:p}}>
      {!isDesktop&&<div style={{padding:"0 20px 16px",fontFamily:"'DM Sans'",fontSize:13,color:"#B0AA9F",lineHeight:1.6}}>
        Tu camino. Lo que hacés hoy te acerca a donde querés llegar.
      </div>}
      {isDesktop&&<p style={{fontFamily:"'DM Sans'",fontSize:13,color:"#B0AA9F",marginBottom:24,lineHeight:1.6,maxWidth:680}}>
        Tu camino de vida. Cada nivel alimenta al siguiente — lo que hacés hoy construye el largo plazo.
      </p>}

      {/* Camino horizontal — desktop */}
      {isDesktop&&(
        <div style={{width:"100%"}}>
          <DesktopMetasCanvas goals={goals} horizons={horizons} getChildren={getChildren} getProjects={getProjects} onEdit={onEdit} onNew={onNew} onReorder={onReorder}/>

          {/* Unlinked projects warning */}
          {(() => {
            const unlinked = projects.filter(p=>p.area==="trabajo"&&!p.goal_id);
            if(unlinked.length===0) return null;
            return(
              <div style={{padding:"12px 16px",background:"#FBF8F2",borderRadius:10,border:"1px solid #F0DFA0",display:"flex",alignItems:"center",gap:10,maxWidth:680}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"#C4A882",flexShrink:0}}/>
                <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#7A6A3A"}}>
                  {unlinked.length===1?`El proyecto "${unlinked[0].name}" no está`:`${unlinked.length} proyectos no están`} vinculado{unlinked.length>1?"s":""} a ninguna meta. ¿Lo asignás desde Proyectos → Editar?
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Camino vertical — mobile */}
      {!isDesktop&&(
        <div style={{padding:"0 20px"}}>
          {horizons.map((h,hi)=>(
            <div key={h.key} style={{marginBottom:24}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:h.color}}/>
                  <span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:500,color:h.color,letterSpacing:".06em",textTransform:"uppercase"}}>{h.label}</span>
                  <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB"}}>{h.sub}</span>
                </div>
                <button className="m-ib" onClick={()=>onNew(h.key)}>+ meta</button>
              </div>
              {goals.filter(g=>g.horizon===h.key).map(goal=>(
                <GoalCard key={goal.id} goal={goal} horizon={h} children={getChildren(goal.id)} linkedProjects={getProjects(goal.id)} onEdit={()=>onEdit(goal)} allGoals={goals} mobile/>
              ))}
              {goals.filter(g=>g.horizon===h.key).length===0&&(
                <div style={{background:"white",borderRadius:10,border:"1px dashed #E5E1DB",padding:"16px",textAlign:"center",fontFamily:"'DM Sans'",fontSize:12,color:"#D5CFC8",fontStyle:"italic"}}>
                  Sin metas aún
                </div>
              )}
              {hi<horizons.length-1&&(
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 0",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:11}}>
                  <div style={{flex:1,height:1,background:"linear-gradient(to right,"+h.color+"44,"+horizons[hi+1].color+"44)"}}/>
                  <span>lleva a</span>
                  <div style={{flex:1,height:1,background:"linear-gradient(to right,"+horizons[hi+1].color+"44,transparent)"}}/>
                </div>
              )}
            </div>
          ))}

          {/* Unlinked warning mobile */}
          {(() => {
            const unlinked = projects.filter(p=>p.area==="trabajo"&&!p.goal_id);
            if(unlinked.length===0) return null;
            return(
              <div style={{padding:"10px 14px",background:"#FBF8F2",borderRadius:10,border:"1px solid #F0DFA0",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:"#C4A882",flexShrink:0}}/>
                <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#7A6A3A"}}>
                  {unlinked.length} proyecto{unlinked.length>1?"s":""} sin meta vinculada
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}



function DraggableGoalColumn({goals,horizon,getChildren,getProjects,onEdit,onComplete,onReorder,cardRefs}){
  const [order,setOrder]=useState(null);
  const dragItem=useRef(null),dragOver=useRef(null);
  const sorted=order?order.map(id=>goals.find(g=>g.id===id)).filter(Boolean):[...goals].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));

  function handleDragEnd(){
    if(dragItem.current===null||dragOver.current===null||dragItem.current===dragOver.current){dragItem.current=null;dragOver.current=null;return;}
    const r=[...sorted];const[m]=r.splice(dragItem.current,1);r.splice(dragOver.current,0,m);
    const ids=r.map(g=>g.id);setOrder(ids);onReorder&&onReorder(ids);
    dragItem.current=null;dragOver.current=null;
  }

  return(<>
    {sorted.map((goal,i)=>(
      <div key={goal.id} ref={el=>{if(cardRefs)cardRefs.current[goal.id]=el;}}
        draggable
        onDragStart={()=>dragItem.current=i}
        onDragEnter={()=>dragOver.current=i}
        onDragOver={e=>e.preventDefault()}
        onDragEnd={handleDragEnd}
        style={{cursor:"grab"}}>
        <GoalCard goal={goal} horizon={horizon} children={getChildren(goal.id)} linkedProjects={getProjects(goal.id)} onEdit={()=>onEdit(goal)} onComplete={onComplete} allGoals={goals}/>
      </div>
    ))}
  </>);
}

function DesktopMetasCanvas({goals,horizons,getChildren,getProjects,onEdit,onNew,onComplete,onReorder}){
  const cardRefs = useRef({});
  const [lines, setLines] = useState([]);
  const containerRef = useRef(null);

  useEffect(()=>{
    // Calculate lines after render
    const timer = setTimeout(()=>{
      if(!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newLines = [];
      goals.forEach(goal=>{
        if(!goal.parentId) return;
        const fromEl = cardRefs.current[goal.id];
        const toEl   = cardRefs.current[goal.parentId];
        if(!fromEl||!toEl) return;
        const fromRect = fromEl.getBoundingClientRect();
        const toRect   = toEl.getBoundingClientRect();
        newLines.push({
          x1: fromRect.right - containerRect.left,
          y1: fromRect.top + fromRect.height/2 - containerRect.top,
          x2: toRect.left  - containerRect.left,
          y2: toRect.top  + toRect.height/2  - containerRect.top,
          color: "#C0BAB2",
        });
      });
      setLines(newLines);
    }, 100);
    return ()=>clearTimeout(timer);
  },[goals]);

  return(
    <div ref={containerRef} style={{position:"relative"}}>
      {/* SVG overlay for lines */}
      {lines.length>0&&(
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0}} overflow="visible">
          {lines.map((l,i)=>(
            <path key={i}
              d={`M ${l.x1} ${l.y1} C ${l.x1+40} ${l.y1}, ${l.x2-40} ${l.y2}, ${l.x2} ${l.y2}`}
              fill="none" stroke={l.color} strokeWidth="1.5" opacity="0.85"/>
          ))}
        </svg>
      )}
      {/* Columns */}
      <div style={{display:"flex",alignItems:"flex-start",gap:0,position:"relative",zIndex:1,width:"100%"}}>
        {horizons.map((h,hi)=>(
          <div key={h.key} style={{display:"flex",alignItems:"flex-start",flex:1}}>
            <div style={{flex:1}}>
              <div style={{marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:h.color}}/>
                  <span style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:500,color:h.color,letterSpacing:".06em",textTransform:"uppercase"}}>{h.label}</span>
                </div>
                <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB",paddingLeft:16}}>{h.sub}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,paddingRight:16}}>
                <DraggableGoalColumn goals={goals.filter(g=>g.horizon===h.key)} horizon={h} getChildren={getChildren} getProjects={getProjects} onEdit={onEdit} onReorder={onReorder} cardRefs={cardRefs}/>
                <button onClick={()=>onNew(h.key)}
                  style={{background:"none",border:"1px dashed #D5CFC8",borderRadius:10,cursor:"pointer",fontFamily:"'DM Sans'",fontSize:12,color:"#C8C3BB",padding:"10px",textAlign:"center",transition:"all .2s"}}
                  onMouseOver={e=>e.currentTarget.style.borderColor="#B5A99A"}
                  onMouseOut={e=>e.currentTarget.style.borderColor="#D5CFC8"}>
                  + meta
                </button>
              </div>
            </div>
            {hi < horizons.length-1 && (
              <div style={{display:"flex",alignItems:"center",paddingTop:28,flexShrink:0}}>
                <div style={{width:24,height:1.5,background:`linear-gradient(to right, ${h.color}, ${horizons[hi+1].color})`}}/>
                <div style={{fontSize:14,color:"#C8C3BB",marginLeft:2}}>›</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Draggable Project Grid (desktop) ────────────────────────────────────────
function DraggableProjectGrid({projects,onEdit,onDelete,onComplete,onReorder}){
  const [order,setOrder]=useState(null);
  const dragItem=useRef(null),dragOver=useRef(null);
  const sorted=order?order.map(id=>projects.find(p=>p.id===id)).filter(Boolean):[...projects].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));

  function handleDragEnd(){
    if(dragItem.current===null||dragOver.current===null||dragItem.current===dragOver.current){dragItem.current=null;dragOver.current=null;return;}
    const r=[...sorted];const[m]=r.splice(dragItem.current,1);r.splice(dragOver.current,0,m);
    const ids=r.map(p=>p.id);setOrder(ids);onReorder&&onReorder(ids);
    dragItem.current=null;dragOver.current=null;
  }

  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(360px,1fr))",gap:12}}>
      {sorted.map((proj,i)=>(
        <div key={proj.id} draggable
          onDragStart={()=>dragItem.current=i}
          onDragEnter={()=>dragOver.current=i}
          onDragOver={e=>e.preventDefault()}
          onDragEnd={handleDragEnd}
          style={{cursor:"grab"}}>
          <DPlanBlock project={proj} onEdit={()=>onEdit(proj)} onDelete={()=>onDelete(proj.id)} onComplete={onComplete}/>
        </div>
      ))}
    </div>
  );
}

// ─── Draggable Project List (mobile) ─────────────────────────────────────────
function DraggableProjectList({projects,onEdit,onDelete,onComplete,onReorder}){
  const [order,setOrder]=useState(null);
  const [dragIdx,setDragIdx]=useState(null);
  const [overIdx,setOverIdx]=useState(null);
  const longPress=useRef(null);
  const touchMoved=useRef(false);
  const touchStartY=useRef(0),touchStartX=useRef(0);
  const rowRefs=useRef([]);
  const sorted=order?order.map(id=>projects.find(p=>p.id===id)).filter(Boolean):[...projects].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));

  function handleTouchStart(e,idx){
    touchStartX.current=e.touches[0].clientX;touchStartY.current=e.touches[0].clientY;touchMoved.current=false;
    longPress.current=setTimeout(()=>setDragIdx(idx),450);
  }
  function handleTouchMove(e){
    const dx=Math.abs(e.touches[0].clientX-touchStartX.current),dy=Math.abs(e.touches[0].clientY-touchStartY.current);
    if(dx>6||dy>6){touchMoved.current=true;clearTimeout(longPress.current);}
    if(dragIdx===null) return;
    e.preventDefault();
    const y=e.touches[0].clientY;let found=null;
    rowRefs.current.forEach((el,i)=>{if(!el)return;const r=el.getBoundingClientRect();if(y>=r.top&&y<=r.bottom)found=i;});
    if(found!==null&&found!==dragIdx)setOverIdx(found);
  }
  function handleTouchEnd(idx){
    clearTimeout(longPress.current);
    if(dragIdx!==null){
      if(overIdx!==null&&overIdx!==dragIdx){
        const r=[...sorted];const[m]=r.splice(dragIdx,1);r.splice(overIdx,0,m);
        const ids=r.map(p=>p.id);setOrder(ids);onReorder&&onReorder(ids);
      }
      setDragIdx(null);setOverIdx(null);
    }
  }

  return(
    <div onTouchMove={handleTouchMove}>
      {sorted.map((proj,idx)=>(
        <div key={proj.id} ref={el=>rowRefs.current[idx]=el}
          style={{opacity:dragIdx===idx?.4:1,borderTop:overIdx===idx&&dragIdx!==null&&dragIdx!==idx?"2px solid #9B8878":"none"}}
          onTouchStart={e=>handleTouchStart(e,idx)}
          onTouchEnd={()=>handleTouchEnd(idx)}>
          <PlanBlock project={proj} onEdit={()=>onEdit(proj)} onDelete={()=>onDelete(proj.id)} onComplete={onComplete}/>
        </div>
      ))}
    </div>
  );
}

function GoalCard({goal,horizon,children,linkedProjects,onEdit,onComplete,allGoals,mobile}){
  const [exp,setExp]=useState(false);
  return(
    <div style={{background:"white",borderRadius:10,border:`1px solid #EAE6E0`,background:"white",borderLeft:`3px solid ${horizon.color}`,marginBottom:mobile?8:0,overflow:"hidden"}}>
      <div style={{padding:"12px 14px",cursor:"pointer"}} onClick={()=>setExp(e=>!e)}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:10,flex:1,minWidth:0}}>
            <div onClick={e=>{e.stopPropagation();if(onComplete&&window.confirm("¿Completar meta? +2.000 pts"))onComplete(goal.id);}} style={{width:18,height:18,borderRadius:"50%",border:"1.5px solid #C8C3BB",flexShrink:0,marginTop:1,cursor:"pointer"}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:500,color:"#2C2825",marginBottom:goal.description?3:0,lineHeight:1.4}}>{goal.title}</div>
              {goal.description&&<div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",lineHeight:1.4}}>{goal.description}</div>}
            </div>
          </div>
          <button onClick={e=>{e.stopPropagation();onEdit();}} style={{background:"none",border:"1px solid #E5E1DB",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",padding:"3px 7px",flexShrink:0,whiteSpace:"nowrap"}}>Editar</button>
        </div>
        {/* Linked projects */}
        {linkedProjects.length>0&&(
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:8}}>
            {linkedProjects.map(p=>(
              <span key={p.id} style={{fontSize:10,color:horizon.color,background:horizon.bg,padding:"2px 8px",borderRadius:99,fontFamily:"'DM Sans'",fontWeight:500}}>{p.name}</span>
            ))}
          </div>
        )}
        {/* Child goals count */}
        {children.length>0&&(
          <div style={{marginTop:6,fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F"}}>
            {children.length} meta{children.length>1?"s":""} conectada{children.length>1?"s":""} ↓
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Goal Sheet ───────────────────────────────────────────────────────────────

function GoalSheet({goal,goals,projects,onSave,onDelete,isDesktop}){
  const [form,setForm]=useState({...goal});
  const [conf,setConf]=useState(false);
  const isNew=!goal.id;
  const cls=isDesktop?"d-modal":"sheet";

  const horizons=[
    {key:"anio",  label:"Este año",  color:"#9B8878"},
    {key:"medio", label:"2–5 años",  color:"#8A8EA8"},
    {key:"largo", label:"5+ años",   color:"#5B6BAF"},
  ];

  // Parent goals: only show goals from the next horizon
  const nextHorizon = form.horizon==="anio"?"medio":form.horizon==="medio"?"largo":null;
  const parentOptions = nextHorizon ? goals.filter(g=>g.horizon===nextHorizon) : [];

  return(
    <div className={cls}>
      {!isDesktop&&<div className="hd"/>}
      <span className="sl">{isNew?"Nueva meta":"Editar meta"}</span>

      {/* Horizon */}
      <div style={{marginBottom:16}}>
        <span className="sl">Horizonte</span>
        <div style={{display:"flex",gap:6}}>
          {horizons.map(h=>(
            <button key={h.key} onClick={()=>setForm(f=>({...f,horizon:h.key,parentId:null}))}
              style={{flex:1,padding:"8px 10px",borderRadius:8,border:`1.5px solid ${form.horizon===h.key?h.color:"#E5E1DB"}`,background:form.horizon===h.key?"white":"white",color:form.horizon===h.key?h.color:"#B0AA9F",fontFamily:"'DM Sans'",fontSize:12,cursor:"pointer",fontWeight:form.horizon===h.key?500:400,transition:"all .2s",textAlign:"center"}}>
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{marginBottom:14}}>
        <span className="sl">Meta</span>
        <input className="si" value={form.title||""} onChange={e=>setForm(f=>({...f,title:e.target.value}))} autoFocus placeholder="¿Qué querés lograr?"/>
      </div>

      <div style={{marginBottom:16}}>
        <span className="sl">Descripción (opcional)</span>
        <textarea className="si" rows={2} value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
          placeholder="Contexto o detalle..." style={{resize:"none",fontFamily:"'DM Sans'",lineHeight:1.6}}/>
      </div>

      {/* Parent goal link */}
      {parentOptions.length>0&&(
        <div style={{marginBottom:16}}>
          <span className="sl">Contribuye a (opcional)</span>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {parentOptions.map(pg=>(
              <button key={pg.id} onClick={()=>setForm(f=>({...f,parentId:f.parentId===pg.id?null:pg.id}))}
                style={{textAlign:"left",padding:"8px 12px",borderRadius:8,border:`1px solid ${form.parentId===pg.id?"#8A8EA8":"#E5E1DB"}`,background:form.parentId===pg.id?"#F1F2F5":"white",color:form.parentId===pg.id?"#5B6BAF":"#6B6258",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer",transition:"all .15s"}}>
                {pg.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="sv" onClick={()=>onSave(form)}>{isNew?"Crear meta":"Guardar"}</button>
      {!isNew&&onDelete&&(
        conf
          ?<div style={{display:"flex",gap:8,marginTop:12}}>
              <button onClick={onDelete} style={{flex:1,background:"none",border:"1px solid #C4896A",borderRadius:10,padding:"10px",fontSize:13,color:"#C4896A",cursor:"pointer",fontFamily:"'DM Sans'"}}>Confirmar</button>
              <button onClick={()=>setConf(false)} style={{flex:1,background:"none",border:"1px solid #E5E1DB",borderRadius:10,padding:"10px",fontSize:13,color:"#B0AA9F",cursor:"pointer",fontFamily:"'DM Sans'"}}>Cancelar</button>
            </div>
          :<button onClick={()=>setConf(true)} style={{width:"100%",background:"none",border:"none",color:"#C4A89A",fontFamily:"'DM Sans'",fontSize:14,padding:"14px 0 0",cursor:"pointer"}}>Eliminar meta</button>
      )}
    </div>
  );
}

function PlanProjectSheet({project,onSave,isDesktop,goals=[]}){
  const [form,setForm]=useState({...project,monto:project.monto||"",goal_id:project.goal_id||null,secondaryGoals:project.secondaryGoals?.length>0?[...project.secondaryGoals]:[""]});
  function updGoal(i,val){const g=[...form.secondaryGoals];g[i]=val;setForm(f=>({...f,secondaryGoals:g}));}
  function addGoal(){setForm(f=>({...f,secondaryGoals:[...f.secondaryGoals,""]}));}
  function remGoal(i){setForm(f=>({...f,secondaryGoals:f.secondaryGoals.filter((_,j)=>j!==i)}));}
  function save(){onSave({...form,secondaryGoals:form.secondaryGoals.filter(g=>g.trim())});}
  const cls=isDesktop?"d-modal":"sheet";
  const imp=form.importance||"normal";
  return(<div className={cls}>
    {!isDesktop&&<div className="hd"/>}
    <span className="sl">Estrategia del proyecto</span>
    <div style={{marginBottom:16}}>
      <span className="sl">Nombre del proyecto</span>
      <input className="si" value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={{fontWeight:500}}/>
    </div>
    <div style={{marginBottom:16}}>
      <span className="sl">Monto del deal (opcional)</span>
      <input className="si" value={form.monto||""} onChange={e=>setForm(f=>({...f,monto:e.target.value}))} placeholder="ej. 400k"/>
    </div>
    {goals&&goals.filter(g=>g.horizon==="anio").length>0&&(
      <div style={{marginBottom:16}}>
        <span className="sl">Meta vinculada (opcional)</span>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {goals.filter(g=>g.horizon==="anio").map(g=>(
            <button key={g.id} onClick={()=>setForm(f=>({...f,goal_id:f.goal_id===g.id?null:g.id}))}
              style={{textAlign:"left",padding:"8px 12px",borderRadius:8,border:`1px solid ${form.goal_id===g.id?"#9B8878":"#E5E1DB"}`,background:form.goal_id===g.id?"#F5F1ED":"white",color:form.goal_id===g.id?"#9B8878":"#6B6258",fontFamily:"'DM Sans'",fontSize:13,cursor:"pointer",transition:"all .15s"}}>
              {g.title}
            </button>
          ))}
        </div>
      </div>
    )}
    <div style={{marginBottom:16}}>
      <span className="sl">Importancia del proyecto</span>
      <div style={{display:"flex",gap:6}}>
        {Object.entries(IMPORTANCE).map(([k,v])=>(
          <button key={k} className="impb" onClick={()=>setForm(f=>({...f,importance:k}))}
            style={{background:imp===k?v.bg:"white",color:imp===k?v.color:"#B0AA9F",borderColor:imp===k?v.color:"#E5E1DB",fontWeight:imp===k?500:400}}>
            {v.label}
          </button>
        ))}
      </div>
    </div>
    <div style={{marginBottom:14}}>
      <span className="sl">Descripción</span>
      <textarea className="si" rows={3} placeholder="¿De qué trata este proyecto?" value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={{resize:"none",fontFamily:"'DM Sans'",lineHeight:1.6}}/>
    </div>
    <div style={{marginBottom:14}}>
      <span className="sl">Objetivo principal</span>
      <input className="si" value={form.mainGoal||""} onChange={e=>setForm(f=>({...f,mainGoal:e.target.value}))} placeholder="¿Cuál es el resultado clave?"/>
    </div>
    <div style={{marginBottom:8}}>
      <span className="sl">Objetivos secundarios</span>
      {form.secondaryGoals.map((g,i)=>(
        <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
          <input className="si" value={g} onChange={e=>updGoal(i,e.target.value)} placeholder={`Objetivo ${i+1}...`} style={{flex:1}}/>
          <button onClick={()=>remGoal(i)} style={{background:"none",border:"none",cursor:"pointer",color:"#C8C3BB",fontSize:16,padding:"0 4px"}}>✕</button>
        </div>
      ))}
      <button onClick={addGoal} style={{background:"none",border:"1px dashed #D5CFC8",borderRadius:8,cursor:"pointer",fontFamily:"'DM Sans'",fontSize:12,color:"#C8C3BB",padding:"8px 14px",width:"100%",marginTop:2}}>
        + agregar objetivo secundario
      </button>
    </div>
    <button className="sv" onClick={save}>Guardar</button>
  </div>);
}
function HoyView({overdueWork,projects,tasks,toggleDone,onDelete,onOpen,reorderTasks,sw,desktop}){
  const today = todayStr();
  const datedTasks = (tasks||[]).filter(t=>{
    const p=projects.find(x=>x.id===t.projectId);
    return p&&!t.done&&t.date;
  }).sort((a,b)=>a.date<b.date?-1:1);
  const todayTasks = datedTasks.filter(t=>t.date===today);
  const upcomingTasks = datedTasks.filter(t=>t.date>today);

  const SectionHeader = ({label,color,count}) => (
    <div style={{display:"flex",alignItems:"center",gap:8,
      ...(desktop
        ? {marginBottom:12,paddingBottom:8,borderBottom:"1px solid #EAE6E0"}
        : {padding:"14px 20px 6px"}
      )}}>
      <div style={{width:5,height:5,borderRadius:"50%",background:color}}/>
      <span style={{fontFamily:"'DM Sans'",fontSize:11,color,letterSpacing:".08em",textTransform:"uppercase"}}>
        {label}{count>0&&` · ${count}`}
      </span>
      {desktop&&count>0&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB",marginLeft:"auto"}}>{count}</span>}
    </div>
  );

  const TaskList = ({tasks,overdue}) => desktop
    ? <DTaskList tasks={tasks} projects={projects} onToggle={toggleDone} onDelete={onDelete} onOpen={onOpen} overdue={overdue} reorderTasks={reorderTasks}/>
    : <TaskRows tasks={tasks} projects={projects} onToggle={toggleDone} onDelete={onDelete} onOpen={onOpen} overdue={overdue} reorderTasks={reorderTasks} {...(sw||{})}/>;

  const isEmpty = todayTasks.length===0&&upcomingTasks.length===0&&overdueWork.length===0;
  if(isEmpty) return(
    <div style={{textAlign:"center",padding:desktop?"60px 0":"32px 0 8px",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14}}>Todo al día ·</div>
  );

  if(desktop) return(
    <div>
      <div style={{display:"flex",gap:48,alignItems:"flex-start",marginBottom:overdueWork.length>0?40:0}}>
        <div style={{flex:1,minWidth:0}}>
          <SectionHeader label="Vencen hoy" color="#9B8878" count={todayTasks.length}/>
          {todayTasks.length>0
            ?<TaskList tasks={todayTasks}/>
            :<div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",padding:"8px 0"}}>Sin tareas para hoy ·</div>
          }
        </div>
        <div style={{width:1,background:"#EAE6E0",alignSelf:"stretch",flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <SectionHeader label="Próximamente" color="#B0AA9F" count={upcomingTasks.length}/>
          {upcomingTasks.length>0
            ?<TaskList tasks={upcomingTasks}/>
            :<div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",padding:"8px 0"}}>Sin tareas próximas ·</div>
          }
        </div>
      </div>
      {overdueWork.length>0&&<>
        <div style={{height:1,background:"#EAE6E0",marginBottom:20}}/>
        <SectionHeader label="Vencidas" color="#C4A882" count={overdueWork.length}/>
        <TaskList tasks={overdueWork} overdue/>
      </>}
    </div>
  );

  return(
    <div style={{paddingBottom:16}}>
      {todayTasks.length>0&&<><SectionHeader label="Vencen hoy" color="#9B8878" count={todayTasks.length}/><TaskList tasks={todayTasks}/></>}
      {upcomingTasks.length>0&&<><SectionHeader label="Próximamente" color="#B0AA9F" count={upcomingTasks.length}/><TaskList tasks={upcomingTasks}/></>}
      {overdueWork.length>0&&<><SectionHeader label="Vencidas" color="#C4A882" count={overdueWork.length}/><TaskList tasks={overdueWork} overdue/></>}
    </div>
  );
}

function AppLayout({tasks,projects,goals,view,setView,activeArea,setActiveArea,activeProjId,setActiveProjId,focusMode,setFocusMode,points,treeLevel,TREE_LEVELS,celebrate,rescheduledCount,completeProject,completeGoal,overdueWork,todayWork,upcomingWork,projectsForArea,tasksForProject,toggleDone,deleteTask,deleteProject,addTask,addProject,reorderTasks,reorderProjects,reorderGoals,addGoal,updateGoal,deleteGoal,setSheet,setAddSheet,setNewProjSheet,setPlanSheet,setGoalSheet,sw,sheets,signOut,isOnline,desktop}){
  const pad = desktop ? "48px" : "20px";
  const titleSize = desktop ? 32 : 26;
  const headerPadding = desktop ? "28px 48px 0" : "52px 20px 12px";
  const contentPadding = desktop ? "24px 48px 48px" : "0";

  return(
    <div style={{
      ...(desktop ? {height:"100vh",overflow:"hidden"} : {maxWidth:430,margin:"0 auto",minHeight:"100vh"}),
      background:"#F5F2EE",fontFamily:"'DM Sans',sans-serif",display:"flex",flexDirection:"column",position:"relative"
    }}>
      <AppStyles/>

      {/* Header */}
      <div style={{padding:headerPadding,boxSizing:"border-box"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase"}}>
            {new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {!isOnline&&<span style={{fontFamily:"'DM Sans'",fontSize:10,color:"#C4A882",background:"#FBF8F2",padding:"2px 8px",borderRadius:99,border:"1px solid #F0DFA0"}}>sin conexión</span>}
            <button onClick={()=>{const nf=!focusMode;setFocusMode(nf);if(!desktop)trackEvent(nf?"focus_mode_on":"focus_mode_off",null,null,{tab:view});}}
              style={{background:focusMode?"#2C2825":"none",color:focusMode?"white":"#C8C3BB",border:`1px solid ${focusMode?"#2C2825":"#E5E1DB"}`,borderRadius:99,padding:"3px 12px",fontFamily:"'DM Sans'",fontSize:10,cursor:"pointer",transition:"all .2s",letterSpacing:".06em"}}>
              {focusMode?"◈ Foco":"◈"}
            </button>
            <button onClick={signOut} style={{background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Sans'",fontSize:11,color:"#D5CFC8",padding:0}}>↩</button>
          </div>
        </div>

        <h1 style={{fontSize:titleSize,fontWeight:300,color:"#2C2825",letterSpacing:"-.02em",marginBottom:desktop?16:12,fontFamily:"'DM Sans',sans-serif",lineHeight:1.1}}>
          {view==="hoy"?"Hoy":view==="tareas"?"Tareas":view==="proyectos"?"Proyectos":view==="metas"?"Metas":""}
        </h1>

        {/* Nav tabs */}
        <div style={{display:"flex",gap:desktop?3:4,flexWrap:desktop?"wrap":"nowrap",overflowX:desktop?"visible":"auto"}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>{setView(n.id);if(desktop)setActiveProjId(null);}}
              className={desktop?"":"m-np"}
              style={{
                padding:desktop?"6px 16px":"5px 10px",
                borderRadius:99,border:"none",cursor:"pointer",
                background:view===n.id?"#2C2825":"transparent",
                color:view===n.id?"#F5F2EE":"#B0AA9F",
                fontFamily:"'DM Sans'",fontSize:desktop?13:12,fontWeight:view===n.id?500:400,
                transition:"all .2s",whiteSpace:"nowrap",flexShrink:0
              }}>
              {n.label}
            </button>
          ))}
        </div>

        {/* Area pills */}
        {(view==="tareas"||view==="proyectos")&&(
          <div style={{display:"flex",gap:desktop?6:4,marginTop:desktop?14:12,overflowX:"auto",paddingBottom:2}}>
            {Object.entries(AREAS).map(([k,a])=>(
              <button key={k} onClick={()=>{setActiveArea(k);if(desktop)setActiveProjId(null);}}
                className={desktop?"":"m-at"}
                style={{
                  padding:desktop?"5px 14px":"4px 10px",
                  borderRadius:99,border:desktop?"none":`1px solid ${activeArea===k?a.color:"transparent"}`,
                  cursor:"pointer",
                  background:activeArea===k?a.color:"transparent",
                  color:activeArea===k?"white":a.color,
                  fontFamily:"'DM Sans'",fontSize:desktop?12:11,fontWeight:500,transition:"all .2s",whiteSpace:"nowrap",flexShrink:0
                }}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{height:1,background:"#EAE6E0",margin:desktop?"16px 0 0":"0 20px"}}/>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:contentPadding,boxSizing:"border-box"}}>

        {view==="hoy"&&(
          focusMode
            ?<div style={desktop?{}:{padding:"16px 20px 0"}}>
               <FocusMode overdueWork={overdueWork} todayWork={todayWork} upcomingWork={upcomingWork} tasks={tasks} projects={projects} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet} desktop={desktop}/>
             </div>
            :<HoyView overdueWork={overdueWork} projects={projects} tasks={tasks} toggleDone={toggleDone} onDelete={deleteTask} onOpen={setSheet} reorderTasks={reorderTasks} sw={sw} desktop={desktop}/>
        )}

        {view==="tareas"&&(<>
          {focusMode
            ?<FocusProjectMode projects={projectsForArea(activeArea)} tasksForProject={tasksForProject} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet} onAddTask={(proj)=>setAddSheet({projectId:proj.id,area:activeArea,projectName:proj.name})} desktop={desktop}/>
            :<GroupedProjectsView projects={projectsForArea(activeArea).filter(p=>!activeProjId||p.id===activeProjId)} tasksForProject={tasksForProject} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet} onAddTask={(proj)=>setAddSheet({projectId:proj.id,area:activeArea,projectName:proj.name})} onComplete={completeProject} reorderTasks={reorderTasks} sw={sw} desktop={desktop}/>
          }
          {projectsForArea(activeArea).length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14}}>Sin proyectos. Creá uno desde Proyectos.</div>}
        </>)}

        {view==="proyectos"&&(<div style={desktop?{}:{paddingBottom:0}}>
          <div style={{padding:desktop?"0 0 20px":"14px 20px 4px"}}>
            <p style={{fontFamily:"'DM Sans'",fontSize:13,color:"#B0AA9F",lineHeight:1.6}}>Definí propósito y objetivos de cada proyecto.</p>
          </div>
          {focusMode
            ?<ProjectFocusView projects={projectsForArea(activeArea)} onEdit={setPlanSheet} onDelete={deleteProject} onComplete={completeProject} desktop={desktop}/>
            :(desktop
              ?<DraggableProjectGrid projects={projectsForArea(activeArea)} onEdit={setPlanSheet} onDelete={deleteProject} onComplete={completeProject} onReorder={reorderProjects}/>
              :<DraggableProjectList projects={projectsForArea(activeArea)} onEdit={setPlanSheet} onDelete={deleteProject} onComplete={completeProject} onReorder={reorderProjects}/>
            )
          }
          {projectsForArea(activeArea).length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14}}>Sin proyectos aún.</div>}
          <button className={desktop?"d-newp":"m-newp"} style={desktop?{marginTop:16}:{}}
            onClick={()=>setNewProjSheet({area:activeArea})}>
            {desktop?`+ Nuevo proyecto en ${AREAS[activeArea]?.label}`:<><span style={{fontSize:18,lineHeight:1}}>+</span> Nuevo proyecto</>}
          </button>
        </div>)}

        {view==="metas"&&<MetasView goals={goals} projects={projects} onNew={(h)=>setGoalSheet({title:"",description:"",horizon:h,parentId:null})} onEdit={(g)=>setGoalSheet(g)} onReorder={reorderGoals} completeGoal={completeGoal} isDesktop={desktop}/>}

        {view==="cerezo"&&<CerezoView points={points} treeLevel={treeLevel} TREE_LEVELS={TREE_LEVELS} desktop={desktop}/>}

        {view==="analitica"&&(
          <div style={desktop?{maxWidth:900,width:"100%"}:{}}>
            <AnaliticaView tasks={tasks} projects={projects} goals={goals} rescheduledCount={rescheduledCount} desktop={desktop}/>
          </div>
        )}
      </div>

      {/* Clarity wordmark */}
      <div style={{textAlign:"center",padding:desktop?"0 0 24px":"16px 0 28px",fontFamily:"'DM Sans'",fontSize:9,letterSpacing:".22em",textTransform:"uppercase",color:"#D5CFC8",userSelect:"none"}}>
        Clarity
      </div>
      <CelebrationToast celebrate={celebrate}/>
      {sheets}
    </div>
  );
}

import { useState, useRef, useMemo, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  "https://wdncosdqufitaxddnrfm.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkbmNvc2RxdWZpdGF4ZGRucmZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MzE0OTUsImV4cCI6MjA5MjQwNzQ5NX0.HndgrvPhhV8Ty13ieyfJwgsM80erG6mPufHGV90jT10"
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
const taskFromDb = r => ({ id:r.id, projectId:r.project_id, title:r.title, type:r.type||"normal", date:r.date||"", responsable:r.responsable||"", notes:r.notes||"", done:r.done||false, sortOrder:r.sort_order||0 });

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
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F7F5F2",fontFamily:"'Lora',serif",flexDirection:"column",gap:32,padding:32}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,color:"#C8C3BB",marginBottom:16}}>◈</div>
        <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",letterSpacing:".14em",textTransform:"uppercase"}}>Clarity</div>
      </div>
      <button onClick={login} style={{display:"flex",alignItems:"center",gap:12,background:"#2C2825",color:"white",border:"none",borderRadius:12,padding:"14px 28px",fontSize:15,fontFamily:"'DM Sans'",fontWeight:500,cursor:"pointer",opacity:loading?.6:1}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        {loading ? "Conectando..." : "Continuar con GitHub"}
      </button>
      <div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#C8C3BB",textAlign:"center"}}>Cada usuario ve solo sus propios datos</div>
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
  const [focusMode, setFocusMode] = useState(false);
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
      setProjects((ps.data||[]).map(projFromDb));
      setTasks((ts.data||[]).map(taskFromDb));
      setGoals((gs.data||[]).map(goalFromDb));
      setLoading(false);
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
    await safeUpsert("tasks",taskToDb(u,uid));
  }
  async function deleteTask(id){
    setTasks(ts=>ts.filter(t=>t.id!==id)); setSwipedId(null); setSheet(null);
    await safeDelete("tasks",id);
  }
  async function updateTask(u){
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
  async function addGoal(g){
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

  const props={tasks,projects,goals,view,setView,focusMode,setFocusMode,activeArea,setActiveArea,activeProjId,setActiveProjId,overdueWork,todayWork,upcomingWork,projectsForArea,tasksForProject,toggleDone,deleteTask,deleteProject,addTask,addProject,updateProject,reorderTasks,reorderProjects,reorderGoals,addGoal,updateGoal,deleteGoal,setSheet,setAddSheet,setNewProjSheet,setPlanSheet,setGoalSheet,sw,sheets,signOut,isOnline};
  return isDesktop?<DesktopLayout {...props}/>:<MobileLayout {...props}/>;
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
function DesktopLayout({tasks,projects,goals,view,setView,activeArea,setActiveArea,activeProjId,setActiveProjId,focusMode,setFocusMode,overdueWork,todayWork,upcomingWork,projectsForArea,tasksForProject,toggleDone,deleteTask,deleteProject,addTask,addProject,reorderTasks,reorderProjects,reorderGoals,addGoal,updateGoal,deleteGoal,setSheet,setAddSheet,setNewProjSheet,setPlanSheet,setGoalSheet,sw,sheets,signOut,isOnline}){
  return(
    <div style={{display:"flex",height:"100vh",background:"#F7F5F2",fontFamily:"'Lora',serif",overflow:"hidden"}}>
      <DesktopStyles/>

      {/* Sidebar */}
      <div style={{width:220,background:"#F0EDE8",borderRight:"1px solid #E5E1DB",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
        <div style={{padding:"24px 16px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontFamily:"'DM Sans'",fontSize:12,fontWeight:500,color:"#9B948C",letterSpacing:".1em",textTransform:"uppercase"}}>Clarity</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {!isOnline&&<span style={{fontFamily:"'DM Sans'",fontSize:10,color:"#C4A882"}}>·</span>}
            <button onClick={signOut} style={{background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB",padding:0}} title="Cerrar sesión">↩</button>
          </div>
        </div>

        {/* Main nav */}
        <div style={{padding:"0 8px",display:"flex",flexDirection:"column",gap:1}}>
          {NAV.map(n=>(
            <button key={n.id} className="d-nav" onClick={()=>{setView(n.id);setActiveProjId(null);}}
              style={{background:view===n.id?"#E8E3DC":"none",color:view===n.id?"#3A3530":"#9B948C"}}>
              {n.label}
            </button>
          ))}
        </div>

        <div style={{height:1,background:"#E5E1DB",margin:"10px 14px"}}/>

        {/* Projects list - only trabajo */}
        <div style={{flex:1,overflowY:"auto",padding:"0 8px 16px"}}>
          <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",letterSpacing:".1em",textTransform:"uppercase",padding:"4px 8px 6px",fontWeight:500}}>Trabajo</div>
          {projectsForArea("trabajo").map(proj=>{
            const pending=tasks.filter(t=>t.projectId===proj.id&&!t.done).length;
            const isAct=activeProjId===proj.id;
            return(
              <button key={proj.id} className="d-proj" onClick={()=>{setView("tareas");setActiveArea("trabajo");setActiveProjId(proj.id);}}
                style={{background:isAct?"#E8E3DC":"none",color:isAct?"#3A3530":"#7A736C"}}>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,textAlign:"left",fontSize:13}}>{proj.name}</span>
                {proj.monto&&<span style={{fontFamily:"'DM Sans'",fontSize:10,color:"#9B8878",flexShrink:0}}>{proj.monto}</span>}
                {pending>0&&<span style={{fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",flexShrink:0}}>{pending}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"20px 32px 12px",borderBottom:"1px solid #EAE6E0",background:"#F7F5F2",flexShrink:0}}>
          <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",letterSpacing:".1em",textTransform:"uppercase",marginBottom:3}}>
            {new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <h1 style={{fontSize:22,fontWeight:600,color:"#2C2825",letterSpacing:"-.02em"}}>
              {view==="hoy"?"Hoy":view==="tareas"?(activeProjId?projects.find(q=>q.id===activeProjId)?.name:`Tareas · ${AREAS[activeArea].label}`):view==="proyectos"?`Proyectos · ${AREAS[activeArea]?.label}`:"Metas"}
            </h1>
            {(view==="tareas"||view==="proyectos")&&(
              <div style={{display:"flex",gap:6}}>
                {Object.entries(AREAS).map(([k,a])=>(
                  <button key={k} className="d-apill" onClick={()=>{setActiveArea(k);setActiveProjId(null);}}
                    style={{background:activeArea===k?a.color:"white",color:activeArea===k?"white":a.color,border:`1px solid ${activeArea===k?a.color:"#E5E1DB"}`}}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:"auto",padding:"28px 32px 40px"}}>
          {view==="hoy"&&(<>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:20}}>
              <button onClick={()=>setFocusMode(false)}
                style={{fontFamily:"'DM Sans'",fontSize:12,padding:"5px 14px",borderRadius:99,border:"none",cursor:"pointer",background:!focusMode?"#2C2825":"transparent",color:!focusMode?"white":"#B0AA9F",transition:"all .2s"}}>
                Lista
              </button>
              <button onClick={()=>setFocusMode(true)}
                style={{fontFamily:"'DM Sans'",fontSize:12,padding:"5px 14px",borderRadius:99,border:"none",cursor:"pointer",background:focusMode?"#2C2825":"transparent",color:focusMode?"white":"#B0AA9F",transition:"all .2s"}}>
                Modo foco
              </button>
            </div>
            {focusMode
              ?<FocusMode overdueWork={overdueWork} todayWork={todayWork} upcomingWork={upcomingWork} projects={projects} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet} desktop/>
              :<DHoy overdueWork={overdueWork} todayWork={todayWork} upcomingWork={upcomingWork} projects={projects} toggleDone={toggleDone} onDelete={deleteTask} onOpen={setSheet} reorderTasks={reorderTasks} sw={sw}/>
            }
          </>)}
          {view==="tareas"&&(
            <div style={{maxWidth:720}}>
              <GroupedProjectsView
                projects={projectsForArea(activeArea).filter(p=>!activeProjId||p.id===activeProjId)}
                tasksForProject={tasksForProject}
                onToggle={toggleDone}
                onDelete={deleteTask}
                onOpen={setSheet}
                onAddTask={(proj)=>setAddSheet({projectId:proj.id,area:activeArea,projectName:proj.name})}
                reorderTasks={reorderTasks}
                sw={sw}
                desktop
              />
              {projectsForArea(activeArea).length===0&&<div style={{color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14,padding:"32px 0"}}>Sin proyectos. Creá uno desde Proyectos.</div>}
            </div>
          )}
          {view==="proyectos"&&(
            <div style={{maxWidth:860}}>
              <p style={{fontFamily:"'DM Sans'",fontSize:13,color:"#B0AA9F",marginBottom:20,lineHeight:1.6}}>Definí propósito y objetivos de cada proyecto.</p>
              <DraggableProjectGrid projects={projectsForArea(activeArea)} onEdit={setPlanSheet} onDelete={deleteProject} onReorder={reorderProjects}/>
              {projectsForArea(activeArea).length===0&&<div style={{color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14,padding:"32px 0"}}>Sin proyectos aún.</div>}
              <button className="d-newp" style={{marginTop:16}} onClick={()=>setNewProjSheet({area:activeArea})}>+ Nuevo proyecto en {AREAS[activeArea].label}</button>
            </div>
          )}
          {view==="metas"&&<MetasView goals={goals} projects={projects} onNew={(h)=>setGoalSheet({title:"",description:"",horizon:h,parentId:null})} onEdit={(g)=>setGoalSheet(g)} onReorder={reorderGoals} isDesktop={true}/>}
        </div>
      </div>
      {sheets}
    </div>
  );
}


function DHoy({overdueWork,todayWork,upcomingWork,projects,toggleDone,onDelete,onOpen,reorderTasks,sw}){
  return(
    <div style={{maxWidth:680}}>
      {overdueWork.length>0&&(<div style={{marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,paddingBottom:6,borderBottom:"1px solid #EAE6E0"}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:"#C4A882"}}/>
          <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C4A882",letterSpacing:".08em",textTransform:"uppercase"}}>De días anteriores · {overdueWork.length}</span>
        </div>
        <DTaskList tasks={overdueWork} projects={projects} onToggle={toggleDone} onDelete={onDelete} onOpen={onOpen} overdue reorderTasks={reorderTasks}/>
      </div>)}
      {todayWork.length>0&&(<div style={{marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,paddingBottom:6,borderBottom:"1px solid #EAE6E0"}}><div style={{width:5,height:5,borderRadius:"50%",background:"#9B8878",flexShrink:0}}/><span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#9B8878",letterSpacing:".08em",textTransform:"uppercase"}}>Para hoy</span></div>
        <DTaskList tasks={todayWork} projects={projects} onToggle={toggleDone} onDelete={onDelete} onOpen={onOpen} reorderTasks={reorderTasks}/>
      </div>)}
      {overdueWork.length===0&&todayWork.length===0&&<div style={{padding:"24px 0 8px",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14}}>Todo al día ·</div>}
      {upcomingWork.length>0&&<UpcomingSection tasks={upcomingWork} projects={projects} onToggle={toggleDone} onDelete={onDelete} onOpen={onOpen} reorderTasks={reorderTasks} sw={sw} desktop/>}
    </div>
  );
}

function UpcomingSection({tasks,projects,onToggle,onDelete,onOpen,reorderTasks,sw,desktop}){
  // Group by project
  const projectIds = [...new Set(tasks.map(t=>t.projectId))];
  const [open,setOpen]=useState({});

  return(
    <div style={{marginTop:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,paddingBottom:6,borderBottom:"1px solid #EAE6E0",padding:desktop?"0 0 6px":"0 20px 6px"}}><div style={{width:5,height:5,borderRadius:"50%",background:"#B0AA9F",flexShrink:0}}/><span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase"}}>Lo antes posible</span></div>
      {projectIds.map(pid=>{
        const proj=projects.find(p=>p.id===pid);
        const ptasks=tasks.filter(t=>t.projectId===pid).sort(taskSort);
        if(!proj||ptasks.length===0) return null;
        const isOpen=open[pid];
        const imp=IMPORTANCE[proj.importance||"normal"];
        return(
          <div key={pid} style={{marginBottom:4}}>
            <div onClick={()=>setOpen(o=>({...o,[pid]:!o[pid]}))}
              style={{display:"flex",alignItems:"center",gap:8,padding:desktop?"10px 0":"10px 20px",cursor:"pointer",userSelect:"none",borderBottom:"1px solid #EAE6E0"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:AREAS[proj.area]?.color||"#9B8878",flexShrink:0}}/>
              <span style={{fontFamily:"'DM Sans'",fontSize:14,color:"#2C2825",fontWeight:400,flex:1}}>{proj.name}</span>
              <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F"}}>{ptasks.length}</span>
              <span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#B0AA9F",marginLeft:4}}>{isOpen?"▾":"›"}</span>
            </div>
            {isOpen&&(desktop
              ?<DTaskList tasks={ptasks} projects={[]} onToggle={onToggle} onDelete={onDelete} onOpen={onOpen} reorderTasks={reorderTasks}/>
              :<TaskRows tasks={ptasks} projects={[]} onToggle={onToggle} onDelete={onDelete} onOpen={onOpen} reorderTasks={reorderTasks} {...(sw||{})}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DProjBlock({project,area,tasks,onToggle,onOpen,onAddTask,reorderTasks,sw}){
  const [open,setOpen]=useState(false);
  const imp=IMPORTANCE[project.importance||"normal"];
  const pending=tasks.filter(t=>!t.done).length;
  const sorted=[...tasks].sort(taskSort);
  return(
    <div style={{marginBottom:10,border:"1px solid #EAE6E0",borderRadius:12,overflow:"hidden",background:"white"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",cursor:"pointer"}} onClick={()=>setOpen(o=>!o)}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:AREAS[area].color,opacity:.7}}/>
          <span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,color:"#3A3530"}}>{project.name}</span>
          {project.monto&&<span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#9B8878",fontWeight:500}}>{project.monto}</span>}
          {pending>0&&<span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#B0AA9F"}}>{pending} pendientes</span>}
          <span style={{fontFamily:"'DM Sans'",fontSize:11,color:imp.color,background:imp.bg,padding:"2px 8px",borderRadius:99}}>{imp.label}</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
          <button className="d-ib" onClick={onAddTask}>+ tarea</button>
          <span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#C8C3BB",transform:open?"rotate(0)":"rotate(-90deg)",display:"inline-block",transition:"transform .2s",cursor:"pointer"}} onClick={()=>setOpen(o=>!o)}>▾</span>
        </div>
      </div>
      {open&&(sorted.length>0?<DTaskList tasks={sorted} projects={[]} onToggle={onToggle} onOpen={onOpen} area={area} reorderTasks={reorderTasks}/>:<div style={{padding:"6px 18px 14px",fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",fontStyle:"italic"}}>Sin tareas · click en + tarea</div>)}
    </div>
  );
}

function DPlanBlock({project,onEdit,onDelete}){
  const [conf,setConf]=useState(false);
  const [exp,setExp]=useState(false);
  const imp=IMPORTANCE[project.importance||"normal"];
  const has=project.description||project.mainGoal||(project.secondaryGoals?.length>0);
  return(
    <div style={{border:"1px solid #EAE6E0",borderRadius:12,background:"white",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"14px 16px",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setExp(e=>!e)}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
            <span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,color:"#2C2825"}}>{project.name}</span>
            {project.monto&&<span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#9B8878",fontWeight:500}}>{project.monto}</span>}
            <span style={{fontFamily:"'DM Sans'",fontSize:11,color:imp.color,background:imp.bg,padding:"2px 7px",borderRadius:99}}>{imp.label}</span>
          </div>
          {project.mainGoal&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#9B948C",lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{project.mainGoal}</div>}
          {!has&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#D5CFC8",fontStyle:"italic"}}>Sin objetivos definidos</div>}
        </div>
        <div style={{display:"flex",gap:5,flexShrink:0}}>
          <button className="d-ib" onClick={onEdit}>Editar</button>
          {conf?<><button className="d-ib" style={{color:"#C4896A",borderColor:"#C4896A"}} onClick={onDelete}>Confirmar</button><button className="d-ib" onClick={()=>setConf(false)}>✕</button></>:<button className="d-ib" style={{color:"#D5CFC8"}} onClick={()=>setConf(true)}>Eliminar</button>}
        </div>
      </div>
      {exp&&has&&<div style={{padding:"0 16px 14px",borderTop:"1px solid #F5F2EE"}}>
        {project.description&&<p style={{fontFamily:"'DM Sans'",fontSize:13,color:"#6B6258",margin:"10px 0 8px",lineHeight:1.6}}>{project.description}</p>}
        {project.mainGoal&&<div style={{marginBottom:8}}><div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase",marginBottom:3}}>Objetivo principal</div><div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#3A3530",fontWeight:500}}>{project.mainGoal}</div></div>}
        {project.secondaryGoals?.length>0&&<div><div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase",marginBottom:5}}>Secundarios</div>{project.secondaryGoals.map((g,i)=><div key={i} style={{display:"flex",alignItems:"flex-start",gap:6,marginBottom:3}}><div style={{width:3,height:3,borderRadius:"50%",background:"#C8C3BB",flexShrink:0,marginTop:6}}/><span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#6B6258"}}>{g}</span></div>)}</div>}
      </div>}
    </div>
  );
}

function DTaskList({tasks,projects,onToggle,onDelete,onOpen,overdue=false,reorderTasks}){
  const [localOrder,setLocalOrder]=useState(null);
  const [draggingId,setDraggingId]=useState(null);
  const [overId,setOverId]=useState(null);
  const sorted=localOrder
    ?localOrder.map(id=>tasks.find(t=>t.id===id)).filter(Boolean)
    :[...tasks].sort(taskSort);

  function onDragStart(e,id){
    e.dataTransfer.effectAllowed="move";
    e.dataTransfer.setData("text/plain",id);
    setDraggingId(id);
  }
  function onDragEnter(e,id){
    e.preventDefault();
    setOverId(id);
  }
  function onDragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect="move"; }
  function onDrop(e,id){
    e.preventDefault();
    const dragId=e.dataTransfer.getData("text/plain");
    if(!dragId||dragId===id){setDraggingId(null);setOverId(null);return;}
    const ids=sorted.map(t=>t.id);
    const fi=ids.indexOf(dragId), ti=ids.indexOf(id);
    if(fi<0||ti<0){setDraggingId(null);setOverId(null);return;}
    const r=[...ids]; r.splice(fi,1); r.splice(ti,0,dragId);
    setLocalOrder(r); reorderTasks&&reorderTasks(r);
    setDraggingId(null); setOverId(null);
  }
  function onDragEnd(){ setDraggingId(null); setOverId(null); }

  return(
    <div>
      {sorted.map((task,i)=>{
        const proj=projects.find(p=>p.id===task.projectId);
        const isDragging=draggingId===task.id;
        const isOver=overId===task.id&&draggingId&&draggingId!==task.id;
        return(
          <div key={task.id}
            draggable="true"
            onDragStart={e=>onDragStart(e,task.id)}
            onDragEnter={e=>onDragEnter(e,task.id)}
            onDragOver={onDragOver}
            onDrop={e=>onDrop(e,task.id)}
            onDragEnd={onDragEnd}
            style={{
              padding:"12px 4px",
              borderTop:isOver?"2px solid #9B8878":i>0?"1px solid #EAE6E0":"none",
              display:"flex",alignItems:"center",gap:12,
              cursor:"grab",
              background:isDragging?"#EDE9E4":isOver?"#F5F2EE":overdue?"#FBF8F4":"transparent",
              opacity:isDragging?.4:1,
              transition:"opacity .1s,background .1s"
            }}
            onClick={()=>{ if(!draggingId) onOpen(task); }}>
            <button className={`d-ci${task.done?" done":""}`} onClick={e=>{e.stopPropagation();onToggle(task.id);}}>
              {task.done&&<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2,6 5,9 10,3"/></svg>}
            </button>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'DM Sans'",fontSize:14,color:task.done?"#C8C3BB":overdue?"#9B8878":"#2C2825",textDecoration:task.done?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</div>
              <div style={{display:"flex",gap:8,marginTop:2}}>
                {proj&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#9B948C",fontWeight:500}}>{proj.name}</span>}
                {task.date&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:overdue?"#C4896A":"#9B948C"}}>{fmtDate(task.date)}</span>}
                {task.responsable&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#8A9E8A",fontWeight:500}}>→ {task.responsable}</span>}
                {task.notes&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#D5CFC8"}}>· nota</span>}
              </div>
            </div>
            <TypeDot type={task.type} done={task.done}/>
          </div>
        );
      })}
    </div>
  );
}


function DesktopStyles(){return(<style>{`
  @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}body{background:#F7F5F2;overflow:hidden;}
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

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE
// ═══════════════════════════════════════════════════════════════════════════════
function MobileLayout({tasks,projects,goals,view,setView,activeArea,setActiveArea,focusMode,setFocusMode,overdueWork,todayWork,upcomingWork,projectsForArea,tasksForProject,toggleDone,deleteTask,deleteProject,addTask,addProject,reorderTasks,reorderProjects,reorderGoals,addGoal,updateGoal,deleteGoal,setSheet,setAddSheet,setNewProjSheet,setPlanSheet,setGoalSheet,sw,sheets,signOut,isOnline}){
  return(
    <div style={{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"#F7F5F2",fontFamily:"'Lora',serif",position:"relative"}}>
      <MobileStyles/>
      <div style={{padding:"52px 20px 14px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",letterSpacing:".12em",textTransform:"uppercase"}}>
            {new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {!isOnline&&<span style={{fontFamily:"'DM Sans'",fontSize:10,color:"#C4A882",background:"#FBF8F2",padding:"2px 8px",borderRadius:99,border:"1px solid #F0DFA0"}}>sin conexión</span>}
            <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setFocusMode(f=>!f)}
              title={focusMode?"Salir del modo foco":"Modo foco"}
              style={{background:focusMode?"#6B6258":"none",color:focusMode?"white":"#C8C3BB",border:`1px solid ${focusMode?"#6B6258":"#E5E1DB"}`,borderRadius:99,padding:"4px 12px",fontFamily:"'DM Sans'",fontSize:11,cursor:"pointer",transition:"all .2s",letterSpacing:".04em"}}>
              {focusMode?"◈ Foco":"◈"}
            </button>
            <button onClick={signOut} style={{background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB",padding:0}}>↩</button>
          </div>
          </div>
        </div>
        <h1 style={{fontSize:24,fontWeight:500,color:"#2C2825",letterSpacing:"-.01em",marginBottom:16,fontFamily:"'DM Sans',sans-serif"}}>
          {view==="hoy"?"Hoy":view==="tareas"?"Tareas":view==="proyectos"?"Proyectos":view==="metas"?"Metas":"Estrategia"}
        </h1>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",gap:4}}>
            {NAV.map(v=>(
              <button key={v.id} className="m-np" onClick={()=>setView(v.id)}
                style={{background:view===v.id?"#2C2825":"transparent",color:view===v.id?"#F7F5F2":"#A09890"}}>
                {v.label}
              </button>
            ))}
          </div>

        </div>
        {(view==="tareas"||view==="proyectos"||view==="estrategia")&&(
          <div style={{display:"flex",gap:4,marginTop:12,overflowX:"auto",paddingBottom:2}}>
            {Object.entries(AREAS).map(([k,a])=>(
              <button key={k} className="m-at" onClick={()=>setActiveArea(k)}
                style={{background:activeArea===k?a.color:"transparent",color:activeArea===k?"white":a.color,border:`1px solid ${activeArea===k?a.color:"transparent"}`}}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{height:1,background:"#EAE6E0",margin:"0 20px"}}/>
      <div style={{paddingBottom:32}}>
        {view==="hoy"&&(<>
          {focusMode
            ?<FocusMode overdueWork={overdueWork} todayWork={todayWork} upcomingWork={upcomingWork} projects={projects} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet}/>
            :<>
              {overdueWork.length>0&&(<>
                <div style={{padding:"8px 20px 6px",display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:"#C4A882"}}/>
                  <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C4A882",letterSpacing:".08em",textTransform:"uppercase"}}>De días anteriores · {overdueWork.length}</span>
                </div>
                <TaskRows tasks={overdueWork} projects={projects} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet} overdue reorderTasks={reorderTasks} {...sw}/>
              </>)}
              {todayWork.length>0&&<>
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 20px 6px"}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:"#9B8878"}}/>
                  <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#9B8878",letterSpacing:".08em",textTransform:"uppercase"}}>Para hoy</span>
                </div>
                <TaskRows tasks={todayWork} projects={projects} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet} reorderTasks={reorderTasks} {...sw}/>
              </>}
              {overdueWork.length===0&&todayWork.length===0&&<div style={{textAlign:"center",padding:"32px 0 8px",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14}}>Todo al día ·</div>}
              {upcomingWork.length>0&&<UpcomingSection tasks={upcomingWork} projects={projects} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet} reorderTasks={reorderTasks} sw={sw}/>}
            </>
          }
        </>)}
        {view==="tareas"&&(<>
          {focusMode
            ?<FocusProject projects={projectsForArea(activeArea)} tasksForProject={tasksForProject} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet} onAddTask={(proj)=>setAddSheet({projectId:proj.id,area:activeArea,projectName:proj.name})}/>
            :<><GroupedProjectsView projects={projectsForArea(activeArea)} tasksForProject={tasksForProject} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet} onAddTask={(proj)=>setAddSheet({projectId:proj.id,area:activeArea,projectName:proj.name})} reorderTasks={reorderTasks} sw={sw}/></>
          }
          {projectsForArea(activeArea).length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14}}>Sin proyectos. Creá uno desde Proyectos.</div>}
        </>)}
        {view==="proyectos"&&(<>
          {focusMode
            ?<FocusPlan projects={projectsForArea(activeArea)} onEdit={setPlanSheet} onDelete={deleteProject}/>
            :<>
              <div style={{padding:"14px 20px 4px"}}><p style={{fontFamily:"'DM Sans'",fontSize:13,color:"#B0AA9F",lineHeight:1.6}}>Definí propósito y objetivos de cada proyecto.</p></div>
              <DraggableProjectList projects={projectsForArea(activeArea)} onEdit={setPlanSheet} onDelete={deleteProject} onReorder={reorderProjects}/>
              {projectsForArea(activeArea).length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14}}>Sin proyectos aún.</div>}
              <button className="m-newp" onClick={()=>setNewProjSheet({area:activeArea})}><span style={{fontSize:18,lineHeight:1}}>+</span> Nuevo proyecto</button>
            </>
          }
        </>)}
        {view==="metas"&&<MetasView goals={goals} projects={projects} onNew={(h)=>setGoalSheet({title:"",description:"",horizon:h,parentId:null})} onEdit={(g)=>setGoalSheet(g)} onReorder={reorderGoals} isDesktop={false}/>}
        {view==="estrategia"&&(<>
          <div style={{padding:"14px 20px 4px"}}><p style={{fontFamily:"'DM Sans'",fontSize:13,color:"#B0AA9F",lineHeight:1.6}}>Definí propósito y objetivos de cada proyecto.</p></div>
          {projectsForArea(activeArea).map(proj=>(
            <PlanBlock key={proj.id} project={proj} onEdit={()=>setPlanSheet(proj)} onDelete={()=>deleteProject(proj.id)}/>
          ))}
          {projectsForArea(activeArea).length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14}}>Sin proyectos aún.</div>}
          <button className="m-newp" onClick={()=>setNewProjSheet({area:activeArea})}><span style={{fontSize:18,lineHeight:1}}>+</span> Nuevo proyecto</button>
        </>)}
      </div>
      {sheets}
    </div>
  );
}




// ─── Focus Project (Tareas tab) ───────────────────────────────────────────────
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
    <div style={{display:"flex",flexDirection:"column",minHeight:"75vh"}}>
      {/* Project card - centered, fills space */}
      <div style={{flex:1,display:"flex",flexDirection:"column",padding:"8px 20px"}}
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
        <div style={{fontFamily:"'Lora',serif",fontSize:26,fontWeight:500,color:"#2C2825",lineHeight:1.2,marginBottom:20}}>
          {proj.name}
        </div>

        {/* Tasks */}
        <div style={{flex:1,background:"white",borderRadius:14,border:"1px solid #EAE6E0",overflow:"hidden",marginBottom:12}}>
          {tasks.length===0
            ?<div style={{padding:"32px 20px",textAlign:"center",fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",fontStyle:"italic"}}>Sin tareas pendientes</div>
            :tasks.map((task,i)=>(
              <div key={task.id} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderTop:i>0?"1px solid #F5F2EE":"none",cursor:"pointer"}}
                onClick={()=>onOpen(task)}>
                <button style={{width:24,height:24,borderRadius:"50%",border:"1.5px solid #C8C3BB",background:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
                  onClick={e=>{e.stopPropagation();onToggle(task.id);}}>
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
function FocusPlan({projects,onEdit,onDelete}){
  const [idx,setIdx]=useState(0);
  const [conf,setConf]=useState(false);
  const touchStartX=useRef(0),touchStartY=useRef(0);

  useEffect(()=>{ setConf(false); },[idx]);
  useEffect(()=>{ if(idx>=projects.length) setIdx(Math.max(0,projects.length-1)); },[projects.length]);

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
    if(dx<-50&&idx<projects.length-1) setIdx(i=>i+1);
    if(dx>50&&idx>0) setIdx(i=>i-1);
  }

  return(
    <div style={{display:"flex",flexDirection:"column",minHeight:"75vh"}}>
      <div style={{flex:1,padding:"8px 20px"}} onTouchStart={swipeStart} onTouchEnd={swipeEnd}>

        {/* Importance */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <span style={{fontFamily:"'DM Sans'",fontSize:11,color:imp.color,background:imp.bg,padding:"3px 10px",borderRadius:99}}>{imp.label}</span>
          {proj.monto&&<span style={{fontFamily:"'DM Sans'",fontSize:13,color:"#9B8878",fontWeight:500}}>{proj.monto}</span>}
        </div>

        {/* Name */}
        <div style={{fontFamily:"'Lora',serif",fontSize:26,fontWeight:500,color:"#2C2825",lineHeight:1.2,marginBottom:20}}>
          {proj.name}
        </div>

        {/* Content card */}
        <div style={{background:"white",borderRadius:14,border:"1px solid #EAE6E0",padding:"20px",marginBottom:12}}>
          {proj.description&&<p style={{fontFamily:"'DM Sans'",fontSize:14,color:"#6B6258",marginBottom:16,lineHeight:1.6}}>{proj.description}</p>}
          {proj.mainGoal&&<div style={{marginBottom:proj.secondaryGoals?.length>0?16:0}}>
            <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase",marginBottom:4}}>Objetivo principal</div>
            <div style={{fontFamily:"'DM Sans'",fontSize:15,color:"#2C2825",fontWeight:500,lineHeight:1.4}}>{proj.mainGoal}</div>
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
        </div>

        {/* Actions */}
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onEdit(proj)} style={{flex:1,background:"none",border:"1px solid #E5E1DB",borderRadius:10,padding:"11px",fontFamily:"'DM Sans'",fontSize:13,color:"#6B6258",cursor:"pointer"}}>
            Editar
          </button>
          {conf
            ?<><button onClick={()=>onDelete(proj.id)} style={{flex:1,background:"none",border:"1px solid #C4896A",borderRadius:10,padding:"11px",fontFamily:"'DM Sans'",fontSize:13,color:"#C4896A",cursor:"pointer"}}>Confirmar</button>
              <button onClick={()=>setConf(false)} style={{flex:1,background:"none",border:"1px solid #E5E1DB",borderRadius:10,padding:"11px",fontFamily:"'DM Sans'",fontSize:13,color:"#B0AA9F",cursor:"pointer"}}>✕</button></>
            :<button onClick={()=>setConf(true)} style={{flex:1,background:"none",border:"1px solid #E5E1DB",borderRadius:10,padding:"11px",fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",cursor:"pointer"}}>Eliminar</button>
          }
        </div>
      </div>

      {/* Nav */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px 24px"}}>
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


// ─── Focus Project Mode (Tareas) ─────────────────────────────────────────────
function FocusProjectMode({projects,tasksForProject,onToggle,onDelete,onOpen,onAddTask}){
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
                  onClick={e=>{e.stopPropagation();onToggle(task.id);}}>
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
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <button onClick={()=>setIdx(i=>Math.max(i-1,0))} disabled={idx===0}
          style={{background:"none",border:"none",cursor:idx===0?"default":"pointer",fontFamily:"'DM Sans'",fontSize:13,color:idx===0?"#E5E1DB":"#9B948C"}}>← Anterior</button>
        <button onClick={()=>setIdx(i=>Math.min(i+1,projects.length-1))} disabled={idx===projects.length-1}
          style={{background:"none",border:"none",cursor:idx===projects.length-1?"default":"pointer",fontFamily:"'DM Sans'",fontSize:13,color:idx===projects.length-1?"#E5E1DB":"#9B948C"}}>Siguiente →</button>
      </div>
    </div>
  );
}

// ─── Focus Strategy Mode (Proyectos) ─────────────────────────────────────────
function FocusStrategyMode({projects,onEdit,onDelete}){
  const [idx,setIdx]=useState(0);
  const touchStartX=useRef(0);
  const [conf,setConf]=useState(false);

  const proj=projects[idx];
  const imp=proj?IMPORTANCE[proj.importance||"normal"]:null;
  const has=proj&&(proj.description||proj.mainGoal||(proj.secondaryGoals?.length>0));

  function handleSwipeStart(e){touchStartX.current=e.touches[0].clientX;}
  function handleSwipeEnd(e){
    const dx=e.changedTouches[0].clientX-touchStartX.current;
    if(dx<-50&&idx<projects.length-1){setIdx(i=>i+1);setConf(false);}
    if(dx>50&&idx>0){setIdx(i=>i-1);setConf(false);}
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
            <div key={i} onClick={()=>{setIdx(i);setConf(false);}} style={{width:i===idx?18:6,height:6,borderRadius:99,background:i===idx?"#6B6258":"#E5E1DB",transition:"width .2s",cursor:"pointer"}}/>
          ))}
        </div>
        <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F"}}>{idx+1}/{projects.length}</span>
      </div>

      {/* Project card */}
      <div onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}
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
          {proj.description&&<p style={{fontFamily:"'DM Sans'",fontSize:14,color:"#6B6258",lineHeight:1.6,marginBottom:14}}>{proj.description}</p>}
          {proj.mainGoal&&<div style={{marginBottom:12}}>
            <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase",marginBottom:4}}>Objetivo principal</div>
            <div style={{fontFamily:"'DM Sans'",fontSize:14,color:"#2C2825",fontWeight:500}}>{proj.mainGoal}</div>
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
          {!has&&<div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",fontStyle:"italic"}}>Sin objetivos · tap en Editar</div>}
        </div>
      </div>

      {/* Nav */}
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <button onClick={()=>{setIdx(i=>Math.max(i-1,0));setConf(false);}} disabled={idx===0}
          style={{background:"none",border:"none",cursor:idx===0?"default":"pointer",fontFamily:"'DM Sans'",fontSize:13,color:idx===0?"#E5E1DB":"#9B948C"}}>← Anterior</button>
        <button onClick={()=>{setIdx(i=>Math.min(i+1,projects.length-1));setConf(false);}} disabled={idx===projects.length-1}
          style={{background:"none",border:"none",cursor:idx===projects.length-1?"default":"pointer",fontFamily:"'DM Sans'",fontSize:13,color:idx===projects.length-1?"#E5E1DB":"#9B948C"}}>Siguiente →</button>
      </div>
    </div>
  );
}

// ─── Grouped Projects View ────────────────────────────────────────────────────
function GroupedProjectsView({projects,tasksForProject,onToggle,onDelete,onOpen,onAddTask,reorderTasks,sw,desktop}){
  const groups = [
    {key:"estrategica", label:"Estratégicos", color:"#5B6BAF", bg:"#F0F1F8"},
    {key:"urgente",     label:"Prioritarios", color:"#C49A7A", bg:"#FBF5F0"},
    {key:"normal",      label:"Normales",     color:"#9B948C", bg:"#F5F3F1"},
  ];
  const [open,setOpen]=useState({estrategica:true,urgente:true,normal:false});

  return(
    <div>
      {groups.map(g=>{
        const gprojects=projects.filter(p=>(p.importance||"normal")===g.key);
        if(gprojects.length===0) return null;
        const isOpen=open[g.key];
        const totalPending=gprojects.reduce((sum,p)=>sum+tasksForProject(p.id).filter(t=>!t.done).length,0);
        return(
          <div key={g.key} style={{marginBottom:4}}>
            {/* Group header */}
            <div onClick={()=>setOpen(o=>({...o,[g.key]:!o[g.key]}))}
              style={{display:"flex",alignItems:"center",gap:10,padding:desktop?"12px 0":"12px 20px",cursor:"pointer",userSelect:"none",borderBottom:"1px solid #EAE6E0"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:g.color,flexShrink:0}}/>
              <span style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:500,color:g.color,flex:1}}>{g.label}</span>
              {totalPending>0&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:g.color,background:g.bg,padding:"2px 8px",borderRadius:99}}>{totalPending}</span>}
              <span style={{fontFamily:"'DM Sans'",fontSize:14,color:"#C8C3BB",marginLeft:4}}>{isOpen?"▾":"›"}</span>
            </div>
            {/* Projects within group */}
            {isOpen&&gprojects.map(proj=>(
              desktop
                ?<DProjBlock key={proj.id} project={proj} area={proj.area} tasks={tasksForProject(proj.id)}
                    onToggle={onToggle} onOpen={onOpen}
                    onAddTask={()=>onAddTask(proj)}
                    reorderTasks={reorderTasks} sw={sw}/>
                :<ProjBlock key={proj.id} project={proj} area={proj.area} tasks={tasksForProject(proj.id)}
                    onToggle={onToggle} onDelete={onDelete} onOpen={onOpen}
                    onAddTask={()=>onAddTask(proj)}
                    reorderTasks={reorderTasks} {...(sw||{})}/>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Focus Mode ───────────────────────────────────────────────────────────────
function FocusMode({overdueWork,todayWork,upcomingWork,projects,onToggle,onDelete,onOpen,desktop}){
  const typeOrder = t => (t.type||"normal")==="urgente"?0:(t.type||"normal")==="estrategica"?1:2;
  const allTasks = [
    // 1. Overdue sorted by date asc (oldest first), then by type
    ...overdueWork.filter(t=>!t.done).sort((a,b)=>{
      if(a.date!==b.date) return a.date<b.date?-1:1;
      return typeOrder(a)-typeOrder(b);
    }),
    // 2. Today/tomorrow sorted by date then type
    ...todayWork.filter(t=>!t.done&&!overdueWork.find(o=>o.id===t.id)).sort((a,b)=>{
      if(a.date!==b.date) return a.date<b.date?-1:1;
      return typeOrder(a)-typeOrder(b);
    }),
    // 3. No date: urgente, estrategica, normal
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

  function handleDone(){ onToggle(task.id); }
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
    <div style={{padding:desktop?"0":"0 20px",maxWidth:desktop?560:undefined,display:"flex",flexDirection:"column",minHeight:desktop?"55vh":"calc(100vh - 230px)"}}>

      {/* Swipeable zone */}
      <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}
        onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>

        {/* Project label */}
        <div style={{marginBottom:16}}>
          <span style={{fontFamily:"'DM Sans'",fontSize:11,color:
            (task.type||"normal")==="urgente"?"#C49A7A":
            (task.type||"normal")==="estrategica"?"#5B6BAF":"#B0AA9F",
            fontWeight:500,letterSpacing:".1em",textTransform:"uppercase"}}>{proj?.name}</span>
          {task.date&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:isOverdue?"#C4896A":"#C8C3BB",marginLeft:10}}>{fmtDate(task.date)}</span>}
          {task.responsable&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB",marginLeft:8}}>→ {task.responsable}</span>}
        </div>

        {/* White card */}
        <div style={{background:"white",borderRadius:16,border:"1px solid #EAE6E0",padding:"24px 24px 20px",marginBottom:16,boxShadow:"0 1px 8px rgba(44,40,37,.04)"}}>
          <div style={{fontFamily:"'DM Sans'",fontSize:18,fontWeight:400,color:"#2C2825",lineHeight:1.55,marginBottom:task.notes?16:24}}>
            {task.title}
          </div>
          {task.notes&&<div style={{fontFamily:"'DM Sans'",fontSize:13,color:"#9B948C",lineHeight:1.6,marginBottom:20,padding:"12px 14px",background:"#F7F5F2",borderRadius:10}}>{task.notes}</div>}
          <div style={{display:"flex",gap:10,marginBottom:10}}>
            <button onClick={handleDone} style={{flex:1,background:"#8FAF8A",color:"white",border:"none",borderRadius:12,padding:"14px",fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,cursor:"pointer"}}>✓ Hecho</button>
            <button onClick={handleSkip} style={{flex:1,background:"none",color:"#B0AA9F",border:"1px solid #E5E1DB",borderRadius:12,padding:"14px",fontFamily:"'DM Sans'",fontSize:14,cursor:"pointer"}}>Más tarde</button>
          </div>
          <button onClick={()=>onOpen(task)} style={{width:"100%",background:"none",border:"none",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:11,padding:"2px 0",cursor:"pointer"}}>Editar tarea</button>
        </div>
      </div>

      {/* Progress */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:8}}>
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
                        onClick={e=>{e.stopPropagation();onToggle(task.id);}}>
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

function PlanBlock({project,onEdit,onDelete}){
  const [conf,setConf]=useState(false);
  const [exp,setExp]=useState(false);
  const imp=IMPORTANCE[project.importance||"normal"];
  const has=project.description||project.mainGoal||(project.secondaryGoals?.length>0);
  return(
    <div style={{margin:"10px 20px",background:"white",borderRadius:12,border:"1px solid #EAE6E0"}}>
      <div style={{padding:"14px 16px",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
        <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setExp(e=>!e)}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:has&&!exp?3:0}}>
            <span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:600,color:"#3A3530"}}>{project.name}</span>
            {project.monto&&<span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#9B8878",fontWeight:500}}>{project.monto}</span>}
            <span style={{fontFamily:"'DM Sans'",fontSize:11,color:imp.color,background:imp.bg,padding:"2px 7px",borderRadius:99}}>{imp.label}</span>
          </div>
          {!exp&&project.mainGoal&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#9B948C",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{project.mainGoal}</div>}
          {!has&&<div style={{fontFamily:"'DM Sans'",fontSize:12,color:"#D5CFC8",fontStyle:"italic"}}>Sin objetivos · tap en Editar</div>}
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
            style={{position:"relative",overflow:"hidden",opacity:isDragging?.35:1,borderTop:isOver?"2px solid #9B8878":"none"}}
            onTouchStart={e=>handleRowTouchStart(e,idx,task.id)}
            onTouchMove={handleRowTouchMove}
            onTouchEnd={e=>handleRowTouchEnd(e,idx,task.id)}>
            <div style={{position:"absolute",right:0,top:0,height:"100%",display:"flex",alignItems:"stretch",zIndex:0}}>
              <button style={{border:"none",cursor:"pointer",fontSize:12,fontWeight:500,width:54,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:3,background:"#8FAF8A",color:"white"}} onClick={()=>onToggle(task.id)}><span style={{fontSize:15}}>✓</span><span>{task.done?"Reabrir":"Listo"}</span></button>
              <button style={{border:"none",cursor:"pointer",fontSize:12,fontWeight:500,width:54,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:3,background:"#C4997A",color:"white"}} onClick={()=>onDelete(task.id)}><span style={{fontSize:15}}>✕</span><span>Borrar</span></button>
            </div>
            <div style={{background:isDragging?"#EDE9E4":overdue?"#FBF8F4":"#F7F5F2",position:"relative",zIndex:1,transform:swiped?"translateX(-108px)":"translateX(0)",transition:"transform .25s cubic-bezier(.4,0,.2,1)",padding:"13px 20px",borderBottom:"1px solid #EAE6E0",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}
              onClick={()=>{if(swiped){setSwipedId(null);return;}if(!touchMoved.current)onOpen(task);}}>
              <button style={{width:24,height:24,borderRadius:"50%",border:`1.5px solid ${task.done?"#B5A99A":"#C8C3BB"}`,background:task.done?"#B5A99A":"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
                onClick={e=>{e.stopPropagation();onToggle(task.id);}}>
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

function MobileStyles(){return(<style>{`
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
`}</style>);}

// ─── Shared Sheets ────────────────────────────────────────────────────────────
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

function MetasView({goals,projects,onNew,onEdit,onReorder,isDesktop}){
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



function DraggableGoalColumn({goals,horizon,getChildren,getProjects,onEdit,onReorder,cardRefs}){
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
        <GoalCard goal={goal} horizon={horizon} children={getChildren(goal.id)} linkedProjects={getProjects(goal.id)} onEdit={()=>onEdit(goal)} allGoals={goals}/>
      </div>
    ))}
  </>);
}

function DesktopMetasCanvas({goals,horizons,getChildren,getProjects,onEdit,onNew,onReorder}){
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
function DraggableProjectGrid({projects,onEdit,onDelete,onReorder}){
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
          <DPlanBlock project={proj} onEdit={()=>onEdit(proj)} onDelete={()=>onDelete(proj.id)}/>
        </div>
      ))}
    </div>
  );
}

// ─── Draggable Project List (mobile) ─────────────────────────────────────────
function DraggableProjectList({projects,onEdit,onDelete,onReorder}){
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
          <PlanBlock project={proj} onEdit={()=>onEdit(proj)} onDelete={()=>onDelete(proj.id)}/>
        </div>
      ))}
    </div>
  );
}

function GoalCard({goal,horizon,children,linkedProjects,onEdit,allGoals,mobile}){
  const [exp,setExp]=useState(false);
  return(
    <div style={{background:"white",borderRadius:10,border:`1px solid #EAE6E0`,borderLeft:`3px solid ${horizon.color}`,marginBottom:mobile?8:0,overflow:"hidden"}}>
      <div style={{padding:"12px 14px",cursor:"pointer"}} onClick={()=>setExp(e=>!e)}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'DM Sans'",fontSize:13,fontWeight:500,color:"#2C2825",marginBottom:goal.description?3:0,lineHeight:1.4}}>{goal.title}</div>
            {goal.description&&<div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",lineHeight:1.4}}>{goal.description}</div>}
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

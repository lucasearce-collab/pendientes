import { useState, useRef, useMemo, useEffect } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const AREAS = {
  trabajo:  { label: "Trabajo",       color: "#9B8878", dot: "#C4896A" },
  personal: { label: "Vida Personal", color: "#8A9E8A", dot: "#6B9E78" },
  plan:     { label: "Plan de Vida",  color: "#8A8EA8", dot: "#8A8EA8" },
};

const PRIORITIES = {
  alta:  { label: "Urgente",      dot: "#C4896A" },
  media: { label: "Normal",       dot: "#C4A882" },
  baja:  { label: "Cuando pueda", dot: "#8FAF8A" },
};

const todayStr   = () => new Date().toISOString().split("T")[0];
const weekEndStr = () => { const d = new Date(); d.setDate(d.getDate()+7); return d.toISOString().split("T")[0]; };
const tomorrow   = () => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; };
const nextMonday = () => { const d = new Date(); const diff=(8-d.getDay())%7||7; d.setDate(d.getDate()+diff); return d.toISOString().split("T")[0]; };
const isOverdue  = (date, done) => !done && date && date < todayStr();

const fmtDate = (d) => {
  if (!d) return "";
  const t = todayStr();
  if (d === t) return "Hoy";
  if (d === tomorrow()) return "Mañana";
  if (d < t) { const days = Math.round((new Date(t)-new Date(d))/86400000); return days===1?"Ayer":`Hace ${days}d`; }
  const [,m,day] = d.split("-"); return `${day}/${m}`;
};

// ─── LocalStorage persistence ─────────────────────────────────────────────────

function usePersistedState(key, defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch { return defaultValue; }
  });

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); }
    catch { /* storage full or unavailable */ }
  }, [key, state]);

  return [state, setState];
}

// ─── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks, setTasks]       = usePersistedState("pend_tasks",    []);
  const [projects, setProjects] = usePersistedState("pend_projects", []);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

  const [view, setView]               = useState("hoy");
  const [activeArea, setActiveArea]   = useState("trabajo");
  const [activeProjId, setActiveProjId] = useState(null);
  const [sheet, setSheet]             = useState(null);
  const [addSheet, setAddSheet]       = useState(null);
  const [newProjSheet, setNewProjSheet] = useState(null);
  const [swipedId, setSwipedId]       = useState(null);
  const [input, setInput]             = useState("");
  const touchStart = useRef(null);

  useEffect(() => {
    const fn = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // ── Derived ───────────────────────────────────────────────
  const projectsForArea = (area) => projects.filter(p => p.area === area);
  const tasksForProject = (pid)  => tasks.filter(t => t.projectId === pid);

  const overdueWork = useMemo(() =>
    tasks.filter(t => { const p = projects.find(x=>x.id===t.projectId); return p?.area==="trabajo" && isOverdue(t.date,t.done); })
      .sort((a,b)=>["alta","media","baja"].indexOf(a.priority)-["alta","media","baja"].indexOf(b.priority))
  ,[tasks,projects]);

  const todayWork = useMemo(() =>
    tasks.filter(t => { const p = projects.find(x=>x.id===t.projectId); return p?.area==="trabajo" && t.date===todayStr(); })
      .sort((a,b)=>{ if(a.done!==b.done) return a.done?1:-1; return ["alta","media","baja"].indexOf(a.priority)-["alta","media","baja"].indexOf(b.priority); })
  ,[tasks,projects]);

  // ── Actions ───────────────────────────────────────────────
  function addQuickTask() {
    const title = input.trim(); if(!title) return;
    const proj = projects.find(p=>p.area==="trabajo");
    if(!proj) { alert("Primero creá un proyecto en Trabajo desde la sección Planificar."); return; }
    setTasks(ts=>[{id:"t"+Date.now(),projectId:proj.id,title,priority:"media",date:todayStr(),done:false,notes:""},...ts]);
    setInput("");
  }

  function addTask(task) {
    setTasks(ts=>[{id:"t"+Date.now(),...task,done:false,notes:task.notes||""},...ts]);
    setAddSheet(null);
  }

  function toggleDone(id)  { setTasks(ts=>ts.map(t=>t.id===id?{...t,done:!t.done}:t)); setSwipedId(null); }
  function deleteTask(id)  { setTasks(ts=>ts.filter(t=>t.id!==id)); setSwipedId(null); setSheet(null); }
  function updateTask(u)   { setTasks(ts=>ts.map(t=>t.id===u.id?u:t)); setSheet(null); }

  function addProject(area, name) {
    if(!name.trim()) return;
    setProjects(ps=>[...ps,{id:"p"+Date.now(),area,name:name.trim()}]);
    setNewProjSheet(null);
  }

  function deleteProject(pid) {
    setProjects(ps=>ps.filter(p=>p.id!==pid));
    setTasks(ts=>ts.filter(t=>t.projectId!==pid));
    if(activeProjId===pid) setActiveProjId(null);
  }

  function handleTouchStart(e,id) { touchStart.current={x:e.touches[0].clientX,id}; }
  function handleTouchEnd(e,id) {
    if(!touchStart.current||touchStart.current.id!==id) return;
    const dx = e.changedTouches[0].clientX-touchStart.current.x;
    if(dx<-50) setSwipedId(id); else if(dx>20) setSwipedId(null);
    touchStart.current=null;
  }

  const sw = {swipedId,setSwipedId,onTouchStart:handleTouchStart,onTouchEnd:handleTouchEnd};

  const sheets = (
    <>
      {sheet && (<><div className="sheet-overlay" onClick={()=>setSheet(null)}/><EditSheet task={sheet} projects={projects} onSave={updateTask} onDelete={()=>deleteTask(sheet.id)} isDesktop={isDesktop}/></>)}
      {addSheet && (<><div className="sheet-overlay" onClick={()=>setAddSheet(null)}/><AddTaskSheet {...addSheet} onAdd={addTask} onClose={()=>setAddSheet(null)} isDesktop={isDesktop}/></>)}
      {newProjSheet && (<><div className="sheet-overlay" onClick={()=>setNewProjSheet(null)}/><NewProjectSheet area={newProjSheet.area} onAdd={addProject} onClose={()=>setNewProjSheet(null)} isDesktop={isDesktop}/></>)}
    </>
  );

  const props = {
    tasks, projects, view, setView, activeArea, setActiveArea,
    activeProjId, setActiveProjId, overdueWork, todayWork,
    projectsForArea, tasksForProject,
    toggleDone, deleteTask, deleteProject, addTask, addProject,
    input, setInput, addQuickTask,
    setSheet, setAddSheet, setNewProjSheet,
    sw, sheets
  };

  return isDesktop ? <DesktopLayout {...props}/> : <MobileLayout {...props}/>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESKTOP
// ═══════════════════════════════════════════════════════════════════════════════

function DesktopLayout(p) {
  const { tasks, projects, view, setView, activeArea, setActiveArea, activeProjId, setActiveProjId,
    overdueWork, todayWork, projectsForArea, tasksForProject,
    toggleDone, deleteTask, deleteProject, addTask, addProject,
    input, setInput, addQuickTask, setSheet, setAddSheet, setNewProjSheet, sw, sheets } = p;

  return (
    <div style={{display:"flex",height:"100vh",background:"#F7F5F2",fontFamily:"'Lora',serif",overflow:"hidden"}}>
      <DesktopStyles/>

      {/* Sidebar */}
      <div style={{width:240,background:"#F0EDE8",borderRight:"1px solid #E5E1DB",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
        <div style={{padding:"28px 20px 16px"}}>
          <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",letterSpacing:".14em",textTransform:"uppercase"}}>Pendientes</div>
          <div style={{fontFamily:"'Lora'",fontSize:13,color:"#C8C3BB",fontStyle:"italic",marginTop:2}}>tu mente, liberada</div>
        </div>

        <div style={{padding:"0 10px",display:"flex",flexDirection:"column",gap:2}}>
          {[{id:"hoy",label:"Hoy",icon:"◈"},{id:"planificar",label:"Planificar",icon:"◎"},{id:"proyectos",label:"Proyectos",icon:"⊞"}].map(n=>(
            <button key={n.id} className="d-nav-btn" onClick={()=>{setView(n.id);setActiveProjId(null);}}
              style={{background:view===n.id?"#E8E3DC":"none",color:view===n.id?"#3A3530":"#9B948C"}}>
              <span style={{fontSize:11,opacity:.5}}>{n.icon}</span>{n.label}
            </button>
          ))}
        </div>

        <div style={{height:1,background:"#E5E1DB",margin:"12px 16px"}}/>

        <div style={{flex:1,overflowY:"auto",padding:"0 10px"}}>
          {Object.entries(AREAS).map(([areaKey,area])=>(
            <div key={areaKey} style={{marginBottom:8}}>
              <div style={{fontFamily:"'DM Sans'",fontSize:10,color:area.color,letterSpacing:".1em",textTransform:"uppercase",padding:"6px 10px 3px",fontWeight:500}}>
                {area.label}
              </div>
              {projectsForArea(areaKey).map(proj=>{
                const pending = tasks.filter(t=>t.projectId===proj.id&&!t.done).length;
                const isActive = activeProjId===proj.id;
                return (
                  <button key={proj.id} className="d-proj-btn"
                    onClick={()=>{setView("planificar");setActiveArea(areaKey);setActiveProjId(proj.id);}}
                    style={{background:isActive?"#E8E3DC":"none",color:isActive?"#3A3530":"#7A736C"}}>
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,textAlign:"left"}}>{proj.name}</span>
                    {pending>0&&<span style={{fontFamily:"'DM Sans'",fontSize:10,color:"#B0AA9F",flexShrink:0}}>{pending}</span>}
                  </button>
                );
              })}
              <button className="d-proj-btn" onClick={()=>setNewProjSheet({area:areaKey})}
                style={{color:"#C8C3BB",fontStyle:"italic"}}>
                + proyecto
              </button>
            </div>
          ))}
        </div>

        <div style={{padding:"12px 12px 24px",borderTop:"1px solid #E5E1DB"}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input className="d-quick-input" value={input} onChange={e=>setInput(e.target.value)}
              placeholder="Tarea rápida..." onKeyDown={e=>e.key==="Enter"&&addQuickTask()}/>
            <button className="d-send-btn" onClick={addQuickTask}>↑</button>
          </div>
          <div style={{fontFamily:"'DM Sans'",fontSize:10,color:"#C8C3BB",marginTop:4,paddingLeft:2}}>Agrega a primer proyecto de Trabajo</div>
        </div>
      </div>

      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"24px 36px 14px",borderBottom:"1px solid #EAE6E0",background:"#F7F5F2",flexShrink:0}}>
          <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",letterSpacing:".1em",textTransform:"uppercase",marginBottom:4}}>
            {new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <h1 style={{fontSize:22,fontWeight:600,color:"#2C2825",letterSpacing:"-.02em"}}>
              {view==="hoy" ? "Hoy — Trabajo"
               : view==="proyectos" ? `Proyectos · ${AREAS[activeArea].label}`
               : activeProjId ? projects.find(q=>q.id===activeProjId)?.name
               : `Planificar · ${AREAS[activeArea]?.label}`}
            </h1>
            {(view==="planificar"||view==="proyectos") && (
              <div style={{display:"flex",gap:6}}>
                {Object.entries(AREAS).map(([k,a])=>(
                  <button key={k} className="d-area-pill"
                    onClick={()=>{setActiveArea(k);setActiveProjId(null);}}
                    style={{background:activeArea===k?a.color:"white",color:activeArea===k?"white":a.color,border:`1px solid ${activeArea===k?a.color:"#E5E1DB"}`}}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"28px 36px 40px"}}>
          {view==="hoy" && <DesktopHoy overdueWork={overdueWork} todayWork={todayWork} projects={projects} toggleDone={toggleDone} onOpen={setSheet}/>}

          {view==="planificar" && (
            <div style={{maxWidth:680}}>
              <p style={{fontFamily:"'DM Sans'",fontSize:13,color:"#B0AA9F",marginBottom:24,lineHeight:1.6}}>
                {activeArea==="trabajo"?"Organizá tus deals y proyectos. Asigná fechas y prioridades.":
                 activeArea==="personal"?"Lo que importa fuera del trabajo, a tu ritmo.":
                 "Las cosas que construís a largo plazo."}
              </p>
              {projectsForArea(activeArea)
                .filter(proj => !activeProjId || proj.id===activeProjId)
                .map(proj=>(
                  <DesktopProjectBlock key={proj.id} project={proj} area={activeArea}
                    tasks={tasksForProject(proj.id)} onToggle={toggleDone} onOpen={setSheet}
                    onAddTask={()=>setAddSheet({projectId:proj.id,area:activeArea,projectName:proj.name})}
                    onDeleteProject={()=>deleteProject(proj.id)}/>
                ))}
              {!activeProjId && (
                <button className="d-new-proj-btn" onClick={()=>setNewProjSheet({area:activeArea})}>
                  + Nuevo proyecto en {AREAS[activeArea].label}
                </button>
              )}
            </div>
          )}

          {view==="proyectos" && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16,alignItems:"start"}}>
              {projectsForArea(activeArea).map(proj=>{
                const ptasks = tasksForProject(proj.id);
                const pending = ptasks.filter(t=>!t.done).length;
                return (
                  <div key={proj.id} style={{background:"white",borderRadius:12,border:"1px solid #EAE6E0",overflow:"hidden"}}>
                    <div style={{padding:"16px 18px 10px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,color:"#3A3530"}}>{proj.name}</div>
                        <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB",marginTop:2}}>{pending} pendiente{pending!==1?"s":""}</div>
                      </div>
                      <button className="d-icon-btn" onClick={()=>setAddSheet({projectId:proj.id,area:activeArea,projectName:proj.name})}>+ tarea</button>
                    </div>
                    {ptasks.length>0
                      ? <DesktopTaskList tasks={ptasks} projects={[]} onToggle={toggleDone} onOpen={setSheet} compact/>
                      : <div style={{padding:"6px 18px 16px",fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",fontStyle:"italic"}}>Sin tareas aún</div>
                    }
                  </div>
                );
              })}
              {projectsForArea(activeArea).length===0 && (
                <div style={{color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14,padding:"32px 0"}}>
                  Aún no hay proyectos en {AREAS[activeArea].label}. Creá uno desde Planificar.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {sheets}
    </div>
  );
}

function DesktopHoy({ overdueWork, todayWork, projects, toggleDone, onOpen }) {
  return (
    <div style={{maxWidth:680}}>
      {overdueWork.length>0 && (
        <div style={{marginBottom:28}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:"#C4A882"}}/>
            <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C4A882",letterSpacing:".08em",textTransform:"uppercase"}}>De días anteriores · {overdueWork.length}</span>
          </div>
          <DesktopTaskList tasks={overdueWork} projects={projects} onToggle={toggleDone} onOpen={onOpen} overdue/>
        </div>
      )}
      {todayWork.length>0 ? (
        <>
          <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase",marginBottom:12}}>Para hoy</div>
          <DesktopTaskList tasks={todayWork} projects={projects} onToggle={toggleDone} onOpen={onOpen}/>
        </>
      ) : (
        <div style={{padding:"56px 0",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14,textAlign:"center"}}>
          {todayWork.length===0 && overdueWork.length===0 ? "Todo al día ·" : ""}
        </div>
      )}
    </div>
  );
}

function DesktopProjectBlock({ project, area, tasks, onToggle, onOpen, onAddTask, onDeleteProject }) {
  const [open, setOpen] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pending = tasks.filter(t=>!t.done).length;

  return (
    <div style={{marginBottom:8,border:"1px solid #EAE6E0",borderRadius:12,overflow:"hidden",background:"white"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",cursor:"pointer"}} onClick={()=>setOpen(o=>!o)}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:AREAS[area].color,opacity:.7}}/>
          <span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,color:"#3A3530"}}>{project.name}</span>
          {pending>0&&<span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#B0AA9F"}}>{pending}</span>}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button className="d-icon-btn" onClick={e=>{e.stopPropagation();onAddTask();}}>+ tarea</button>
          {confirmDelete
            ? <>
                <button className="d-icon-btn" style={{color:"#C4896A",borderColor:"#C4896A"}} onClick={e=>{e.stopPropagation();onDeleteProject();}}>Confirmar</button>
                <button className="d-icon-btn" onClick={e=>{e.stopPropagation();setConfirmDelete(false);}}>Cancelar</button>
              </>
            : <button className="d-icon-btn" style={{color:"#D5CFC8"}} onClick={e=>{e.stopPropagation();setConfirmDelete(true);}}>Eliminar</button>
          }
          <span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#C8C3BB",transform:open?"rotate(0)":"rotate(-90deg)",display:"inline-block",transition:"transform .2s"}}>▾</span>
        </div>
      </div>
      {open && (
        tasks.length>0
          ? <DesktopTaskList tasks={tasks} projects={[]} onToggle={onToggle} onOpen={onOpen} area={area}/>
          : <div style={{padding:"4px 18px 14px",fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",fontStyle:"italic"}}>Sin tareas · click en + tarea para agregar</div>
      )}
    </div>
  );
}

function DesktopTaskList({ tasks, projects, onToggle, onOpen, overdue=false, compact=false, area }) {
  return (
    <div>
      {tasks.map((task,i)=>{
        const proj = projects.find(p=>p.id===task.projectId);
        return (
          <div key={task.id} className="d-task-row"
            style={{padding:compact?"10px 18px":"13px 18px",borderTop:i>0?"1px solid #F5F2EE":"none",display:"flex",alignItems:"center",gap:12,cursor:"pointer",background:overdue?"#FBF8F4":"white"}}
            onClick={()=>onOpen(task)}>
            <button className={`d-circle${task.done?" done":""}`} onClick={e=>{e.stopPropagation();onToggle(task.id);}}>
              {task.done&&<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2,6 5,9 10,3"/></svg>}
            </button>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'DM Sans'",fontSize:14,color:task.done?"#C8C3BB":overdue?"#9B8878":"#2C2825",textDecoration:task.done?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {task.title}
              </div>
              {(proj||task.date) && (
                <div style={{display:"flex",gap:8,marginTop:2}}>
                  {proj&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB"}}>{proj.name}</span>}
                  {task.date&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:overdue?"#C4A882":"#C8C3BB"}}>{fmtDate(task.date)}</span>}
                  {task.notes&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#D5CFC8"}}>· nota</span>}
                </div>
              )}
            </div>
            {task.priority&&<div style={{width:6,height:6,borderRadius:"50%",background:PRIORITIES[task.priority].dot,flexShrink:0,opacity:task.done?.3:.7}}/>}
          </div>
        );
      })}
    </div>
  );
}

function DesktopStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;}
      body{background:#F7F5F2;overflow:hidden;}
      .d-nav-btn{display:flex;align-items:center;gap:8px;width:100%;border:none;background:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;padding:8px 10px;border-radius:8px;text-align:left;transition:all .15s;}
      .d-nav-btn:hover{background:#E8E3DC;color:#3A3530!important;}
      .d-proj-btn{display:flex;align-items:center;justify-content:space-between;width:100%;border:none;background:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;padding:6px 10px;border-radius:6px;transition:all .15s;gap:6px;}
      .d-proj-btn:hover{background:#E8E3DC;}
      .d-area-pill{cursor:pointer;border-radius:99px;padding:6px 14px;font-size:12px;font-family:'DM Sans',sans-serif;transition:all .2s;white-space:nowrap;}
      .d-task-row{transition:background .12s;}
      .d-task-row:hover{background:#F5F2EE!important;}
      .d-circle{width:22px;height:22px;border-radius:50%;border:1.5px solid #C8C3BB;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;}
      .d-circle:hover{border-color:#9B8878;}
      .d-circle.done{background:#B5A99A;border-color:#B5A99A;}
      .d-quick-input{flex:1;background:white;border:1px solid #E5E1DB;border-radius:8px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;color:#3A3530;width:100%;}
      .d-quick-input:focus{border-color:#B5A99A;}
      .d-send-btn{width:30px;height:30px;border-radius:8px;background:#6B6258;border:none;cursor:pointer;color:white;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;}
      .d-send-btn:hover{background:#4A433C;}
      .d-icon-btn{background:none;border:1px solid #E5E1DB;border-radius:6px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:11px;color:#B0AA9F;padding:4px 8px;transition:all .15s;white-space:nowrap;}
      .d-icon-btn:hover{border-color:#B5A99A;color:#6B6258;}
      .d-new-proj-btn{display:flex;align-items:center;gap:8px;background:none;border:1px dashed #D5CFC8;border-radius:10px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;color:#C8C3BB;padding:12px 18px;margin-top:8px;transition:all .2s;width:100%;}
      .d-new-proj-btn:hover{border-color:#B5A99A;color:#9B8878;}
      .sheet-overlay{position:fixed;inset:0;background:rgba(44,40,37,.45);z-index:100;animation:fadeIn .2s;}
      .sheet{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;background:#F7F5F2;border-radius:20px 20px 0 0;padding:20px 20px 44px;z-index:101;animation:slideUp .28s cubic-bezier(.4,0,.2,1);max-height:90vh;overflow-y:auto;}
      .d-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:460px;background:#F7F5F2;border-radius:16px;padding:28px;z-index:101;animation:fadeIn .2s;box-shadow:0 20px 60px rgba(0,0,0,.15);}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes slideUp{from{transform:translateX(-50%) translateY(100%)}to{transform:translateX(-50%) translateY(0)}}
      .s-input{width:100%;background:white;border:1px solid #E5E1DB;border-radius:10px;padding:10px 14px;font-size:15px;font-family:'DM Sans',sans-serif;outline:none;color:#3A3530;}
      .s-input:focus{border-color:#B5A99A;}
      .s-select{width:100%;background:white;border:1px solid #E5E1DB;border-radius:10px;padding:10px 14px;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;color:#3A3530;appearance:none;}
      .save-btn{width:100%;background:#6B6258;color:white;border:none;border-radius:12px;padding:13px;font-size:15px;font-family:'DM Sans',sans-serif;font-weight:500;cursor:pointer;margin-top:14px;transition:background .15s;}
      .save-btn:hover{background:#4A433C;}
      .handle{width:36px;height:4px;background:#D5CFC8;border-radius:99px;margin:0 auto 20px;}
      .date-chip{cursor:pointer;border:1px solid #E5E1DB;border-radius:99px;padding:4px 11px;font-size:11px;font-family:'DM Sans';color:#8C877F;background:white;transition:all .2s;white-space:nowrap;}
      .date-chip.on{background:#6B6258;border-color:#6B6258;color:white;}
    `}</style>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE
// ═══════════════════════════════════════════════════════════════════════════════

function MobileLayout(p) {
  const { tasks, projects, view, setView, activeArea, setActiveArea,
    overdueWork, todayWork, projectsForArea, tasksForProject,
    toggleDone, deleteTask, deleteProject, addTask, addProject,
    input, setInput, addQuickTask, setSheet, setAddSheet, setNewProjSheet, sw, sheets } = p;

  return (
    <div style={{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"#F7F5F2",fontFamily:"'Lora',serif",position:"relative"}}>
      <MobileStyles/>

      <div style={{padding:"52px 20px 14px"}}>
        <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",letterSpacing:".12em",textTransform:"uppercase",marginBottom:6}}>
          {new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}
        </div>
        <h1 style={{fontSize:26,fontWeight:600,color:"#2C2825",letterSpacing:"-.02em",marginBottom:16}}>
          {view==="hoy"?"Hoy":view==="planificar"?"Planificar":"Proyectos"}
        </h1>
        <div style={{display:"flex",gap:4}}>
          {[{id:"hoy",l:"Hoy"},{id:"planificar",l:"Planificar"},{id:"proyectos",l:"Proyectos"}].map(v=>(
            <button key={v.id} className="m-nav-pill" onClick={()=>setView(v.id)}
              style={{background:view===v.id?"#2C2825":"transparent",color:view===v.id?"#F7F5F2":"#A09890"}}>
              {v.l}
            </button>
          ))}
        </div>
        {(view==="planificar"||view==="proyectos") && (
          <div style={{display:"flex",gap:4,marginTop:12,overflowX:"auto",paddingBottom:2}}>
            {Object.entries(AREAS).map(([k,a])=>(
              <button key={k} className="m-area-tab" onClick={()=>setActiveArea(k)}
                style={{background:activeArea===k?a.color:"transparent",color:activeArea===k?"white":a.color,border:`1px solid ${activeArea===k?a.color:"transparent"}`}}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{height:1,background:"#EAE6E0",margin:"0 20px"}}/>

      <div style={{paddingBottom:100}}>
        {view==="hoy" && (
          <>
            {overdueWork.length>0&&(<>
              <div style={{padding:"18px 20px 6px",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:"#C4A882"}}/>
                <span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C4A882",letterSpacing:".08em",textTransform:"uppercase"}}>De días anteriores · {overdueWork.length}</span>
              </div>
              <MobileTaskRows tasks={overdueWork} projects={projects} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet} overdue {...sw}/>
              <div style={{height:1,background:"#EAE6E0",margin:"10px 20px"}}/>
            </>)}
            {todayWork.length>0
              ? <MobileTaskRows tasks={todayWork} projects={projects} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet} {...sw}/>
              : <div style={{textAlign:"center",padding:"64px 0",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14}}>
                  {overdueWork.length===0?"Sin tareas para hoy":""}
                </div>
            }
          </>
        )}

        {view==="planificar" && (
          <>
            <div style={{padding:"14px 20px 4px"}}>
              <p style={{fontFamily:"'DM Sans'",fontSize:13,color:"#B0AA9F",lineHeight:1.6}}>
                {activeArea==="trabajo"?"Organizá tus proyectos de trabajo.":activeArea==="personal"?"Lo que importa, a tu ritmo.":"Lo que construís a largo plazo."}
              </p>
            </div>
            {projectsForArea(activeArea).map(proj=>(
              <MobileProjectBlock key={proj.id} project={proj} area={activeArea}
                tasks={tasksForProject(proj.id)} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet}
                onAddTask={()=>setAddSheet({projectId:proj.id,area:activeArea,projectName:proj.name})}
                onDeleteProject={()=>deleteProject(proj.id)} {...sw}/>
            ))}
            {projectsForArea(activeArea).length===0 && (
              <div style={{textAlign:"center",padding:"40px 20px",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14}}>
                Todavía no hay proyectos aquí.<br/>Creá el primero abajo.
              </div>
            )}
            <button className="m-new-proj-btn" onClick={()=>setNewProjSheet({area:activeArea})}>
              <span style={{fontSize:18,lineHeight:1}}>+</span> Nuevo proyecto
            </button>
          </>
        )}

        {view==="proyectos" && (
          <>
            {projectsForArea(activeArea).map(proj=>{
              const ptasks = tasksForProject(proj.id);
              const pending = ptasks.filter(t=>!t.done).length;
              return (
                <div key={proj.id} style={{margin:"12px 20px",background:"white",borderRadius:12,border:"1px solid #EAE6E0",overflow:"hidden"}}>
                  <div style={{padding:"14px 18px 10px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,color:"#3A3530"}}>{proj.name}</div>
                      <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB",marginTop:2}}>{pending} pendiente{pending!==1?"s":""}</div>
                    </div>
                    <button className="m-icon-btn" onClick={()=>setAddSheet({projectId:proj.id,area:activeArea,projectName:proj.name})}>+ tarea</button>
                  </div>
                  {ptasks.length>0
                    ? <MobileTaskRows tasks={ptasks} projects={projects} onToggle={toggleDone} onDelete={deleteTask} onOpen={setSheet} compact {...sw}/>
                    : <div style={{padding:"4px 18px 14px",fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",fontStyle:"italic"}}>Sin tareas aún</div>
                  }
                </div>
              );
            })}
            {projectsForArea(activeArea).length===0 && (
              <div style={{textAlign:"center",padding:"40px 20px",color:"#C8C3BB",fontFamily:"'DM Sans'",fontSize:14}}>
                Todavía no hay proyectos.<br/>Creá uno desde Planificar.
              </div>
            )}
          </>
        )}
      </div>

      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"#F0EDE8",borderTop:"1px solid #E5E1DB",padding:"12px 16px 32px",display:"flex",gap:10,alignItems:"center",zIndex:50}}>
        <input className="m-text-input" value={input} onChange={e=>setInput(e.target.value)}
          placeholder="Tarea rápida de trabajo..." onKeyDown={e=>e.key==="Enter"&&addQuickTask()}/>
        <button className="m-send-btn" onClick={addQuickTask}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
          </svg>
        </button>
      </div>

      {sheets}
    </div>
  );
}

function MobileProjectBlock({ project, area, tasks, onToggle, onDelete, onOpen, onAddTask, onDeleteProject, swipedId, setSwipedId, onTouchStart, onTouchEnd }) {
  const [expanded, setExpanded] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pending = tasks.filter(t=>!t.done).length;

  return (
    <div style={{borderBottom:"1px solid #EAE6E0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px 10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flex:1,cursor:"pointer"}} onClick={()=>setExpanded(e=>!e)}>
          <div style={{width:6,height:6,borderRadius:"50%",background:AREAS[area].color,opacity:.6}}/>
          <span style={{fontFamily:"'DM Sans'",fontSize:14,fontWeight:500,color:"#3A3530"}}>{project.name}</span>
          {pending>0&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F"}}>{pending}</span>}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {confirmDelete
            ? <>
                <button className="m-icon-btn" style={{color:"#C4896A",borderColor:"#C4896A",fontSize:11}} onClick={onDeleteProject}>Confirmar</button>
                <button className="m-icon-btn" style={{fontSize:11}} onClick={()=>setConfirmDelete(false)}>Cancelar</button>
              </>
            : <button className="m-icon-btn" style={{color:"#D5CFC8",fontSize:11}} onClick={()=>setConfirmDelete(true)}>Eliminar</button>
          }
          <span style={{fontFamily:"'DM Sans'",fontSize:12,color:"#C8C3BB",transform:expanded?"rotate(0)":"rotate(-90deg)",display:"inline-block",transition:"transform .2s",cursor:"pointer"}} onClick={()=>setExpanded(e=>!e)}>▾</span>
        </div>
      </div>
      {expanded&&(<>
        {tasks.length>0
          ? <MobileTaskRows tasks={tasks} projects={[]} onToggle={onToggle} onDelete={onDelete} onOpen={onOpen} area={area} swipedId={swipedId} setSwipedId={setSwipedId} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}/>
          : <div style={{padding:"4px 20px 10px",fontFamily:"'DM Sans'",fontSize:13,color:"#D5CFC8",fontStyle:"italic"}}>Sin tareas aún</div>
        }
        <button style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Sans'",fontSize:13,color:"#C8C3BB",padding:"10px 20px",width:"100%"}} onClick={onAddTask}>
          <span style={{fontSize:16,lineHeight:1}}>+</span> agregar tarea
        </button>
      </>)}
    </div>
  );
}

function MobileTaskRows({ tasks, projects, onToggle, onDelete, onOpen, overdue=false, compact=false, area, swipedId, setSwipedId, onTouchStart, onTouchEnd }) {
  return (
    <div>
      {tasks.map(task=>{
        const proj = projects.find(p=>p.id===task.projectId);
        return (
          <div key={task.id} className="m-task-item"
            onTouchStart={e=>onTouchStart(e,task.id)} onTouchEnd={e=>onTouchEnd(e,task.id)}>
            <div style={{position:"absolute",right:0,top:0,height:"100%",display:"flex",alignItems:"stretch",zIndex:0}}>
              <button className="m-sw-btn" style={{background:"#8FAF8A",color:"white"}} onClick={()=>onToggle(task.id)}>
                <span style={{fontSize:15}}>✓</span><span>{task.done?"Reabrir":"Listo"}</span>
              </button>
              <button className="m-sw-btn" style={{background:"#C4997A",color:"white"}} onClick={()=>onDelete(task.id)}>
                <span style={{fontSize:15}}>✕</span><span>Borrar</span>
              </button>
            </div>
            <div className={`m-task-inner${swipedId===task.id?" swiped":""}`}
              style={{padding:compact?"11px 20px":"14px 20px",borderBottom:"1px solid #EAE6E0",display:"flex",alignItems:"center",gap:12,background:overdue?"#FBF8F4":"#F7F5F2"}}
              onClick={()=>{ if(swipedId===task.id){setSwipedId(null);return;} onOpen(task); }}>
              <button className={`m-circle${task.done?" done":""}`} onClick={e=>{e.stopPropagation();onToggle(task.id);}}>
                {task.done&&<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2,6 5,9 10,3"/></svg>}
              </button>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'DM Sans'",fontSize:14,color:task.done?"#C8C3BB":overdue?"#9B8878":"#2C2825",textDecoration:task.done?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {task.title}
                </div>
                <div style={{display:"flex",gap:8,marginTop:2}}>
                  {proj&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:"#C8C3BB"}}>{proj.name}</span>}
                  {task.date&&<span style={{fontFamily:"'DM Sans'",fontSize:11,color:overdue?"#C4A882":"#C8C3BB"}}>{fmtDate(task.date)}</span>}
                </div>
              </div>
              {task.priority&&<div style={{width:6,height:6,borderRadius:"50%",background:PRIORITIES[task.priority].dot,flexShrink:0,opacity:task.done?.3:.7}}/>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobileStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
      body{background:#F7F5F2;}
      .m-task-item{position:relative;overflow:hidden;}
      .m-task-inner{background:#F7F5F2;position:relative;z-index:1;transition:transform .25s cubic-bezier(.4,0,.2,1);}
      .m-task-inner.swiped{transform:translateX(-108px);}
      .m-sw-btn{border:none;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif;font-weight:500;width:54px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:3px;}
      .m-nav-pill{cursor:pointer;border:none;font-family:'DM Sans',sans-serif;font-size:13px;padding:7px 16px;border-radius:99px;transition:all .2s;}
      .m-area-tab{cursor:pointer;border:none;font-family:'DM Sans',sans-serif;font-size:12px;padding:6px 12px;border-radius:99px;transition:all .2s;white-space:nowrap;}
      .m-circle{width:24px;height:24px;border-radius:50%;border:1.5px solid #C8C3BB;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;}
      .m-circle.done{background:#B5A99A;border-color:#B5A99A;}
      .m-text-input{flex:1;background:white;border:1px solid #E5E1DB;border-radius:22px;padding:10px 16px;font-size:15px;font-family:'DM Sans',sans-serif;outline:none;color:#3A3530;}
      .m-text-input::placeholder{color:#C0BAB0;}
      .m-text-input:focus{border-color:#B5A99A;}
      .m-send-btn{width:40px;height:40px;border-radius:50%;background:#6B6258;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
      .m-icon-btn{background:none;border:1px solid #E5E1DB;border-radius:6px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:11px;color:#B0AA9F;padding:5px 10px;}
      .m-new-proj-btn{display:flex;align-items:center;gap:8px;background:none;border:1px dashed #D5CFC8;border-radius:10px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;color:#C8C3BB;padding:12px 20px;margin:12px 20px;width:calc(100% - 40px);}
      .sheet-overlay{position:fixed;inset:0;background:rgba(44,40,37,.45);z-index:100;animation:fadeIn .2s;}
      .sheet{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;background:#F7F5F2;border-radius:20px 20px 0 0;padding:20px 20px 44px;z-index:101;animation:slideUp .28s cubic-bezier(.4,0,.2,1);max-height:90vh;overflow-y:auto;}
      .d-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:460px;background:#F7F5F2;border-radius:16px;padding:28px;z-index:101;animation:fadeIn .2s;box-shadow:0 20px 60px rgba(0,0,0,.15);}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes slideUp{from{transform:translateX(-50%) translateY(100%)}to{transform:translateX(-50%) translateY(0)}}
      .s-input{width:100%;background:white;border:1px solid #E5E1DB;border-radius:10px;padding:10px 14px;font-size:15px;font-family:'DM Sans',sans-serif;outline:none;color:#3A3530;}
      .s-input:focus{border-color:#B5A99A;}
      .s-select{width:100%;background:white;border:1px solid #E5E1DB;border-radius:10px;padding:10px 14px;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;color:#3A3530;appearance:none;}
      .save-btn{width:100%;background:#6B6258;color:white;border:none;border-radius:12px;padding:13px;font-size:15px;font-family:'DM Sans',sans-serif;font-weight:500;cursor:pointer;margin-top:14px;}
      .handle{width:36px;height:4px;background:#D5CFC8;border-radius:99px;margin:0 auto 20px;}
      .date-chip{cursor:pointer;border:1px solid #E5E1DB;border-radius:99px;padding:4px 11px;font-size:11px;font-family:'DM Sans';color:#8C877F;background:white;transition:all .2s;white-space:nowrap;}
      .date-chip.on{background:#6B6258;border-color:#6B6258;color:white;}
    `}</style>
  );
}

// ─── Shared Sheets ────────────────────────────────────────────────────────────

function EditSheet({ task, projects, onSave, onDelete, isDesktop }) {
  const [form, setForm] = useState({...task});
  const proj = projects.find(p=>p.id===task.projectId);
  const isWork = proj?.area==="trabajo";
  const cls = isDesktop ? "d-modal" : "sheet";

  return (
    <div className={cls}>
      {!isDesktop&&<div className="handle"/>}
      {isDesktop&&<div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase",marginBottom:16}}>Editar tarea</div>}
      <input className="s-input" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} autoFocus
        style={{fontSize:16,fontWeight:500,marginBottom:14,border:"none",background:"transparent",padding:"4px 0",borderBottom:"1px solid #E5E1DB",borderRadius:0}}/>
      {isWork&&(<>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          {[{l:"Hoy",v:todayStr()},{l:"Mañana",v:tomorrow()},{l:"Lunes",v:nextMonday()}].map(q=>(
            <button key={q.l} className={`date-chip${form.date===q.v?" on":""}`} onClick={()=>setForm(f=>({...f,date:q.v}))}>{q.l}</button>
          ))}
          <input type="date" value={form.date||""} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
            style={{border:"1px solid #E5E1DB",borderRadius:99,padding:"4px 11px",fontSize:11,fontFamily:"'DM Sans'",outline:"none",color:"#8C877F",background:"white"}}/>
        </div>
        <select className="s-select" value={form.priority||"media"} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} style={{marginBottom:10}}>
          {Object.entries(PRIORITIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
      </>)}
      <textarea className="s-input" rows={3} placeholder="Notas..." value={form.notes||""}
        onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
        style={{resize:"none",fontFamily:"'DM Sans'",fontSize:14,marginTop:isWork?0:14}}/>
      <button className="save-btn" onClick={()=>onSave(form)}>Guardar</button>
      <button onClick={onDelete} style={{width:"100%",background:"none",border:"none",color:"#C4A89A",fontFamily:"'DM Sans'",fontSize:14,padding:"14px 0 0",cursor:"pointer"}}>Eliminar tarea</button>
    </div>
  );
}

function AddTaskSheet({ projectId, area, projectName, onAdd, isDesktop }) {
  const [title, setTitle]       = useState("");
  const [priority, setPriority] = useState("media");
  const [date, setDate]         = useState(todayStr());
  const isWork = area==="trabajo";
  const cls = isDesktop ? "d-modal" : "sheet";

  function handleAdd() {
    if(!title.trim()) return;
    onAdd({projectId,title:title.trim(),priority:isWork?priority:"baja",date:isWork?date:""});
  }

  return (
    <div className={cls}>
      {!isDesktop&&<div className="handle"/>}
      <div style={{fontFamily:"'DM Sans'",fontSize:11,color:"#B0AA9F",letterSpacing:".08em",textTransform:"uppercase",marginBottom:14}}>{projectName}</div>
      <input className="s-input" value={title} onChange={e=>setTitle(e.target.value)} autoFocus
        placeholder="¿Qué hay que hacer?" onKeyDown={e=>e.key==="Enter"&&handleAdd()} style={{marginBottom:14}}/>
      {isWork&&(<>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          {[{l:"Hoy",v:todayStr()},{l:"Mañana",v:tomorrow()},{l:"Lunes",v:nextMonday()}].map(q=>(
            <button key={q.l} className={`date-chip${date===q.v?" on":""}`} onClick={()=>setDate(q.v)}>{q.l}</button>
          ))}
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{border:"1px solid #E5E1DB",borderRadius:99,padding:"4px 11px",fontSize:11,fontFamily:"'DM Sans'",outline:"none",color:"#8C877F",background:"white"}}/>
        </div>
        <select className="s-select" value={priority} onChange={e=>setPriority(e.target.value)}>
          {Object.entries(PRIORITIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
      </>)}
      <button className="save-btn" onClick={handleAdd}>Agregar tarea</button>
    </div>
  );
}

function NewProjectSheet({ area, onAdd, isDesktop }) {
  const [name, setName] = useState("");
  const cls = isDesktop ? "d-modal" : "sheet";
  return (
    <div className={cls}>
      {!isDesktop&&<div className="handle"/>}
      <div style={{fontFamily:"'DM Sans'",fontSize:11,color:AREAS[area].color,letterSpacing:".08em",textTransform:"uppercase",marginBottom:14}}>{AREAS[area].label}</div>
      <input className="s-input" value={name} onChange={e=>setName(e.target.value)} autoFocus
        placeholder="Nombre del proyecto..." onKeyDown={e=>e.key==="Enter"&&onAdd(area,name)}/>
      <button className="save-btn" onClick={()=>onAdd(area,name)}>Crear proyecto</button>
    </div>
  );
}

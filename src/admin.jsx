import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { createRoot } from 'react-dom/client';
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
const ADMIN_EMAIL = 'lucas.e.arce@gmail.com';
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'DM Sans',sans-serif;background:#F5F2EE;min-height:100vh;-webkit-font-smoothing:antialiased;}
`;
function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function AdminApp() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthReady(true);
    });
    supabase.auth.onAuthStateChange((_e, session) => setSession(session));
  }, []);
  useEffect(() => {
    if (authReady && session?.user?.email === ADMIN_EMAIL) {
      loadData();
    } else if (authReady) {
      setLoading(false);
    }
  }, [authReady, session]);
  async function loadData() {
    setLoading(true);
    try {
      const today = todayStr();
      const sevenDaysAgo = daysAgo(7);
      const yesterday = daysAgo(1);
      const [tasksRes, eventsRes, profilesRes, usersRes] = await Promise.all([
        supabase.rpc('get_all_tasks'),
        supabase.rpc('get_all_events'),
        supabase.from('user_profiles').select('id,points,terms_accepted,terms_accepted_at'),
        supabase.rpc('get_user_list'),
      ]);
      const tasks = tasksRes.data || [];
      const events = eventsRes.data || [];
      const profiles = profilesRes.data || [];
      const registeredUsers = usersRes.data || [];
      // Goals — opcional, no rompe si falla
      let goals = [];
      try {
        const goalsRes = await supabase.rpc('get_all_goals');
        goals = goalsRes.data || [];
      } catch(e) { goals = []; }
      const allUserIds = registeredUsers.length > 0
        ? registeredUsers.map(u => u.id)
        : [...new Set([
            ...tasks.map(t => t.user_id),
            ...events.map(e => e.user_id),
            ...profiles.map(p => p.id),
          ])].filter(Boolean);
      const totalUsers = allUserIds.length;
      const activeUserIds7d = new Set([
        ...tasks.filter(t => t.completed_at && t.completed_at >= sevenDaysAgo).map(t => t.user_id),
        ...events.filter(e => e.occurred_at >= sevenDaysAgo).map(e => e.user_id),
      ]);
      const activeUsers7d = activeUserIds7d.size;
      const activeToday = new Set([
        ...tasks.filter(t => t.completed_at?.slice(0, 10) === today).map(t => t.user_id),
        ...events.filter(e => e.occurred_at?.slice(0, 10) === today).map(e => e.user_id),
      ]).size;
      const tasksThisWeek = tasks.filter(t => t.completed_at && t.completed_at >= sevenDaysAgo).length;
      const tasksLastWeek = tasks.filter(t => {
        const d = t.completed_at?.slice(0, 10);
        return d && d >= daysAgo(14) && d < sevenDaysAgo;
      }).length;
      const dauWau = activeUsers7d > 0 ? (activeToday / activeUsers7d).toFixed(2) : '0.00';
      const userStats = allUserIds.map(uid => {
        const userTasks = tasks.filter(t => t.user_id === uid);
        const userEvents = events.filter(e => e.user_id === uid);
        const profile = profiles.find(p => p.id === uid);
        const activeDays = new Set([
          ...userTasks.filter(t => t.completed_at && t.completed_at >= sevenDaysAgo)
            .map(t => t.completed_at.slice(0, 10)),
          ...userEvents.filter(e => e.occurred_at >= sevenDaysAgo)
            .map(e => e.occurred_at.slice(0, 10)),
        ]);
        const dayDots = [];
        for (let i = 6; i >= 0; i--) {
          const d = daysAgo(i);
          const active = userTasks.some(t => t.completed_at?.slice(0, 10) === d) ||
            userEvents.some(e => e.occurred_at?.slice(0, 10) === d);
          dayDots.push({ date: d, active, isToday: d === today });
        }
        let streak = 0;
        for (let i = 0; i <= 30; i++) {
          const d = daysAgo(i);
          const wasActive = userTasks.some(t => t.completed_at?.slice(0, 10) === d) ||
            userEvents.some(e => e.occurred_at?.slice(0, 10) === d);
          if (wasActive) streak++;
          else if (i > 0) break;
        }
        const allDates = [
          ...userTasks.filter(t => t.completed_at).map(t => t.completed_at.slice(0, 10)),
          ...userEvents.map(e => e.occurred_at.slice(0, 10)),
        ].sort().reverse();
        const lastActive = allDates[0] || null;
        const lastActiveLabel = !lastActive ? 'Sin actividad'
          : lastActive === today ? 'Hoy'
          : lastActive === yesterday ? 'Ayer'
          : `hace ${Math.round((new Date(today) - new Date(lastActive)) / 86400000)} días`;
        const registeredUser = registeredUsers.find(u => u.id === uid);
        const regDate = registeredUser?.created_at || profile?.terms_accepted_at;
        const regLabel = !regDate ? 'Desconocido' : (() => {
          const days = Math.round((new Date() - new Date(regDate)) / 86400000);
          return days === 0 ? 'Hoy' : days === 1 ? 'Ayer' : days < 7 ? `hace ${days} días` : `hace ${Math.round(days / 7)} sem`;
        })();
        const userGoals = goals.filter(g => g.user_id === uid);
        return {
          uid,
          email: registeredUsers.find(u => u.id === uid)?.email || uid.slice(0, 8) + '...',
          daysActive: activeDays.size,
          dayDots,
          streak,
          goalsCreated: userGoals.length,
          tasksCreated: userTasks.length,
          tasksCompleted: userTasks.filter(t => t.done).length,
          lastActiveLabel,
          regLabel,
          points: profile?.points || 0,
        };
      }).sort((a, b) => b.tasksTotal - a.tasksTotal);
      const freqDist = Array(8).fill(0);
      userStats.forEach(u => { freqDist[Math.min(u.daysActive, 7)]++; });
      const heatmap = [];
      for (let w = 7; w >= 0; w--) {
        const week = [];
        for (let d = 6; d >= 0; d--) {
          const date = daysAgo(w * 7 + d);
          const count = tasks.filter(t => t.completed_at?.slice(0, 10) === date).length;
          week.push({ date, count });
        }
        heatmap.push(week);
      }
      setData({ totalUsers, activeUsers7d, activeToday, tasksThisWeek, tasksLastWeek, dauWau, userStats, freqDist, heatmap });
      setLastUpdated(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('Admin load error:', e);
    }
    setLoading(false);
  }
  async function loginGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }
  if (!authReady || loading) return (
    <div style={{ minHeight: '100vh', background: '#F5F2EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{STYLES}</style>
      <div style={{ fontFamily: "'DM Sans'", fontSize: 13, color: '#B0AA9F' }}>Cargando...</div>
    </div>
  );
  if (!session) return (
    <div style={{ minHeight: '100vh', background: '#F5F2EE', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <style>{STYLES}</style>
      <div style={{ fontFamily: "'DM Sans'", fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: '#C8C3BB' }}>Clarity · Admin</div>
      <button onClick={loginGoogle} style={{ background: '#2C2825', color: 'white', border: 'none', borderRadius: 12, padding: '12px 28px', fontFamily: "'DM Sans'", fontSize: 14, cursor: 'pointer' }}>
        Entrar con Google
      </button>
    </div>
  );
  if (session.user.email !== ADMIN_EMAIL) return (
    <div style={{ minHeight: '100vh', background: '#F5F2EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{STYLES}</style>
      <div style={{ fontFamily: "'DM Sans'", fontSize: 13, color: '#B0AA9F' }}>Acceso denegado.</div>
    </div>
  );
  if (!data) return null;
  const { totalUsers, activeUsers7d, activeToday, tasksThisWeek, tasksLastWeek, dauWau, userStats, freqDist, heatmap } = data;
  const maxHeat = Math.max(...heatmap.flat().map(d => d.count), 1);
  const maxFreq = Math.max(...freqDist, 1);
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '48px 32px 80px' }}>
      <style>{STYLES}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#C4A882', marginBottom: 6 }}>Clarity · Admin</div>
          <div style={{ fontSize: 32, fontWeight: 300, color: '#2C2825', letterSpacing: '-.02em' }}>Monitor de uso</div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: "'DM Sans'", fontSize: 11, color: '#B0AA9F', lineHeight: 1.8 }}>
          Actualizado a las {lastUpdated}<br />
          <button onClick={loadData} style={{ background: 'none', border: '1px solid #EAE6E0', borderRadius: 8, padding: '5px 12px', fontFamily: "'DM Sans'", fontSize: 11, color: '#9B8878', cursor: 'pointer', marginTop: 4 }}>↺ Actualizar</button>
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#B0AA9F', marginBottom: 14 }}>Resumen general</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 32 }}>
        {[
          { val: totalUsers, label: 'Usuarios registrados', sub: null },
          { val: activeUsers7d, label: 'Activos últimos 7 días', sub: `de ${totalUsers} total` },
          { val: activeToday, label: 'Activos hoy', sub: null },
          { val: tasksThisWeek, label: 'Tareas completadas esta semana', sub: tasksLastWeek > 0 ? `${tasksLastWeek} la semana pasada` : null },
        ].map(({ val, label, sub }) => (
          <div key={label} style={{ background: 'white', borderRadius: 14, border: '1px solid #EAE6E0', padding: '18px 16px' }}>
            <div style={{ fontSize: 36, fontWeight: 300, color: '#2C2825', letterSpacing: '-.03em', lineHeight: 1, marginBottom: 4 }}>{val}</div>
            <div style={{ fontSize: 11, color: '#B0AA9F', lineHeight: 1.4 }}>{label}</div>
            {sub && <div style={{ fontSize: 10, color: '#C8C3BB', marginTop: 6 }}>{sub}</div>}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#B0AA9F', marginBottom: 14 }}>Stickiness</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #EAE6E0', padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#2C2825', marginBottom: 4 }}>Ratio DAU/WAU</div>
          <div style={{ fontSize: 11, color: '#B0AA9F', marginBottom: 18, lineHeight: 1.5 }}>Usuarios activos hoy / activos esta semana. Por encima de 0.3 es señal de hábito.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 42, fontWeight: 300, color: '#2C2825', letterSpacing: '-.03em', lineHeight: 1 }}>{dauWau}</div>
            <div style={{ flex: 1 }}>
              <div style={{ height: 6, background: '#F5F2EE', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${Math.min(parseFloat(dauWau) * 100, 100)}%`, background: 'linear-gradient(to right,#9B8878,#5B6BAF)', borderRadius: 99 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#C8C3BB' }}>
                <span>0</span><span>0.3 hábito</span><span>1.0</span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #EAE6E0', padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#2C2825', marginBottom: 4 }}>Frecuencia semanal</div>
          <div style={{ fontSize: 11, color: '#B0AA9F', marginBottom: 18, lineHeight: 1.5 }}>Usuarios por cantidad de días activos esta semana.</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60, marginBottom: 8 }}>
            {freqDist.map((count, i) => (
              <div key={i} style={{ flex: 1 }}>
                <div style={{ width: '100%', borderRadius: '4px 4px 0 0', height: Math.max((count / maxFreq) * 56, count > 0 ? 8 : 4), background: count > 0 ? (i >= 5 ? '#2C2825' : '#C4B5A5') : '#EAE6E0' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {freqDist.map((_, i) => (<div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: '#C8C3BB' }}>{i}d</div>))}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#B0AA9F', marginBottom: 14 }}>Detalle por usuario</div>
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #EAE6E0', overflow: 'hidden', marginBottom: 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.7fr 0.6fr 0.8fr 0.8fr 0.8fr 0.9fr', padding: '10px 16px', borderBottom: '1px solid #EAE6E0', background: '#FAFAF8' }}>
          {['Usuario', 'Días activos / sem', 'Racha', 'Metas', 'Tareas creadas', 'Completadas', 'Puntos', 'Último acceso'].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: '#B0AA9F' }}>{h}</div>
          ))}
        </div>
        {userStats.map((u, idx) => (
          <div key={u.uid} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.7fr 0.6fr 0.8fr 0.8fr 0.8fr 0.9fr', padding: '13px 16px', borderBottom: idx < userStats.length - 1 ? '1px solid #F5F2EE' : 'none', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, color: u.daysActive > 0 ? '#2C2825' : '#B0AA9F', fontWeight: 500 }}>{u.email}</div>
              <div style={{ fontSize: 11, color: '#C8C3BB', marginTop: 2 }}>Registro: {u.regLabel}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {u.dayDots.map((d, i) => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: d.active ? (d.isToday ? '#2C2825' : '#9B8878') : '#EAE6E0' }} />
                ))}
              </div>
              <span style={{ fontSize: 11, color: u.daysActive >= 5 ? '#8FAF8A' : u.daysActive >= 3 ? '#C4A882' : '#C8C3BB', fontWeight: 500 }}>{u.daysActive}/7</span>
            </div>
            <div style={{ fontSize: 13, color: '#2C2825' }}>{u.streak > 0 ? `🔥 ${u.streak}` : '—'}</div>
            <div style={{ fontFamily: "'DM Mono'", fontSize: 13, color: '#5B6BAF' }}>{u.goalsCreated}</div>
            <div style={{ fontFamily: "'DM Mono'", fontSize: 13, color: '#2C2825' }}>{u.tasksCreated}</div>
            <div style={{ fontFamily: "'DM Mono'", fontSize: 13, color: '#8FAF8A' }}>{u.tasksCompleted}</div>
            <div style={{ fontFamily: "'DM Mono'", fontSize: 13, color: '#9B8878' }}>{u.points.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: '#B0AA9F' }}>{u.lastActiveLabel}</div>
          </div>
        ))}
        {userStats.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: '#D5CFC8' }}>Sin usuarios aún</div>
        )}
      </div>
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#B0AA9F', marginBottom: 14 }}>Actividad global — últimas 8 semanas</div>
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #EAE6E0', padding: 20 }}>
        <div style={{ fontSize: 11, color: '#B0AA9F', marginBottom: 16 }}>Tareas completadas por día entre todos los usuarios</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {heatmap.map((week, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {week.map((day, di) => {
                const intensity = day.count / maxHeat;
                const bg = intensity === 0 ? '#F5F2EE' : intensity < 0.25 ? '#E8E2DB' : intensity < 0.5 ? '#C4B5A5' : intensity < 0.75 ? '#9B8878' : '#2C2825';
                return <div key={di} title={`${day.date}: ${day.count} tareas`} style={{ width: 14, height: 14, borderRadius: 3, background: bg }} />;
              })}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {heatmap.map((_, wi) => (
            <div key={wi} style={{ width: 14, textAlign: 'center', fontSize: 8, color: '#C8C3BB' }}>
              {wi === heatmap.length - 1 ? 'hoy' : `${heatmap.length - 1 - wi}s`}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12 }}>
          <span style={{ fontSize: 9, color: '#C8C3BB' }}>Menos</span>
          {['#F5F2EE', '#E8E2DB', '#C4B5A5', '#9B8878', '#2C2825'].map(c => (
            <div key={c} style={{ width: 12, height: 12, borderRadius: 2, background: c }} />
          ))}
          <span style={{ fontSize: 9, color: '#C8C3BB' }}>Más</span>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 40, fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#D5CFC8' }}>
        Clarity · Admin — Solo visible para {ADMIN_EMAIL}
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<AdminApp />);

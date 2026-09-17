'use client';

import { useEffect, useMemo, useState } from 'react';

type Task = {
  id: number; type: string; title: string; project: string; state: string;
  assignedTo: string; elapsed: number; today: number; unsyncedSeconds?: number; effortHours?: number; originalEstimate?: number; completedHours?: number; createdDate?: string; changedDate?: string;
};
type TypeFilter = 'Todos' | 'HU' | 'Feature' | 'Task';
type Toast = { kind:'success'|'error'; message:string };
type AzureUser = { id:string; displayName:string; identity:string };

const initialTasks: Task[] = [];

function formatTime(seconds:number) {
  return `${Math.floor(seconds/3600).toString().padStart(2,'0')}:${Math.floor((seconds%3600)/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
}

function localDateToday() {
  const now=new Date();
  const year=now.getFullYear();
  const month=String(now.getMonth()+1).padStart(2,'0');
  const day=String(now.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}

function category(type:string): Exclude<TypeFilter,'Todos'> | 'Otro' {
  const value=type.trim().toLocaleLowerCase();
  if (['task','tarea'].includes(value)) return 'Task';
  if (['feature','característica','caracteristica'].includes(value)) return 'Feature';
  if (['user story','historia de usuario','product backlog item','requirement','requisito'].includes(value)) return 'HU';
  return 'Otro';
}

export default function TaskBoard() {
  const [allTasks,setAllTasks]=useState<Task[]>(initialTasks);
  const [activeId,setActiveId]=useState<number|null>(null);
  const [pausedId,setPausedId]=useState<number|null>(null);
  const [syncing,setSyncing]=useState(false);
  const [notice,setNotice]=useState('Elige un usuario para cargar sus tareas de Azure DevOps');
  const [projectFilter,setProjectFilter]=useState('Todos');
  const [typeFilter,setTypeFilter]=useState<TypeFilter>('Todos');
  const [search,setSearch]=useState('');
  const [displayLimit,setDisplayLimit]=useState(150);
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');
  const [toast,setToast]=useState<Toast|null>(null);
  const [users,setUsers]=useState<AzureUser[]>([]);
  const [selectedUser,setSelectedUser]=useState<AzureUser|null>(null);
  const [userPickerOpen,setUserPickerOpen]=useState(false);
  const [loadingUsers,setLoadingUsers]=useState(false);

  function applyTypeFilter(nextFilter:TypeFilter) {
    setTypeFilter(nextFilter);
    setDisplayLimit(150);
  }

  function applyProjectFilter(nextProject:string) {
    setProjectFilter(nextProject);
    setDisplayLimit(150);
  }

  useEffect(()=>{
    if (!activeId) return;
    const timer=window.setInterval(()=>setAllTasks(items=>items.map(task=>task.id===activeId?{...task,elapsed:task.elapsed+1,today:task.today+1,unsyncedSeconds:(task.unsyncedSeconds??0)+1}:task)),1000);
    return ()=>window.clearInterval(timer);
  },[activeId]);
  useEffect(()=>{if(!toast)return;const timeout=window.setTimeout(()=>setToast(null),4500);return()=>window.clearTimeout(timeout)},[toast]);

  const projects=useMemo(()=>Array.from(new Set(allTasks.map(task=>task.project.trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b)),[allTasks]);
  const visibleTasks=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase();
    return allTasks.filter(task=>{
      const matchesProject=projectFilter==='Todos'||task.project.trim()===projectFilter;
      const matchesType=typeFilter==='Todos'||category(task.type)===typeFilter;
      const itemDate=task.createdDate?.slice(0,10)??'';
      const matchesFrom=!dateFrom||Boolean(itemDate&&itemDate>=dateFrom);
      const matchesTo=!dateTo||Boolean(itemDate&&itemDate<=dateTo);
      const matchesSearch=!query||task.title.toLocaleLowerCase().includes(query)||String(task.id).includes(query);
      return matchesProject&&matchesType&&matchesSearch&&matchesFrom&&matchesTo;
    });
  },[allTasks,projectFilter,typeFilter,search,dateFrom,dateTo]);
  const displayedTasks=visibleTasks.slice(0,displayLimit);
  useEffect(()=>setDisplayLimit(150),[projectFilter,typeFilter,search,dateFrom,dateTo]);

  const completedHoursVisible=visibleTasks.reduce((sum,task)=>sum+(task.completedHours??0),0);
  const completedSecondsVisible=Math.round(completedHoursVisible*3600);
  const counts=useMemo(()=>({ HU:allTasks.filter(t=>category(t.type)==='HU').length, Feature:allTasks.filter(t=>category(t.type)==='Feature').length, Task:allTasks.filter(t=>category(t.type)==='Task').length }),[allTasks]);

  const timerAction=(workItemId:number,action:'play'|'pause'|'stop')=>fetch('/api/timers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workItemId,action})}).catch(()=>undefined);
  function play(task:Task){setPausedId(null);setActiveId(task.id);void timerAction(task.id,'play')}
  function pause(task:Task){setActiveId(null);setPausedId(task.id);void commitTime(task,'pause')}
  function stop(task:Task){setActiveId(null);setPausedId(null);void commitTime(task,'stop')}

  async function commitTime(task:Task,action:'pause'|'stop') {
    void timerAction(task.id,action);
    const pendingSeconds=task.unsyncedSeconds??0;
    if(pendingSeconds<=0){setToast({kind:'success',message:`#${task.id} ${action==='pause'?'pausada':'detenida'} sin tiempo pendiente`});return}
    const completedHours=Math.round(((task.completedHours??0)+(pendingSeconds/3600))*10000)/10000;
    try {
      const response=await fetch('/api/tasks',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:task.id,project:task.project,originalEstimate:task.originalEstimate??0,completedHours})});
      const data=await response.json() as {error?:string};
      if(!response.ok) throw new Error(data.error??'Azure DevOps rechazó el registro de tiempo');
      setAllTasks(items=>items.map(item=>item.id===task.id?{...item,completedHours,unsyncedSeconds:0}:item));
      setToast({kind:'success',message:`#${task.id}: ${(pendingSeconds/3600).toFixed(2)} h registradas en Azure DevOps`});
    } catch(error) {
      setToast({kind:'error',message:error instanceof Error?error.message:'No se pudo registrar el tiempo en Azure DevOps'});
    }
  }

  async function openUserPicker(){
    setUserPickerOpen(true);
    if(users.length||loadingUsers)return;
    setLoadingUsers(true);
    try {
      const response=await fetch('/api/users',{cache:'no-store'});
      const data=await response.json() as {configured?:boolean;users?:AzureUser[];error?:string};
      if(!response.ok)throw new Error(data.error??'No se pudieron cargar los usuarios');
      if(!data.configured)throw new Error('Falta configurar Azure DevOps');
      setUsers(data.users??[]);
    } catch(error) {
      setToast({kind:'error',message:error instanceof Error?error.message:'No se pudieron cargar los usuarios'});
      setUserPickerOpen(false);
    } finally {setLoadingUsers(false)}
  }

  async function sync(user=selectedUser){
    if(!user){await openUserPicker();return}
    setSyncing(true);
    try {
      const response=await fetch(`/api/tasks?assignedTo=${encodeURIComponent(user.identity)}`,{cache:'no-store'});
      const data=await response.json() as {configured?:boolean;tasks?:Task[];projectCount?:number;failedProjects?:number;error?:string};
      if(!response.ok) throw new Error(data.error);
      if(data.configured){
        const today=localDateToday();
        setAllTasks(data.tasks??[]); setActiveId(null); setProjectFilter('Todos'); setTypeFilter('Todos'); setSearch(''); setDateFrom(today); setDateTo(today);
        setSelectedUser(user);
        setNotice(`${data.tasks?.length??0} elementos de ${user.displayName} · mostrando creados hoy (${today})`);
      } else setNotice('Falta configurar la organización y el token de Azure DevOps');
    } catch(error){setNotice(error instanceof Error?error.message:'No se pudo sincronizar')} finally {setSyncing(false)}
  }

  async function changeState(task:Task,state:string){
    const previous=task.state; setAllTasks(items=>items.map(item=>item.id===task.id?{...item,state}:item));
    try {
      const response=await fetch('/api/tasks',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:task.id,project:task.project,state})});
      const data=await response.json() as {error?:string};
      if(!response.ok) throw new Error(data.error??'Azure DevOps rechazó el cambio');
      setToast({kind:'success',message:`#${task.id} cambió correctamente a ${state}`});
    } catch(error) {
      setAllTasks(items=>items.map(item=>item.id===task.id?{...item,state:previous}:item));
      setToast({kind:'error',message:error instanceof Error?error.message:'No se pudo cambiar el estado'});
    }
  }

  async function addManualTime(task:Task,hours:number) {
    if(!Number.isFinite(hours)||hours<=0){setToast({kind:'error',message:'Ingresa una cantidad de horas mayor que cero'});return false}
    const previous=task.completedHours??0;
    const completedHours=Math.round((previous+hours)*10000)/10000;
    try {
      const response=await fetch('/api/tasks',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:task.id,project:task.project,originalEstimate:task.originalEstimate??0,completedHours})});
      const data=await response.json() as {error?:string};
      if(!response.ok) throw new Error(data.error??'Azure DevOps rechazó el registro manual');
      setAllTasks(items=>items.map(item=>item.id===task.id?{...item,completedHours}:item));
      setToast({kind:'success',message:`#${task.id}: se sumaron ${hours} h · Completed Hours: ${completedHours} h`});
      return true;
    } catch(error) {
      setToast({kind:'error',message:error instanceof Error?error.message:'No se pudo actualizar Completed Hours'});
      return false;
    }
  }

  return <main className="min-h-screen bg-[#f3f6fa] text-[#172033]">
    {toast&&<div role="status" aria-live="polite" className={`fixed right-5 top-5 z-50 flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-[0_14px_40px_rgba(15,30,53,.2)] ${toast.kind==='success'?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-red-200 bg-red-50 text-red-800'}`}><span aria-hidden="true" className="text-lg">{toast.kind==='success'?'✓':'!'}</span><span>{toast.message}</span><button type="button" onClick={()=>setToast(null)} aria-label="Cerrar notificación" className="ml-2 text-current opacity-60 hover:opacity-100">×</button></div>}
    <header className="border-b border-[#dbe2ec] bg-[#0f1e35] text-white"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#2388ff] font-bold">AT</span><div><p className="font-bold">Azure Time</p><p className="text-xs text-slate-400">Control de trabajo</p></div></div><span className="grid h-9 w-9 place-items-center rounded-full bg-[#d9e8ff] text-sm font-bold text-[#1759a7]">BI</span></div></header>
    <section className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8">
      {userPickerOpen&&<UserPicker users={users} selectedUser={selectedUser} loading={loadingUsers} syncing={syncing} onClose={()=>setUserPickerOpen(false)} onSelect={user=>{setSelectedUser(user);setUserPickerOpen(false);void sync(user)}}/>}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-sm font-semibold text-[#2388ff]">CONTROL DE HORAS</p><h1 className="text-3xl font-bold tracking-tight">Tareas de Azure DevOps</h1><p className="mt-1 text-sm text-slate-500">{selectedUser?`Usuario: ${selectedUser.displayName} · `:''}{visibleTasks.length} visibles de {allTasks.length} elementos asignados</p></div><button onClick={()=>void openUserPicker()} disabled={syncing||loadingUsers} className="rounded-xl bg-[#1676e8] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{syncing?'Sincronizando…':loadingUsers?'Cargando usuarios…':'↻ Elegir usuario y sincronizar'}</button></div>
      <div className="mb-6 grid gap-4 md:grid-cols-2"><Summary label="TIEMPO DE HOY" value={formatTime(completedSecondsVisible)} note={`Suma de Completed Hours · ${visibleTasks.length} elementos visibles`} tone="blue"/><Summary label="TAREAS ACTIVAS" value={String(visibleTasks.filter(t=>['active','activa','activo'].includes(t.state.toLocaleLowerCase())).length)} note={`${counts.Task} tareas encontradas`} tone="green"/></div>
      <div className="overflow-hidden rounded-2xl border border-[#dce3ec] bg-white shadow-[0_8px_30px_rgba(28,46,74,.06)]">
        <div className="grid gap-3 border-b border-[#e6ebf1] p-5 lg:grid-cols-[minmax(220px,1fr)_auto_minmax(220px,1fr)] lg:items-center">
          <select aria-label="Filtrar por proyecto" value={projectFilter} onChange={event=>applyProjectFilter(event.currentTarget.value)} className="min-w-0 rounded-lg border border-[#d8e0ea] bg-white px-4 py-2.5 text-sm font-semibold"><option value="Todos">Todos los proyectos ({projects.length})</option>{projects.map(project=><option key={project} value={project}>{project}</option>)}</select>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">{(['Todos','HU','Feature','Task'] as TypeFilter[]).map(type=><button type="button" key={type} aria-pressed={typeFilter===type} onClick={()=>applyTypeFilter(type)} className={`rounded-lg px-3 py-2 text-xs font-bold ${typeFilter===type?'bg-[#1676e8] text-white ring-2 ring-[#9bc7fb]':'bg-[#edf2f7] text-slate-600 hover:bg-[#dce8f5]'}`}>{type}{type!=='Todos'?` (${counts[type]})`:''}</button>)}</div>
          <input aria-label="Buscar tareas" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar por ID o título…" className="w-full rounded-lg border border-[#d8e0ea] px-4 py-2.5 text-sm"/>
          <div className="flex flex-wrap items-end gap-3 lg:col-span-3">
            <label className="grid gap-1 text-xs font-bold text-slate-500"><span>Creada desde</span><input type="date" value={dateFrom} max={dateTo||undefined} onChange={event=>setDateFrom(event.target.value)} className="rounded-lg border border-[#d8e0ea] bg-white px-3 py-2 text-sm font-normal text-slate-700"/></label>
            <label className="grid gap-1 text-xs font-bold text-slate-500"><span>Creada hasta</span><input type="date" value={dateTo} min={dateFrom||undefined} onChange={event=>setDateTo(event.target.value)} className="rounded-lg border border-[#d8e0ea] bg-white px-3 py-2 text-sm font-normal text-slate-700"/></label>
            {(dateFrom||dateTo)&&<button type="button" onClick={()=>{setDateFrom('');setDateTo('')}} className="rounded-lg bg-[#edf2f7] px-4 py-2 text-xs font-bold text-slate-600">Limpiar fechas</button>}
          </div>
        </div>
        <div className="flex items-center justify-between border-b border-[#e6ebf1] bg-[#f8fafc] px-5 py-3 text-xs font-bold text-slate-600"><span>Filtro activo: {projectFilter==='Todos'?'Todos los proyectos':projectFilter} · {typeFilter}{dateFrom?` · desde ${dateFrom}`:''}{dateTo?` · hasta ${dateTo}`:''}</span><span>{visibleTasks.length} resultados</span></div>
        <div className="hidden grid-cols-[92px_minmax(360px,1fr)_150px_155px_185px] gap-4 border-b border-[#e6ebf1] bg-[#f8fafc] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 lg:grid"><span>ID</span><span>Elemento</span><span>Estado</span><span>Tiempo</span><span>Control</span></div>
        <div key={`${projectFilter}:${typeFilter}:${search}:${dateFrom}:${dateTo}`} className="divide-y divide-[#e9edf2]">
          {displayedTasks.map(task=><TaskRow key={`${task.project}:${task.id}`} task={task} isActive={activeId===task.id} isPaused={pausedId===task.id} onPlay={play} onPause={pause} onStop={stop} onStateChange={changeState} onAddManualTime={addManualTime}/>) }
          {displayedTasks.length<visibleTasks.length&&<div className="p-5 text-center"><button onClick={()=>setDisplayLimit(limit=>limit+150)} className="rounded-lg bg-[#edf4fd] px-5 py-2.5 text-sm font-bold text-[#176bc5]">Mostrar 150 más ({visibleTasks.length-displayedTasks.length} restantes)</button></div>}
          {!visibleTasks.length&&<div className="px-6 py-16 text-center"><p className="font-bold text-slate-700">No hay elementos con estos filtros</p><p className="mt-1 text-sm text-slate-500">Prueba otro proyecto, tipo o término de búsqueda.</p></div>}
        </div>
      </div>
      <p role="status" className="mt-4 text-center text-xs text-slate-500">{notice}</p>
    </section>
  </main>;
}

function TaskRow({task,isActive,isPaused,onPlay,onPause,onStop,onStateChange,onAddManualTime}:{task:Task;isActive:boolean;isPaused:boolean;onPlay:(task:Task)=>void;onPause:(task:Task)=>void;onStop:(task:Task)=>void;onStateChange:(task:Task,state:string)=>Promise<void>;onAddManualTime:(task:Task,hours:number)=>Promise<boolean>}) {
  const metric=(value?:number)=>typeof value==='number'&&Number.isFinite(value)?`${value} h`:'—';
  const [manualHours,setManualHours]=useState('');
  const [savingManual,setSavingManual]=useState(false);
  async function saveManual(){
    if(!manualHours||savingManual)return;
    setSavingManual(true);
    const saved=await onAddManualTime(task,Number(manualHours.replace(',','.')));
    if(saved)setManualHours('');
    setSavingManual(false);
  }
  return <article className={`grid gap-4 px-5 py-5 lg:grid-cols-[92px_minmax(360px,1fr)_150px_155px_185px] lg:items-center ${isActive?'bg-[#f6faff]':''}`}>
    <div className="text-sm font-bold text-[#1976dc]">#{task.id}</div>
    <div>
      <div className="mb-1 flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-sm ${category(task.type)==='Task'?'bg-amber-500':category(task.type)==='Feature'?'bg-purple-500':'bg-blue-500'}`}/><span className="text-[11px] font-bold uppercase text-slate-400">{task.type}</span></div>
      <h2 className="font-bold">{task.title}</h2>
      <p className="mt-1 text-xs text-slate-500">{task.project} · {task.assignedTo}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
        <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">Effort: {metric(task.effortHours)}</span>
        <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">Original Estimate: {metric(task.originalEstimate)}</span>
        <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">Completed Hours: {metric(task.completedHours)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))void saveManual()}}>
        <label className="text-[11px] font-bold text-slate-500" htmlFor={`manual-hours-${task.id}`}>Añadir horas</label>
        <input id={`manual-hours-${task.id}`} type="number" min="0.01" step="0.25" inputMode="decimal" value={manualHours} onChange={event=>setManualHours(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void saveManual()}}} placeholder="0.00" className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500"/>
        {manualHours&&<button type="button" disabled={savingManual} onClick={()=>void saveManual()} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">{savingManual?'Guardando…':'Guardar'}</button>}
      </div>
    </div>
    <select aria-label={`Estado de ${task.title}`} value={task.state} onChange={event=>void onStateChange(task,event.target.value)} className="w-fit max-w-[150px] rounded-full bg-[#eaf2ff] px-3 py-2 text-xs font-bold text-[#175fab]"><option value={task.state}>{task.state}</option>{['New','Active','Resolved','Closed'].filter(state=>state!==task.state).map(state=><option key={state}>{state}</option>)}</select>
    <p className={`font-mono text-lg font-bold ${isActive?'text-[#1477e6]':'text-[#26364f]'}`}>{formatTime(task.today)}</p>
    <div className="flex items-center gap-2"><button type="button" onClick={()=>onPlay(task)} disabled={isActive} aria-label={`Iniciar ${task.title}`} className="grid h-10 w-10 place-items-center rounded-lg bg-[#1676e8] text-white disabled:bg-[#d6e4f5]">▶</button><button type="button" onClick={()=>onPause(task)} disabled={!isActive} aria-label={`Pausar ${task.title}`} className="grid h-10 w-10 place-items-center rounded-lg border border-[#cfd8e5] disabled:opacity-35">Ⅱ</button><button type="button" onClick={()=>onStop(task)} disabled={!isActive&&!isPaused} aria-label={`Detener ${task.title}`} className="grid h-10 w-10 place-items-center rounded-lg border border-[#cfd8e5] text-red-500 disabled:opacity-35">■</button></div>
  </article>;
}

function UserPicker({users,selectedUser,loading,syncing,onClose,onSelect}:{users:AzureUser[];selectedUser:AzureUser|null;loading:boolean;syncing:boolean;onClose:()=>void;onSelect:(user:AzureUser)=>void}) {
  const [query,setQuery]=useState('');
  const filtered=users.filter(user=>`${user.displayName} ${user.identity}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="fixed inset-0 z-40 grid place-items-center bg-[#07101f]/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="user-picker-title">
    <div className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6"><div><p className="text-xs font-bold uppercase tracking-wider text-[#2388ff]">Azure DevOps</p><h2 id="user-picker-title" className="mt-1 text-2xl font-bold">¿De quién quieres traer las tareas?</h2><p className="mt-2 text-sm text-slate-500">Selecciona un integrante antes de sincronizar sus tareas y horas.</p></div><button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl text-slate-400">×</button></div>
      <div className="border-b border-slate-200 p-4"><input autoFocus aria-label="Buscar usuario" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar por nombre o correo…" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"/></div>
      <div className="min-h-48 overflow-y-auto p-3">
        {loading&&<p className="p-8 text-center text-sm font-semibold text-slate-500">Cargando usuarios…</p>}
        {!loading&&filtered.map(user=><button type="button" key={user.id||user.identity} disabled={syncing} onClick={()=>onSelect(user)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-blue-50 disabled:opacity-50 ${selectedUser?.identity===user.identity?'bg-blue-50 ring-1 ring-blue-200':''}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#d9e8ff] text-sm font-bold text-[#1759a7]">{user.displayName.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{user.displayName}</span><span className="block truncate text-xs text-slate-500">{user.identity}</span></span></button>)}
        {!loading&&!filtered.length&&<p className="p-8 text-center text-sm text-slate-500">No se encontraron usuarios.</p>}
      </div>
    </div>
  </div>;
}

function Summary({label,value,note,tone}:{label:string;value:string;note:string;tone:'blue'|'navy'|'green'}){const colors={blue:'border-l-[#2388ff]',navy:'border-l-[#243c60]',green:'border-l-[#1eaa74]'};return <div className={`rounded-xl border border-[#dce3ec] border-l-4 bg-white px-5 py-4 ${colors[tone]}`}><p className="text-[11px] font-bold tracking-wider text-slate-400">{label}</p><p className="mt-1 font-mono text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>}

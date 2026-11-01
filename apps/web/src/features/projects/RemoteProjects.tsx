/** Panel remoto independiente de localStorage: persistencia y sesión reales. */
import {useEffect,useState} from 'react';
import {Cloud,Loader2,Mail,RefreshCw,LogOut,Plus,Trash2} from 'lucide-react';
import type {Session} from '@supabase/supabase-js';
import {configured} from '../../lib/api/config';
import {supabase,request,type RemoteProject} from '../../lib/api/client';
import {Notice,StatusPill,formatDate} from '../../components/ui';
export function RemoteProjects(){
 const auth=supabase();
 const [session,setSession]=useState<Session|null>(null);
 const [ready,setReady]=useState(false);
 const [email,setEmail]=useState('');
 const [name,setName]=useState('');
 const [description,setDescription]=useState('');
 const [projects,setProjects]=useState<RemoteProject[]>([]);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!auth){setReady(true);return;}
  let active=true;
  void auth.auth.getSession().then(({data})=>{if(active){setSession(data.session);setReady(true);}}).catch(()=>{if(active){setError('Error al recuperar sesión');setReady(true);}});
  const {data:subscription}=auth.auth.onAuthStateChange((_event,current)=>{if(active)setSession(current);});
  return()=>{active=false;subscription.subscription.unsubscribe();};
 },[auth]);
 useEffect(()=>{
  let active=true;
  if(!session?.access_token){setProjects([]);return;}
  void request<RemoteProject[]>('/projects',session.access_token).then(rows=>{if(active)setProjects(rows);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Error de conexión');});
  return()=>{active=false;};
 },[session?.access_token]);
 async function load(token:string){setError('');setProjects(await request<RemoteProject[]>('/projects',token));}
 async function action(task:()=>Promise<void>){setBusy(true);setError('');try{await task();}catch(e){setError(e instanceof Error?e.message:'Error inesperado');}finally{setBusy(false);}}
 if(!configured)return <Notice tone="warning">Modo servidor pendiente de configurar en Vercel. El laboratorio local sigue disponible.</Notice>;
 return <div className="space-y-5">
  <div className="panel flex items-center gap-3 p-5"><Cloud className="text-primary-600" size={24}/><div><h2 className="font-bold text-ink">Proyectos en el servidor</h2><p className="text-xs text-slate-500">Conexión opcional con FastAPI y Supabase. Tus proyectos locales no se transfieren automáticamente.</p></div></div>
  {error&&<Notice tone="error">{error}</Notice>}
  {!ready?<div className="panel p-6 text-sm"><Loader2 className="inline animate-spin" size={17}/> Comprobando sesión...</div>:!session?<form className="panel max-w-lg space-y-3 p-5" onSubmit={e=>{e.preventDefault();void action(async()=>{const result=await auth!.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:window.location.origin}});if(result.error)throw result.error;setMessage('Enlace enviado. Revisa tu correo.');});}}>
   <label htmlFor="remote-email" className="field-label">Correo para acceder con Supabase Auth</label><input id="remote-email" type="email" required autoComplete="email" className="field" value={email} onChange={e=>setEmail(e.target.value)}/>
   <button type="submit" className="btn-primary" disabled={busy}><Mail size={17}/> Enviar enlace de acceso</button>{message&&<Notice tone="success">{message}</Notice>}
  </form>:<>
   <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{session.user.email}</p><div className="flex flex-wrap gap-2"><button type="button" className="btn-outline" disabled={busy} onClick={()=>void action(()=>load(session.access_token))}><RefreshCw size={16}/> Actualizar</button><button type="button" className="btn-outline" onClick={()=>void auth?.auth.signOut()}><LogOut size={16}/> Salir</button></div></div>
   <form className="panel space-y-3 p-5" onSubmit={e=>{e.preventDefault();void action(async()=>{await request<RemoteProject>('/projects',session.access_token,'POST',{name:name.trim(),description:description.trim()});setName('');setDescription('');await load(session.access_token);});}}>
    <h3 className="font-bold text-ink">Crear proyecto remoto</h3><label className="field-label" htmlFor="remote-name">Nombre</label><input className="field" id="remote-name" minLength={3} maxLength={80} required value={name} onChange={e=>setName(e.target.value)}/><label className="field-label" htmlFor="remote-description">Descripción</label><textarea id="remote-description" className="field" maxLength={600} value={description} onChange={e=>setDescription(e.target.value)}/><button className="btn-primary" disabled={busy} type="submit"><Plus size={16}/> Guardar en PostgreSQL</button>
   </form>
   {!projects.length?<div className="panel p-6 text-sm text-slate-500">No hay proyectos remotos registrados en esta cuenta.</div>:<div className="grid gap-4 md:grid-cols-2">{projects.map(project=><article className="panel p-5" key={project.id}><div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-ink">{project.name}</h3><StatusPill status={project.status}/></div><p className="mb-3 text-sm text-slate-500">{project.description||'Sin descripción'}</p><p className="text-xs text-slate-400">Creado: {formatDate(project.created_at)}</p><div className="mt-4 flex gap-4 border-t pt-3"><button className="text-xs font-semibold text-primary-600" disabled={busy} onClick={()=>void action(async()=>{await request(`/projects/${project.id}`,session.access_token,'PATCH',{status:project.status==='active'?'archived':'active'});await load(session.access_token);})}>{project.status==='active'?'Archivar':'Restaurar'}</button><button className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-red-600" disabled={busy} onClick={()=>{if(window.confirm(`¿Eliminar ${project.name}?`))void action(async()=>{await request(`/projects/${project.id}`,session.access_token,'DELETE');await load(session.access_token);});}}><Trash2 size={14}/> Eliminar</button></div></article>)}</div>}
   <Notice>En v0.4.0 solo los proyectos remotos se sincronizan. Las redes, datasets y ejecuciones siguen en el navegador.</Notice>
  </>}
 </div>;
}

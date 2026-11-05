import { SessionNotice } from '../../components/SessionNotice';
// Herramientas de privacidad, copia local y borrado del espacio de trabajo.
import { useState } from 'react';
import { AlertTriangle, DatabaseBackup, Download, HardDrive, LockKeyhole, RefreshCw, ShieldAlert, Trash2, WifiOff } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { exportJSON, getWorkspaceBytes } from '../../lib/storage';
import { Heading, Notice, SectionTitle } from '../../components/ui';

export default function Administration() {
  const { data, clearWorkspace, isTraining } = useWorkspace();
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const backup = () => exportJSON(`neurolab-copia-local-${new Date().toISOString().slice(0, 10)}.json`, { formatVersion: 1, createdAt: new Date().toISOString(), workspace: data });
  const clear = () => { try { clearWorkspace(); setConfirmReset(false); setError(''); } catch (err) { setError((err as Error).message); } };
  const bytes = getWorkspaceBytes();
  return <>
    <Heading eyebrow="Entorno · M10" title="Administración local" description="Controla la información almacenada en este navegador y conoce las limitaciones de seguridad del modo sin backend."/>
    <div className="grid gap-5 xl:grid-cols-2"><section className="panel p-5"><SectionTitle title="Almacenamiento del navegador" subtitle="Persistencia local sin servicios externos"/><div className="mb-5 flex items-center gap-4 rounded-xl bg-slate-50 p-4"><div className="grid h-12 w-12 place-items-center rounded-xl bg-white text-primary-600"><HardDrive size={23}/></div><div><div className="font-bold text-ink">{(bytes / 1024).toLocaleString('es-PE', { maximumFractionDigits: 1 })} KB</div><div className="text-xs text-slate-500">Espacio estimado utilizado por la aplicación</div></div></div>
    <div className="grid grid-cols-2 gap-3">{[{ label: 'Proyectos', value: data.projects.length }, { label: 'Datasets', value: data.datasets.length }, { label: 'Ejecuciones', value: data.runs.length }, { label: 'Modelos', value: data.models.length }].map(item => <div className="rounded-xl border border-slate-100 p-3" key={item.label}><div className="text-xl font-bold text-ink">{item.value}</div><div className="text-xs text-slate-500">{item.label}</div></div>)}</div><button onClick={backup} className="btn-primary mt-5 w-full"><Download size={17}/> Descargar copia completa JSON</button><p className="mt-3 text-xs leading-5 text-slate-500">La copia incluye filas del CSV, historial de ejecuciones y pesos de los modelos. Guárdala en un lugar seguro; no contiene contraseñas.</p></section>
    <section className="panel p-5"><SectionTitle title="Privacidad y límites" subtitle="Estado real de este MVP sin autenticación ni API"/><div className="space-y-4">{[{ icon: WifiOff, title: 'Sin conexión a servidor', body: 'No se envían datasets ni modelos a ningún servicio de NeuroLab.' }, { icon: LockKeyhole, title: 'Sin autenticación real', body: 'No hay usuarios, roles ni permisos RBAC. El navegador local no constituye una frontera de seguridad.' }, { icon: DatabaseBackup, title: 'Persistencia limitada', body: 'Los datos pueden perderse al limpiar el sitio, cambiar de navegador o agotar la cuota local.' }, { icon: ShieldAlert, title: 'Entrenamiento acotado', body: 'El motor de esta etapa es educativo, funciona en la pestaña activa y no tiene GPU ni cola de workers.' }].map(item => <div key={item.title} className="flex gap-3"><item.icon size={20} className="mt-1 shrink-0 text-primary-600"/><div><div className="text-sm font-semibold text-ink">{item.title}</div><p className="mt-1 text-xs leading-5 text-slate-500">{item.body}</p></div></div>)}</div></section></div>
    <section className="panel mt-5 p-5"><SectionTitle title="Restablecer espacio de trabajo" subtitle="Elimina todos los proyectos y modelos del navegador"/><div className="mb-4"><SessionNotice storageKey="administracion-borrado" tone="warning">Antes de borrar el espacio de trabajo, descarga una copia de seguridad.</SessionNotice>
      <p className="text-xs text-amber-700">Eliminar el espacio de trabajo es irreversible. La confirmación se pedirá antes de borrar.</p></div>{error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
    {!confirmReset ? <button className="btn-danger" disabled={isTraining} onClick={() => setConfirmReset(true)}><Trash2 size={17}/> Borrar todos los datos</button> : <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4"><AlertTriangle size={20} className="shrink-0 text-red-600"/><p className="min-w-[160px] flex-1 text-sm font-semibold text-red-800">¿Confirmas la eliminación permanente?</p><button className="btn-outline" onClick={() => setConfirmReset(false)}><RefreshCw size={15}/> Cancelar</button><button className="btn-danger" onClick={clear}>Sí, eliminar todo</button></div>}</section>
  </>;
}

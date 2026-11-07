/** Administración del laboratorio personal: la nube es la fuente principal. */
import { useState } from 'react';
import { Cloud, Download, HardDrive, LockKeyhole, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { exportJSON } from '../../lib/storage';
import { Heading, SectionTitle } from '../../components/ui';

export default function Administration() {
  const { data, clearWorkspace, isTraining, syncStatus, retrySync, storageError } = useWorkspace();
  const [confirmClear, setConfirmClear] = useState(false);
  const exportBackup = () => exportJSON(`neurolab-respaldo-${new Date().toISOString().slice(0, 10)}.json`, {
    formatVersion: 1, createdAt: new Date().toISOString(), workspace: data,
  });
  return <>
    <Heading title="Administración" description="Gestiona la información asociada a tu cuenta. El entrenamiento siempre ocurre en el navegador."/>
    <section className="panel mb-5 p-5">
      <SectionTitle title="Almacenamiento remoto" subtitle="Los proyectos, CSV, métricas y pesos están asociados a tu cuenta"/>
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-4 dark:bg-zinc-800">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-primary-600 dark:bg-zinc-900"><Cloud size={22}/></div>
        <div className="flex-1"><p role="status" className="text-sm font-bold text-ink">{syncStatus === 'saved' ? 'Todos los cambios guardados en la nube' : syncStatus === 'saving' ? 'Guardando cambios…' : 'No se pudieron guardar los últimos cambios'}</p><p className="mt-1 text-xs text-slate-500">FastAPI valida tu sesión; PostgreSQL conserva tu espacio de trabajo privado.</p></div>
        {syncStatus === 'error' && <button type="button" className="btn-outline" onClick={retrySync}><RefreshCw size={16}/> Reintentar</button>}
      </div>
      {storageError && <p role="alert" className="mt-3 text-sm text-red-600">{storageError}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{[
        ['Proyectos', data.projects.length], ['Datasets', data.datasets.length],
        ['Ejecuciones', data.runs.length], ['Modelos', data.models.length],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-4 dark:border-zinc-700"><div className="text-xl font-bold text-ink">{value}</div><div className="text-xs text-slate-500">{label}</div></div>)}</div>
    </section>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="panel p-5"><SectionTitle title="Respaldo opcional" subtitle="Descarga una copia JSON adicional para conservarla fuera de la plataforma"/>
        <p className="text-sm leading-6 text-slate-500">No necesitas restaurar datos manualmente al cambiar de computadora: los proyectos se recuperan automáticamente después de iniciar sesión.</p>
        <button type="button" className="btn-primary mt-4" onClick={exportBackup}><Download size={17}/> Exportar respaldo JSON</button>
      </section>
      <section className="panel p-5"><SectionTitle title="Privacidad y procesamiento" subtitle="La información no se comparte entre cuentas"/>
        <div className="space-y-3 text-sm text-slate-500"><p className="flex items-start gap-2"><ShieldCheck size={19} className="shrink-0 text-emerald-600"/> Tus proyectos se consultan mediante JWT y permisos del servidor.</p><p className="flex items-start gap-2"><HardDrive size={19} className="shrink-0 text-primary-600"/> TensorFlow.js utiliza CPU o GPU compatibles con tu navegador.</p><p className="flex items-start gap-2"><LockKeyhole size={19} className="shrink-0 text-primary-600"/> La contraseña se verifica mediante Supabase Auth; NeuroLab no la guarda.</p></div>
      </section>
    </div>
    <section className="panel mt-5 p-5"><SectionTitle title="Restablecer mi laboratorio" subtitle="Elimina los proyectos y modelos guardados en tu cuenta actual"/>
      <p className="mb-4 text-sm text-red-700">Esta acción también se sincroniza con PostgreSQL. No elimina cuentas, proyectos históricos Keras ni datos de otras personas. Exporta antes un respaldo si deseas conservar información.</p>
      {!confirmClear ? <button type="button" className="btn-danger" disabled={isTraining || syncStatus !== 'saved'} onClick={() => setConfirmClear(true)}><Trash2 size={17}/> Restablecer mi laboratorio</button> : <div className="flex flex-wrap gap-3"><button type="button" className="btn-outline" onClick={() => setConfirmClear(false)}>Cancelar</button><button type="button" className="btn-danger" disabled={isTraining || syncStatus !== 'saved'} onClick={() => { clearWorkspace(); setConfirmClear(false); }}>Sí, eliminar mis proyectos</button></div>}
    </section>
  </>;
}

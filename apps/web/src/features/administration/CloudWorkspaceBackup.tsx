/** Respaldo privado opcional de todo el espacio local, sin worker ni entrenamiento remoto. */
import { useEffect, useState } from 'react';
import { CloudDownload, CloudUpload, DatabaseBackup, Download, FileUp, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceProvider';
import type { WorkspaceState } from '../../types/domain';
import { Modal, Notice, SectionTitle, formatDate } from '../../components/ui';
import { request } from '../../lib/api/client';
import { ensureSession, loadSession, SESSION_CHANGED, type RemoteSession } from '../../lib/api/session';
import { exportJSON } from '../../lib/storage';
import { MAX_CLOUD_BACKUP_BYTES, parseWorkspaceBackupFile, validateWorkspaceBackup, workspaceSummary } from '../../lib/workspace-backup';

interface BackupInfo {
  exists: boolean;
  revision: number;
  size_bytes: number;
  sha256: string | null;
  updated_at: string | null;
}
interface CloudBackup extends BackupInfo { workspace: unknown; }

async function authorized<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const previous = loadSession();
  if (!previous) throw new Error('Inicia sesión con Google en el topbar para consultar tu copia privada.');
  const session = await ensureSession(previous);
  if (loadSession()?.email !== session.email) throw new Error('La cuenta cambió durante la operación.');
  const result = await request<T>(path, session.access_token, method, body);
  if (loadSession()?.email !== session.email) throw new Error('La cuenta cambió durante la operación.');
  return result;
}

export default function CloudWorkspaceBackup() {
  const { data, isTraining, restoreWorkspace } = useWorkspace();
  const [session, setSession] = useState<RemoteSession | null>(() => loadSession());
  const [metadata, setMetadata] = useState<BackupInfo | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [fileSnapshot, setFileSnapshot] = useState<WorkspaceState | null>(null);
  const [fileName, setFileName] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const localStats = workspaceSummary(data);
  const hasLocalData = Object.values(localStats).some(count => count > 0) || data.architectures.length > 0;

  useEffect(() => {
    // Al cambiar realmente de cuenta se descartan metadatos de la cuenta anterior.
    let lastEmail = loadSession()?.email ?? null;
    const update = () => {
      const current = loadSession();
      if ((current?.email ?? null) !== lastEmail) {
        lastEmail = current?.email ?? null;
        setMetadata(null);
        setMessage('');
        setError('');
        setSaveOpen(false);
        setRestoreOpen(false);
        setFileOpen(false); setFileSnapshot(null);
      }
      setSession(current);
    };
    window.addEventListener(SESSION_CHANGED, update);
    window.addEventListener('focus', update);
    return () => {
      window.removeEventListener(SESSION_CHANGED, update);
      window.removeEventListener('focus', update);
    };
  }, []);

  async function check() {
    setWorking(true); setError(''); setMessage('');
    try {
      const fresh = await authorized<BackupInfo>('/workspace-backup/status');
      setMetadata(fresh);
      setMessage(fresh.exists ? 'Copia privada localizada en tu cuenta.' : 'Aún no tienes una copia privada en esta cuenta.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar la copia.'); }
    finally { setWorking(false); }
  }

  async function downloadCloud() {
    setWorking(true); setError(''); setMessage('');
    try {
      const fetched = await authorized<CloudBackup>('/workspace-backup');
      const checked = validateWorkspaceBackup(fetched.workspace);
      setMetadata(fetched);
      exportJSON(`neurolab-copia-cuenta-revision-${fetched.revision}.json`, {
        formatVersion: 1, createdAt: new Date().toISOString(), workspace: checked,
      });
      setMessage('Copia de la cuenta descargada. Consérvala en un lugar privado.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo descargar la copia de la cuenta.'); }
    finally { setWorking(false); }
  }

  async function save() {
    if (!metadata) return;
    setWorking(true); setError(''); setMessage('');
    try {
      const checked = validateWorkspaceBackup(data);
      const bytes = new TextEncoder().encode(JSON.stringify(checked)).length;
      if (bytes > MAX_CLOUD_BACKUP_BYTES) throw new Error('La copia supera 3 MiB. Descarga un JSON local y reduce el tamaño.');
      // Revisión optimista: rechazar una copia nueva procedente de otra computadora.
      const latest = await authorized<BackupInfo>('/workspace-backup/status');
      if (latest.revision !== metadata.revision) {
        setMetadata(latest);
        throw new Error('La copia cambió en otra sesión. Revisa su nueva fecha antes de continuar.');
      }
      const saved = await authorized<BackupInfo>('/workspace-backup', 'PUT', {
        expected_revision: metadata.revision, workspace: checked,
      });
      setMetadata(saved);
      setSaveOpen(false);
      setMessage(`Copia privada guardada. Revisión ${saved.revision}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la copia.'); }
    finally { setWorking(false); }
  }

  async function restore() {
    if (!metadata?.exists || (hasLocalData && (!downloaded || !acknowledged))) return;
    setWorking(true); setError(''); setMessage('');
    try {
      const fetched = await authorized<CloudBackup>('/workspace-backup');
      if (fetched.revision !== metadata.revision) {
        setMetadata(fetched);
        throw new Error('La copia cambió desde la última consulta. Revisa su información antes de restaurar.');
      }
      const checked = validateWorkspaceBackup(fetched.workspace);
      // El proveedor persiste ANTES de cambiar estado React; si no hay espacio, no reemplaza nada.
      restoreWorkspace(checked);
      setRestoreOpen(false);
      setDownloaded(false); setAcknowledged(false);
      setMessage('Copia recuperada en este navegador. Los entrenamientos interrumpidos no se reanudan.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo recuperar la copia.'); }
    finally { setWorking(false); }
  }

  async function chooseFile(file: File | undefined) {
    setError(''); setFileSnapshot(null); setFileName('');
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { setError('El archivo JSON supera 6 MiB.'); return; }
    setWorking(true);
    try {
      const checked = parseWorkspaceBackupFile(await file.text());
      setFileSnapshot(checked);
      setFileName(file.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'El respaldo no es válido.'); }
    finally { setWorking(false); }
  }

  function restoreFromFile() {
    if (!fileSnapshot || isTraining || (hasLocalData && (!downloaded || !acknowledged))) return;
    setError('');
    try {
      restoreWorkspace(fileSnapshot);
      setFileOpen(false); setFileSnapshot(null);
      setDownloaded(false); setAcknowledged(false);
      setMessage('El respaldo JSON se recuperó en este navegador.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible recuperar el archivo.'); }
  }

  function downloadExisting() {
    exportJSON(`neurolab-antes-de-recuperar-${new Date().toISOString().slice(0, 10)}.json`, {
      formatVersion: 1, createdAt: new Date().toISOString(), workspace: data,
    });
    setDownloaded(true);
  }

  return <section className="panel mb-5 p-5" aria-label="Copia de seguridad privada por cuenta">
    <SectionTitle title="Copia privada de tu laboratorio" subtitle="Proyectos, CSV, experimentos y pesos del navegador; entrenamiento siempre local"/>
    <p className="mb-4 text-sm leading-6 text-slate-500">Esta herramienta guarda una copia manual en PostgreSQL asociada a tu cuenta Google. <strong>No mezcla</strong> los proyectos del archivo histórico de Keras ni sincroniza automáticamente cambios entre computadoras. Tus datos siguen en este navegador hasta que confirmes una recuperación.</p>
    <div className="mb-4 grid gap-2 sm:grid-cols-4">
      {([['Proyectos', localStats.projects], ['Datasets', localStats.datasets], ['Ejecuciones', localStats.runs], ['Modelos', localStats.models]] as const).map(([label, count]) =>
        <div key={label} className="rounded-xl border border-slate-200 p-3 dark:border-zinc-700">
          <div className="text-xl font-bold text-ink">{count}</div><div className="text-xs text-slate-500">{label} locales</div>
        </div>)}
    </div>
    {!session ? <p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-zinc-700 dark:text-zinc-300">Inicia sesión con Google desde la esquina superior derecha para activar las copias privadas. La plataforma sigue funcionando sin cuenta.</p> : <>
      <p className="mb-3 text-xs text-slate-500">Cuenta actual: <strong>{session.email}</strong>. Límite inicial: 3 MiB por copia; solo se conserva la última revisión.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-outline" onClick={() => void check()} disabled={working}>
          {working ? <LoaderCircle className="animate-spin" size={16}/> : <ShieldCheck size={16}/>} Consultar copia
        </button>
        {metadata && <>
          <button type="button" className="btn-primary" disabled={working || isTraining} onClick={() => setSaveOpen(true)}><CloudUpload size={16}/> Guardar copia en mi cuenta</button>
          {metadata.exists && <>
            <button type="button" className="btn-outline" disabled={working} onClick={() => void downloadCloud()}><Download size={16}/> Descargar copia de mi cuenta</button>
            <button type="button" className="btn-outline" disabled={working || isTraining} onClick={() => { setDownloaded(false); setAcknowledged(false); setRestoreOpen(true); }}><CloudDownload size={16}/> Recuperar copia</button>
          </>}
        </>}
      </div>
      {metadata && <div className="mt-4 rounded-xl border border-slate-200 p-3 text-xs text-slate-500 dark:border-zinc-700">
        {metadata.exists ? <>Revisión {metadata.revision} · {metadata.updated_at ? formatDate(metadata.updated_at) : 'Fecha no disponible'} · {(metadata.size_bytes / 1024).toFixed(1)} KiB</> : 'No hay copia guardada todavía.'}
      </div>}
    </>}
    <div className="mt-4 border-t border-slate-200 pt-4 dark:border-zinc-700">
      <button type="button" className="btn-outline" disabled={working || isTraining} onClick={() => {
        setFileSnapshot(null); setFileName(''); setDownloaded(false); setAcknowledged(false); setFileOpen(true);
      }}><FileUp size={16}/> Recuperar archivo JSON local</button>
      <p className="mt-2 text-xs text-slate-500">También puedes restaurar los archivos descargados como copia de seguridad, incluso sin Google.</p>
    </div>
    {message && <Notice tone="success">{message}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}

    {saveOpen && metadata && <Modal title="Guardar copia privada" onClose={() => !working && setSaveOpen(false)} footer={<>
      <button className="btn-outline" disabled={working} onClick={() => setSaveOpen(false)}>Cancelar</button>
      <button className="btn-primary" disabled={working || isTraining} onClick={() => void save()}><CloudUpload size={16}/> Confirmar guardado</button>
    </>}>
      <p className="text-sm leading-6 text-slate-600 dark:text-zinc-300">Se enviarán por HTTPS <strong>todos los registros CSV, métricas y pesos</strong> del navegador a tu cuenta. El servidor no realizará entrenamientos.</p>
      {metadata.exists && <p className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-400">Sustituirás la revisión {metadata.revision} guardada en la nube. Descárgala antes si necesitas conservarla.</p>}
      <p className="mt-3 text-xs text-slate-500">Antes de guardar, revisaremos que no haya sido modificada desde otra sesión.</p>
    </Modal>}

    {restoreOpen && metadata?.exists && <Modal title="Recuperar copia de Google" onClose={() => !working && setRestoreOpen(false)} footer={<>
      <button className="btn-outline" disabled={working} onClick={() => setRestoreOpen(false)}>Cancelar</button>
      <button className="btn-primary" disabled={working || isTraining || (hasLocalData && (!downloaded || !acknowledged))} onClick={() => void restore()}><DatabaseBackup size={16}/> Recuperar en este navegador</button>
    </>}>
      <p className="text-sm leading-6 text-slate-600 dark:text-zinc-300">Se sustituirá el espacio de trabajo de <strong>este navegador</strong> por la copia de tu cuenta. No fusionaremos automáticamente proyectos con el mismo nombre o identificador.</p>
      {hasLocalData && <div className="mt-4 space-y-3 rounded-xl border border-amber-300 p-3 dark:border-amber-700">
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Protege los proyectos que ya existen en esta computadora.</p>
        <button type="button" className="btn-outline" onClick={downloadExisting} disabled={working}><DatabaseBackup size={16}/> Descargar copia de este navegador</button>
        <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-zinc-300">
          <input type="checkbox" checked={acknowledged} disabled={!downloaded || working} onChange={e => setAcknowledged(e.target.checked)} className="mt-1"/>
          Confirmo que el archivo JSON se descargó y puedo recuperarlo si lo necesito.
        </label>
      </div>}
      <p className="mt-4 text-xs text-slate-500">Solo continúa si reconoces la revisión {metadata.revision}. Esta acción no borra la copia privada de la cuenta.</p>
    </Modal>}
    {fileOpen && <Modal title="Recuperar archivo JSON" onClose={() => !working && setFileOpen(false)} footer={<>
      <button className="btn-outline" disabled={working} onClick={() => setFileOpen(false)}>Cancelar</button>
      <button className="btn-primary" disabled={working || isTraining || !fileSnapshot || (hasLocalData && (!downloaded || !acknowledged))}
        onClick={restoreFromFile}><FileUp size={16}/> Restaurar archivo</button>
    </>}>
      <label className="block text-sm font-semibold text-ink" htmlFor="browser-workspace-file">Selecciona un archivo JSON de NeuroLab</label>
      <input id="browser-workspace-file" type="file" accept=".json,application/json" className="mt-2 w-full text-sm text-slate-600 dark:text-zinc-300"
        onChange={event => void chooseFile(event.target.files?.[0])} disabled={working}/>
      {fileSnapshot && <p className="mt-3 text-sm text-slate-600 dark:text-zinc-300">{fileName}: {workspaceSummary(fileSnapshot).projects} proyectos, {workspaceSummary(fileSnapshot).models} modelos.</p>}
      {hasLocalData && <div className="mt-4 space-y-3 rounded-xl border border-amber-300 p-3 dark:border-amber-700">
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">El archivo sustituirá los proyectos de este navegador. Guarda una copia anterior primero.</p>
        <button className="btn-outline" type="button" onClick={downloadExisting} disabled={working}><DatabaseBackup size={16}/> Descargar copia de este navegador</button>
        <label className="flex gap-2 text-sm text-slate-600 dark:text-zinc-300"><input type="checkbox" className="mt-1"
          disabled={!downloaded || working} checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}/>
          Confirmo que tengo el archivo de respaldo actual.</label>
      </div>}
    </Modal>}
  </section>;
}

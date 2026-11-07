// Proveedor de dominio: estado, persistencia del navegador y ejecución local.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { request } from '../lib/api/client';
import { loadSession, ensureSession, clearSession } from '../lib/api/session';
import type { AccountIdentity } from './AccountGate';
import { validateTraining } from '../lib/neural';
import { trainDenseTfjsNetwork } from '../lib/dense-tfjs';
import { trainCnnNetwork, validateCnnTraining } from '../lib/cnn';
import { emptyWorkspace } from '../lib/storage';
import { validateWorkspaceBackup } from '../lib/workspace-backup';
import { validateArchitectureDraft } from '../features/architectures/validation';
import type { Architecture, Dataset, HiddenLayer, ModelVersion, Project, TrainingConfig, TrainingRun, WorkspaceState, Family, CnnConfig } from '../types/domain';

interface WorkspaceAPI {
  data: WorkspaceState;
  activeProject: Project | null;
  activeArchitecture: Architecture | null;
  isTraining: boolean;
  storageError: string;
  syncStatus: 'saved' | 'saving' | 'error';
  retrySync: () => void;
  dismissStorageError: () => void;
  selectProject: (id: string | null) => void;
  createProject: (name: string, description: string) => void;
  editProject: (id: string, details: Partial<Pick<Project, 'name' | 'description' | 'status'>>) => void;
  deleteProject: (id: string) => void;
  // Se admite editar un ID existente o crear uno nuevo sin sobrescribir los demás.
  saveArchitecture: (projectId: string, family: Family, name: string, hiddenLayers: HiddenLayer[], architectureId?: string, cnn?: CnnConfig) => string;
  selectArchitecture: (projectId: string, architectureId: string) => void;
  removeArchitecture: (projectId: string, architectureId: string) => void;
  importDataset: (projectId: string, name: string, headers: string[], rows: number[][], target: string, kind?: Dataset['kind']) => void;
  removeDataset: (id: string) => void;
  startTraining: (dataset: Dataset, architecture: Architecture, config: TrainingConfig) => Promise<void>;
  cancelTraining: () => void;
  clearWorkspace: () => void;
  restoreWorkspace: (snapshot: unknown) => void;
}
const WorkspaceContext = createContext<WorkspaceAPI | null>(null);
const makeId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

interface RemoteWorkspaceInfo { exists: boolean; revision: number }
interface RemoteWorkspaceSnapshot extends RemoteWorkspaceInfo { workspace: unknown }

/** Todos los proyectos pertenecen a la identidad autenticada, nunca a localStorage. */
export function WorkspaceProvider({ account, children }: { account: AccountIdentity; children: ReactNode }) {
  const [data, setData] = useState<WorkspaceState>(emptyWorkspace);
  const [storageError, setStorageError] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [retrySyncCount, setRetrySyncCount] = useState(0);
  const [retryLoadCount, setRetryLoadCount] = useState(0);
  const revisionRef = useRef(0);
  const persistedRef = useRef<string | null>(null);
  const latestRef = useRef<WorkspaceState>(data);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const cancelRef = useRef<{ cancelled: boolean } | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  latestRef.current = data;

  /** La API valida el JWT. No se carga un espacio vacío ante errores de red: 
   * eso podría sobrescribir erróneamente los proyectos remotos. */
  useEffect(() => {
    let mounted = true;
    setLoadState('loading');
    (async () => {
      const token = loadSession();
      if (!token) throw new Error('Tu sesión terminó. Vuelve a iniciar sesión.');
      const current = await ensureSession(token);
      const info = await request<RemoteWorkspaceInfo>('/workspace-backup/status', current.access_token);
      let workspace: WorkspaceState = emptyWorkspace();
      if (info.exists) {
        const backup = await request<RemoteWorkspaceSnapshot>('/workspace-backup', current.access_token);
        workspace = validateWorkspaceBackup(backup.workspace);
        revisionRef.current = backup.revision;
      } else revisionRef.current = 0;
      if (!mounted) return;
      persistedRef.current = JSON.stringify(workspace);
      setData(workspace);
      setStorageError('');
      setLoadState('ready');
      setSyncStatus('saved');
    })().catch(cause => {
      if (mounted) {
        setStorageError(cause instanceof Error ? cause.message : 'No fue posible recuperar tus proyectos.');
        setLoadState('error');
      }
    });
    return () => { mounted = false; };
  }, [account.id, retryLoadCount]);

  /** Debounce + cola serial: ningún guardado puede reutilizar una revisión anterior.
   * El servidor rechaza revisiones obsoletas con HTTP 409, sin mezclar cuentas. */
  useEffect(() => {
    if (loadState !== 'ready') return;
    if (JSON.stringify(data) === persistedRef.current) {
      setSyncStatus('saved');
      return;
    }
    setSyncStatus('saving');
    const timeout = window.setTimeout(() => {
      saveChainRef.current = saveChainRef.current.catch(() => undefined).then(async () => {
        const snapshot = latestRef.current;
        const serialized = JSON.stringify(snapshot);
        if (serialized === persistedRef.current) return;
        const token = loadSession();
        if (!token) throw new Error('La sesión terminó antes de guardar los cambios.');
        const current = await ensureSession(token);
        // Un guardado en cola NO debe saltar a otra cuenta si cambió la sesión.
        const owner = await request<AccountIdentity>('/me', current.access_token);
        if (owner.id !== account.id || loadSession()?.access_token !== current.access_token) {
          throw new Error('La cuenta cambió. No se enviaron datos de otra persona.');
        }
        const saved = await request<RemoteWorkspaceInfo>('/workspace-backup', current.access_token, 'PUT', {
          expected_revision: revisionRef.current, workspace: snapshot,
        });
        revisionRef.current = saved.revision;
        persistedRef.current = serialized;
        if (serialized === JSON.stringify(latestRef.current)) {
          setStorageError(''); setSyncStatus('saved');
        }
      }).catch(cause => {
        setStorageError(cause instanceof Error ? cause.message : 'Falló el guardado remoto.');
        setSyncStatus('error');
      });
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [data, loadState, retrySyncCount]);

  // Avisar si se intenta recargar/cerrar la pestaña antes del guardado confirmado.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (loadState === 'ready' && JSON.stringify(latestRef.current) !== persistedRef.current) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [loadState]);

  useEffect(() => () => { if (cancelRef.current) cancelRef.current.cancelled = true; }, []);

  const activeProject = useMemo(() => data.projects.find(p => p.id === data.activeProjectId) ?? null, [data]);
  const activeArchitecture = useMemo(() => {
    if (!activeProject) return null;
    const projectArchitectures = data.architectures.filter(a => a.projectId === activeProject.id);
    return projectArchitectures.find(a => a.id === data.activeArchitectureIds[activeProject.id]) ?? projectArchitectures[0] ?? null;
  }, [activeProject, data]);
  const selectProject = (id: string | null) => setData(old => ({ ...old, activeProjectId: id }));

  const createProject = (name: string, description: string) => {
    const trimmed = name.trim();
    if (trimmed.length < 3 || trimmed.length > 80) throw new Error('El nombre debe contener entre 3 y 80 caracteres.');
    const project: Project = { id: makeId(), name: trimmed, description: description.trim(), status: 'active', createdAt: now(), updatedAt: now() };
    setData(old => ({ ...old, projects: [project, ...old.projects], activeProjectId: project.id }));
  };
  const editProject = (id: string, details: Partial<Pick<Project, 'name' | 'description' | 'status'>>) => {
    if (details.name !== undefined && (details.name.trim().length < 3 || details.name.trim().length > 80)) throw new Error('Nombre inválido.');
    setData(old => ({ ...old, projects: old.projects.map(p => p.id === id ? ({ ...p, ...details, updatedAt: now() }) : p) }));
  };
  const deleteProject = (id: string) => {
    if (isTraining) throw new Error('Cancela primero el entrenamiento actual.');
    setData(old => ({ ...old,
      projects: old.projects.filter(p => p.id !== id),
      architectures: old.architectures.filter(a => a.projectId !== id),
      datasets: old.datasets.filter(d => d.projectId !== id),
      runs: old.runs.filter(r => r.projectId !== id),
      models: old.models.filter(m => m.projectId !== id),
      activeProjectId: old.activeProjectId === id ? (old.projects.find(p => p.id !== id)?.id ?? null) : old.activeProjectId,
      activeArchitectureIds: Object.fromEntries(Object.entries(old.activeArchitectureIds).filter(([projectId]) => projectId !== id)),
    }));
  };
  const saveArchitecture = (projectId: string, family: Family, name: string, hiddenLayers: HiddenLayer[], architectureId?: string, cnn?: CnnConfig): string => {
    if (!data.projects.some(p => p.id === projectId)) throw new Error('El proyecto seleccionado no existe.');
    const invalid = validateArchitectureDraft(family, name, hiddenLayers, cnn);
    if (invalid) throw new Error(invalid);
    if (architectureId && !data.architectures.some(a => a.id === architectureId && a.projectId === projectId)) {
      throw new Error('La arquitectura que intentas editar ya no existe.');
    }
    const id = architectureId ?? makeId();
    const architecture: Architecture = { id, projectId, name: name.trim(), family, hiddenLayers: family === 'feedforward' ? hiddenLayers.map(l => ({ ...l })) : [], ...(family === 'cnn' && cnn ? { cnn: { ...cnn } } : {}), updatedAt: now() };
    setData(old => ({
      ...old,
      architectures: architectureId ? old.architectures.map(a => a.id === id ? architecture : a) : [architecture, ...old.architectures],
      activeArchitectureIds: { ...old.activeArchitectureIds, [projectId]: id },
    }));
    return id;
  };
  const selectArchitecture = (projectId: string, architectureId: string) => {
    if (!data.architectures.some(a => a.id === architectureId && a.projectId === projectId)) throw new Error('Arquitectura no encontrada en este proyecto.');
    setData(old => ({ ...old, activeArchitectureIds: { ...old.activeArchitectureIds, [projectId]: architectureId } }));
  };
  const removeArchitecture = (projectId: string, architectureId: string) => {
    if (isTraining) throw new Error('Espera o cancela el entrenamiento para eliminar una arquitectura.');
    setData(old => {
      const remaining = old.architectures.filter(a => a.id !== architectureId || a.projectId !== projectId);
      const current = old.activeArchitectureIds[projectId];
      const nextId = remaining.find(a => a.projectId === projectId)?.id;
      const ids = { ...old.activeArchitectureIds };
      if (current === architectureId) {
        if (nextId) ids[projectId] = nextId;
        else delete ids[projectId];
      }
      return { ...old, architectures: remaining, activeArchitectureIds: ids };
    });
  };
  const importDataset = (projectId: string, name: string, headers: string[], rows: number[][], target: string, kind: Dataset['kind'] = 'tabular') => {
    if (!headers.includes(target)) throw new Error('Selecciona una columna objetivo válida.');
    if (rows.length < 10) throw new Error('Se requieren al menos 10 filas para entrenar y validar.');
    if (kind === 'digits8x8' && (headers.length !== 65 || rows.some(r => r.length !== 65))) throw new Error('Dimensiones inválidas para imágenes 8×8.');
    if (JSON.stringify(rows).length > 2_500_000) throw new Error('Este CSV supera el espacio local permitido. Reduce el número de filas.');
    const dataset: Dataset = { id: makeId(), projectId, name: name.trim() || 'dataset.csv', headers, rows, target, kind, createdAt: now() };
    setData(old => ({ ...old, datasets: [dataset, ...old.datasets.filter(d => d.projectId !== projectId)] }));
  };
  const removeDataset = (id: string) => {
    if (isTraining) throw new Error('Cancela el entrenamiento antes de eliminar el dataset.');
    setData(old => ({ ...old, datasets: old.datasets.filter(d => d.id !== id) }));
  };
  const updateRun = (id: string, patch: Partial<TrainingRun>) => setData(old => ({ ...old, runs: old.runs.map(r => r.id === id ? { ...r, ...patch } : r) }));

  const startTraining = async (dataset: Dataset, architecture: Architecture, config: TrainingConfig) => {
    if (cancelRef.current || isTraining) throw new Error('Ya hay un entrenamiento local en curso.');
    const problem = architecture.family === 'cnn' ? validateCnnTraining(dataset, architecture, config) : validateTraining(dataset, architecture, config);
    if (problem) throw new Error(problem);
    const controller = { cancelled: false };
    cancelRef.current = controller;
    setIsTraining(true);
    const run: TrainingRun = { id: makeId(), projectId: dataset.projectId, datasetId: dataset.id, architectureId: architecture.id,
      architectureName: architecture.name, datasetName: dataset.name, status: 'queued', config: { ...config }, metrics: [], createdAt: now() };
    setData(old => ({ ...old, runs: [run, ...old.runs] }));
    const metricHistory: TrainingRun['metrics'] = [];
    try {
      updateRun(run.id, { status: 'running' });
      const onMetric = (metric: TrainingRun['metrics'][number]) => {
        metricHistory.push(metric);
        updateRun(run.id, { metrics: [...metricHistory] });
      };
      const cnnResult = architecture.family === 'cnn' ? await trainCnnNetwork(dataset, architecture, config, () => controller.cancelled, onMetric) : null;
      const model = architecture.family === 'cnn' ? cnnResult?.network : await trainDenseTfjsNetwork(dataset, architecture, config, () => controller.cancelled, onMetric);
      if (controller.cancelled || !model) {
        updateRun(run.id, { status: 'cancelled', completedAt: now() });
      } else {
        const lastMetric = metricHistory.at(-1)!;
        setData(old => {
          const modelVersion: ModelVersion = {
            id: makeId(), projectId: run.projectId, runId: run.id,
            version: Math.max(0, ...old.models.filter(m => m.projectId === run.projectId).map(m => m.version)) + 1,
            name: architecture.name, createdAt: now(), network: model, finalMetric: lastMetric,
          };
          return { ...old, runs: old.runs.map(r => r.id === run.id ? ({ ...r, status: 'completed', completedAt: now(), metrics: [...metricHistory], ...(cnnResult ? { test: cnnResult.test } : {}) }) : r), models: [modelVersion, ...old.models] };
        });
      }
    } catch (error) {
      updateRun(run.id, { status: 'failed', completedAt: now(), error: error instanceof Error ? error.message : 'Error inesperado del motor local.' });
    } finally {
      cancelRef.current = null;
      setIsTraining(false);
    }
  };
  const cancelTraining = () => { if (cancelRef.current) cancelRef.current.cancelled = true; };
  // Recuperación solo explícita desde Administración. Persistir ANTES de cambiar
  // el estado de React para que una cuota de localStorage no deje una copia falsa.
  const restoreWorkspace = (snapshot: unknown) => {
    if (cancelRef.current || isTraining) throw new Error('Cancela el entrenamiento antes de recuperar una copia.');
    const validated = validateWorkspaceBackup(snapshot);
    // No reactivar un job que dependía de otra pestaña/computadora.
    const restored: WorkspaceState = {
      ...validated,
      runs: validated.runs.map(run => run.status === 'running' || run.status === 'queued'
        ? { ...run, status: 'cancelled' as const, error: 'Entrenamiento interrumpido antes de recuperar la copia.' }
        : run),
    };
    // El autoguardado remoto se encargará de persistirlo con la revisión actual.
    setData(restored);
  };
  const clearWorkspace = () => {
    if (isTraining) throw new Error('Cancela el entrenamiento antes de borrar los datos.');
    setData(emptyWorkspace());
  };
  // No montar módulos ni operaciones si no se pudo leer la fuente remota.
  if (loadState === 'loading') return <div role="status" className="grid min-h-screen place-items-center bg-canvas text-ink"><div className="flex items-center gap-3"><LoaderCircle size={24} className="animate-spin text-primary-600"/> Cargando tus proyectos desde la nube…</div></div>;
  if (loadState === 'error') return <div className="grid min-h-screen place-items-center bg-canvas p-6"><section className="panel max-w-lg p-8 text-center"><h2 className="text-xl font-bold text-ink">No pudimos cargar tus proyectos</h2><p role="alert" className="mt-3 text-sm text-red-600">{storageError}</p><p className="mt-2 text-sm text-slate-500">No se creó un espacio alternativo ni se sobrescribió la copia de tu cuenta.</p><div className="mt-5 flex justify-center gap-3"><button type="button" className="btn-primary" onClick={() => setRetryLoadCount(n => n + 1)}>Reintentar conexión</button><button type="button" className="btn-outline" onClick={clearSession}>Cerrar sesión</button></div></section></div>;
  return <WorkspaceContext.Provider value={{ data, activeProject, activeArchitecture, isTraining, storageError, syncStatus, retrySync: () => setRetrySyncCount(n => n + 1), dismissStorageError: () => undefined, selectProject, createProject, editProject, deleteProject, saveArchitecture, selectArchitecture, removeArchitecture, importDataset, removeDataset, startTraining, cancelTraining, clearWorkspace, restoreWorkspace }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceAPI {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace requiere WorkspaceProvider');
  return context;
}

// Proveedor de dominio: estado, persistencia del navegador y ejecución local.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { validateTraining } from '../lib/neural';
import { trainDenseTfjsNetwork } from '../lib/dense-tfjs';
import { trainCnnNetwork, validateCnnTraining } from '../lib/cnn';
import { emptyWorkspace, readWorkspace, saveWorkspace } from '../lib/storage';
import { validateWorkspaceBackup } from '../lib/workspace-backup';
import { validateArchitectureDraft } from '../features/architectures/validation';
import type { Architecture, Dataset, HiddenLayer, ModelVersion, Project, TrainingConfig, TrainingRun, WorkspaceState, Family, CnnConfig } from '../types/domain';

interface WorkspaceAPI {
  data: WorkspaceState;
  activeProject: Project | null;
  activeArchitecture: Architecture | null;
  isTraining: boolean;
  storageError: string;
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

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  // No se cargan registros de ejemplo: el espacio empieza vacío.
  const [data, setData] = useState<WorkspaceState>(readWorkspace);
  const [storageError, setStorageError] = useState('');
  const cancelRef = useRef<{ cancelled: boolean } | null>(null);
  const [isTraining, setIsTraining] = useState(false);

  useEffect(() => {
    try { saveWorkspace(data); setStorageError(''); }
    catch { setStorageError('El almacenamiento del navegador está lleno o bloqueado. Exporta tus datos y elimina datasets antiguos.'); }
  }, [data]);

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
    saveWorkspace(restored); // Lanza error si la cuota del navegador se agotó.
    setData(restored);
  };
  const clearWorkspace = () => {
    if (isTraining) throw new Error('Cancela el entrenamiento antes de borrar los datos.');
    setData(emptyWorkspace());
  };
  return <WorkspaceContext.Provider value={{ data, activeProject, activeArchitecture, isTraining, storageError, dismissStorageError: () => setStorageError(''), selectProject, createProject, editProject, deleteProject, saveArchitecture, selectArchitecture, removeArchitecture, importDataset, removeDataset, startTraining, cancelTraining, clearWorkspace, restoreWorkspace }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceAPI {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace requiere WorkspaceProvider');
  return context;
}

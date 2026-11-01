// Tipos de dominio para proyectos, datasets, arquitectura y experimentos.
/** Contratos internos del frontend, independientes de un backend futuro. */
export type Family = 'feedforward' | 'rnn' | 'cnn' | 'gan';
export type Activation = 'relu' | 'tanh' | 'sigmoid';
export type TaskKind = 'classification' | 'regression' | 'multiclass';
export type RunStatus = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}
export interface HiddenLayer { id: string; units: number; activation: Activation; }
/** Configuración pequeña y validable de Conv2D(3×3) -> MaxPool -> Dense -> Softmax. */
export interface CnnConfig { filters: number; denseUnits: number; }
export interface Architecture {
  id: string;
  projectId: string;
  name: string;
  family: Family;
  hiddenLayers: HiddenLayer[];
  cnn?: CnnConfig;
  updatedAt: string;
}
export interface Dataset {
  id: string;
  projectId: string;
  name: string;
  headers: string[];
  rows: number[][];
  target: string;
  /** Distingue las 64 intensidades 8×8 de los datasets tabulares. */
  kind?: 'tabular' | 'digits8x8';
  createdAt: string;
}
export interface EpochMetric {
  epoch: number;
  loss: number;
  valLoss: number;
  accuracy?: number;
  valAccuracy?: number;
}
export interface TrainingConfig {
  epochs: number;
  batchSize: number;
  learningRate: number;
  validationSplit: number;
  seed: number;
  task: TaskKind;
}
export interface TrainingRun {
  id: string;
  projectId: string;
  datasetId: string;
  architectureId: string;
  architectureName: string;
  datasetName: string;
  status: RunStatus;
  config: TrainingConfig;
  metrics: EpochMetric[];
  createdAt: string;
  completedAt?: string;
  error?: string;
  /** Conjunto de prueba reservado: no se utiliza en el ajuste ni en validación. */
  test?: CNNTestSummary;
}
export interface NetworkLayer { weights: number[][]; biases: number[]; activation: Activation | 'linear'; }
export interface TrainedNetwork {
  layers: NetworkLayer[];
  means: number[];
  stds: number[];
  targetMean: number;
  targetStd: number;
  features: string[];
  target: string;
  task: TaskKind;
}
/** Pesos exportables que reconstruyen una CNN real con TensorFlow.js. */
export interface CNNNetwork { kind: 'cnn'; imageSize: 8; classes: 10; filters: number; denseUnits: number; weights: { shape: number[]; values: number[] }[]; }
export interface CNNTestSummary { loss: number; accuracy: number; samples: number; confusion: number[][]; }
export interface ModelVersion {
  id: string;
  projectId: string;
  runId: string;
  version: number;
  name: string;
  createdAt: string;
  network: TrainedNetwork | CNNNetwork;
  finalMetric: EpochMetric;
}
export interface WorkspaceState {
  projects: Project[];
  architectures: Architecture[];
  datasets: Dataset[];
  runs: TrainingRun[];
  models: ModelVersion[];
  activeProjectId: string | null;
  /** Preferencia local de la arquitectura seleccionada por proyecto (migración v0.1 compatible). */
  activeArchitectureIds: Record<string, string>;
}

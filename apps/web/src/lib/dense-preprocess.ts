// División y normalización del CSV: lógica pura, compartida por pruebas y TensorFlow.js.
import type { Dataset, TrainingConfig } from '../types/domain';

export interface DensePreparedData {
  features: string[];
  target: string;
  trainIndices: number[];
  validationIndices: number[];
  xTrain: number[][];
  yTrain: number[][];
  xValidation: number[][];
  yValidation: number[][];
  means: number[];
  stds: number[];
  targetMean: number;
  targetStd: number;
}

/** PRNG con semilla: hace reproducible la partición, no promete equivalencia entre GPUs. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Retorna índices sin modificar los registros ni el orden del dataset original. */
export function splitDenseIndices(length: number, seed: number, validationSplit: number): { train: number[]; validation: number[] } {
  if (!Number.isInteger(length) || length < 10 || !Number.isSafeInteger(seed) || seed < 0 || !Number.isFinite(validationSplit) || validationSplit < 0.1 || validationSplit > 0.4) {
    throw new Error('La partición de entrenamiento/validación no es válida.');
  }
  const indices = Array.from({ length }, (_, i) => i);
  const random = seededRandom(seed);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const cutoff = Math.min(length - 2, Math.max(2, Math.round(length * (1 - validationSplit))));
  return { train: indices.slice(0, cutoff), validation: indices.slice(cutoff) };
}

/** Evita fuga estadística: medias/desviaciones se calculan exclusivamente sobre train. */
export function prepareDenseData(dataset: Dataset, config: TrainingConfig): DensePreparedData {
  const targetIndex = dataset.headers.indexOf(dataset.target);
  if (targetIndex < 0) throw new Error('El dataset no contiene la columna objetivo.');
  const featureIndices = dataset.headers.map((_, i) => i).filter(i => i !== targetIndex);
  if (!featureIndices.length) throw new Error('El dataset necesita al menos un atributo de entrada.');
  for (const row of dataset.rows) {
    if (row.length !== dataset.headers.length || row.some(value => !Number.isFinite(value))) {
      throw new Error('Todos los registros deben contener valores numéricos finitos y el mismo número de columnas.');
    }
  }
  const { train, validation } = splitDenseIndices(dataset.rows.length, config.seed, config.validationSplit);
  const mean = (indices: number[], column: number) => indices.reduce((sum, i) => sum + dataset.rows[i][column], 0) / indices.length;
  const means = featureIndices.map(column => mean(train, column));
  const stds = featureIndices.map((column, j) => Math.sqrt(train.reduce((sum, i) => sum + (dataset.rows[i][column] - means[j]) ** 2, 0) / train.length) || 1);
  const targetMean = config.task === 'regression' ? mean(train, targetIndex) : 0;
  const targetStd = config.task === 'regression' ? Math.sqrt(train.reduce((sum, i) => sum + (dataset.rows[i][targetIndex] - targetMean) ** 2, 0) / train.length) || 1 : 1;
  const x = (indices: number[]) => indices.map(i => featureIndices.map((column, j) => (dataset.rows[i][column] - means[j]) / stds[j]));
  const y = (indices: number[]) => indices.map(i => [(dataset.rows[i][targetIndex] - targetMean) / targetStd]);
  return {
    features: featureIndices.map(i => dataset.headers[i]), target: dataset.target,
    trainIndices: train, validationIndices: validation,
    xTrain: x(train), yTrain: y(train), xValidation: x(validation), yValidation: y(validation),
    means, stds, targetMean, targetStd,
  };
}

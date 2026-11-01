// Red neuronal Feedforward con entrenamiento SGD implementado en TypeScript.
import type { Architecture, Dataset, EpochMetric, NetworkLayer, TrainedNetwork, TrainingConfig } from '../types/domain';

/** Motor experimental real para redes densas; no sustituye TensorFlow/Keras de producción. */
type Entry = { x: number[]; y: number };
const EPSILON = 1e-10;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function pseudoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(array: T[], random: () => number): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
function activation(z: number, fn: NetworkLayer['activation']): number {
  if (fn === 'relu') return Math.max(0, z);
  if (fn === 'tanh') return Math.tanh(z);
  if (fn === 'sigmoid') return 1 / (1 + Math.exp(-clamp(z, -60, 60)));
  return z;
}
function derivative(z: number, a: number, fn: NetworkLayer['activation']): number {
  if (fn === 'relu') return z > 0 ? 1 : 0;
  if (fn === 'tanh') return 1 - a * a;
  if (fn === 'sigmoid') return a * (1 - a);
  return 1;
}
function forward(layers: NetworkLayer[], x: number[]): { activations: number[][]; preActivations: number[][] } {
  const activations = [x];
  const preActivations: number[][] = [];
  for (const layer of layers) {
    const before = activations[activations.length - 1];
    const z = layer.weights.map((row, j) => row.reduce((s, weight, i) => s + weight * before[i], layer.biases[j]));
    preActivations.push(z);
    activations.push(z.map(n => activation(n, layer.activation)));
  }
  return { activations, preActivations };
}
function evaluate(layers: NetworkLayer[], samples: Entry[], task: TrainingConfig['task']): { loss: number; accuracy?: number } {
  let loss = 0, correct = 0;
  for (const sample of samples) {
    const p = forward(layers, sample.x).activations.at(-1)![0];
    if (task === 'classification') {
      const prob = clamp(p, EPSILON, 1 - EPSILON);
      loss += -(sample.y * Math.log(prob) + (1 - sample.y) * Math.log(1 - prob));
      if ((p >= 0.5 ? 1 : 0) === sample.y) correct++;
    } else {
      loss += 0.5 * Math.pow(p - sample.y, 2);
    }
  }
  return { loss: loss / samples.length, ...(task === 'classification' ? { accuracy: correct / samples.length } : {}) };
}

export function validateTraining(dataset: Dataset, architecture: Architecture, config: TrainingConfig): string | null {
  if (dataset.kind === 'digits8x8') return 'El dataset de dígitos 8×8 está reservado para redes CNN. Usa CSV tabular para Feedforward.';
  if (config.task !== 'classification' && config.task !== 'regression') return 'Feedforward solo admite clasificación binaria o regresión.';
  if (dataset.projectId !== architecture.projectId) return 'El dataset y la arquitectura deben pertenecer al mismo proyecto.';
  if (architecture.family !== 'feedforward') return 'Por ahora, el entrenamiento local admite únicamente redes Feedforward.';
  if (dataset.rows.length < 10) return 'Se requieren al menos 10 registros para separar entrenamiento y validación.';
  if (architecture.hiddenLayers.length < 1 || architecture.hiddenLayers.length > 4) return 'Configura entre 1 y 4 capas ocultas.';
  if (architecture.hiddenLayers.some(l => !Number.isInteger(l.units) || l.units < 1 || l.units > 64)) return 'Cada capa necesita entre 1 y 64 neuronas.';
  if (!Number.isInteger(config.epochs) || config.epochs < 1 || config.epochs > 120) return 'Las épocas deben estar entre 1 y 120.';
  if (!Number.isInteger(config.batchSize) || config.batchSize < 1 || config.batchSize > 256) return 'El tamaño de lote debe estar entre 1 y 256.';
  if (!Number.isFinite(config.learningRate) || config.learningRate <= 0 || config.learningRate > 0.5) return 'La tasa de aprendizaje debe ser mayor que 0 y no superar 0.5.';
  if (!Number.isFinite(config.validationSplit) || config.validationSplit < 0.1 || config.validationSplit > 0.4) return 'La validación debe reservar entre 10 % y 40 %.';
  if (!Number.isSafeInteger(config.seed) || config.seed < 0) return 'La semilla debe ser un entero positivo o cero.';
  const targetIndex = dataset.headers.indexOf(dataset.target);
  if (targetIndex < 0) return 'La columna objetivo no existe en el dataset.';
  if (config.task === 'classification' && dataset.rows.some(row => row[targetIndex] !== 0 && row[targetIndex] !== 1)) return 'Para clasificación binaria, la columna objetivo solo puede contener 0 o 1.';
  return null;
}

export async function trainDenseNetwork(
  dataset: Dataset,
  architecture: Architecture,
  config: TrainingConfig,
  cancelled: () => boolean,
  onEpoch: (metric: EpochMetric) => void,
): Promise<TrainedNetwork | null> {
  const invalid = validateTraining(dataset, architecture, config);
  if (invalid) throw new Error(invalid);
  const targetIndex = dataset.headers.indexOf(dataset.target);
  const featureIndices = dataset.headers.map((_, i) => i).filter(i => i !== targetIndex);
  const random = pseudoRandom(config.seed);
  const records: Entry[] = dataset.rows.map(row => ({ x: featureIndices.map(i => row[i]), y: row[targetIndex] }));
  shuffle(records, random);
  const splitIndex = Math.min(records.length - 2, Math.max(2, Math.round(records.length * (1 - config.validationSplit))));
  const training = records.slice(0, splitIndex);
  const validation = records.slice(splitIndex);
  const means = featureIndices.map((_, i) => training.reduce((sum, record) => sum + record.x[i], 0) / training.length);
  const stds = means.map((mean, i) => Math.sqrt(training.reduce((sum, record) => sum + Math.pow(record.x[i] - mean, 2), 0) / training.length) || 1);
  const targetMean = config.task === 'regression' ? training.reduce((s, r) => s + r.y, 0) / training.length : 0;
  const targetStd = config.task === 'regression' ? Math.sqrt(training.reduce((s, r) => s + (r.y - targetMean) ** 2, 0) / training.length) || 1 : 1;
  const transform = (item: Entry): Entry => ({
    x: item.x.map((value, i) => (value - means[i]) / stds[i]),
    y: config.task === 'regression' ? (item.y - targetMean) / targetStd : item.y,
  });
  const train = training.map(transform);
  const val = validation.map(transform);
  const dimensions = [featureIndices.length, ...architecture.hiddenLayers.map(l => l.units), 1];
  const layers: NetworkLayer[] = dimensions.slice(1).map((size, index) => {
    const prev = dimensions[index];
    const scale = Math.sqrt(2 / (prev + size));
    return {
      activation: index === dimensions.length - 2 ? (config.task === 'classification' ? 'sigmoid' : 'linear') : architecture.hiddenLayers[index].activation,
      weights: Array.from({ length: size }, () => Array.from({ length: prev }, () => (random() * 2 - 1) * scale)),
      biases: Array(size).fill(0) as number[],
    };
  });

  // Retropropagación y optimización mini-batch con gradientes acotados.
  for (let epoch = 1; epoch <= config.epochs; epoch++) {
    if (cancelled()) return null;
    shuffle(train, random);
    for (let start = 0; start < train.length; start += config.batchSize) {
      if (cancelled()) return null;
      const batch = train.slice(start, start + config.batchSize);
      const gradW = layers.map(l => l.weights.map(row => row.map(() => 0)));
      const gradB = layers.map(l => l.biases.map(() => 0));
      for (const record of batch) {
        const { activations, preActivations } = forward(layers, record.x);
        const deltas: number[][] = Array(layers.length);
        const output = activations.at(-1)![0];
        deltas[layers.length - 1] = [output - record.y];
        for (let l = layers.length - 2; l >= 0; l--) {
          const next = layers[l + 1];
          deltas[l] = layers[l].biases.map((_, j) => {
            const chain = next.weights.reduce((sum, weights, k) => sum + weights[j] * deltas[l + 1][k], 0);
            return chain * derivative(preActivations[l][j], activations[l + 1][j], layers[l].activation);
          });
        }
        for (let l = 0; l < layers.length; l++) {
          for (let j = 0; j < layers[l].biases.length; j++) {
            gradB[l][j] += deltas[l][j];
            for (let k = 0; k < layers[l].weights[j].length; k++) {
              gradW[l][j][k] += deltas[l][j] * activations[l][k];
            }
          }
        }
      }
      const rate = config.learningRate / batch.length;
      for (let l = 0; l < layers.length; l++) {
        for (let j = 0; j < layers[l].biases.length; j++) {
          layers[l].biases[j] -= rate * clamp(gradB[l][j], -5 * batch.length, 5 * batch.length);
          for (let k = 0; k < layers[l].weights[j].length; k++) {
            layers[l].weights[j][k] -= rate * clamp(gradW[l][j][k], -5 * batch.length, 5 * batch.length);
          }
        }
      }
    }
    const observedTrain = evaluate(layers, train, config.task);
    const observedVal = evaluate(layers, val, config.task);
    const metric: EpochMetric = {
      epoch,
      loss: observedTrain.loss,
      valLoss: observedVal.loss,
      ...(config.task === 'classification' ? { accuracy: observedTrain.accuracy, valAccuracy: observedVal.accuracy } : {}),
    };
    if (![metric.loss, metric.valLoss].every(Number.isFinite)) throw new Error('El optimizador produjo valores no finitos. Reduce la tasa de aprendizaje.');
    onEpoch(metric);
    // Ceder el control permite pintar métricas y procesar la cancelación.
    await new Promise<void>(resolve => window.setTimeout(resolve, 0));
  }
  if (cancelled()) return null;
  return { layers, means, stds, targetMean, targetStd, features: featureIndices.map(i => dataset.headers[i]), target: dataset.target, task: config.task };
}

export function predict(network: TrainedNetwork, values: number[]): number {
  if (values.length !== network.features.length || values.some(v => !Number.isFinite(v))) throw new Error('Introduce un valor numérico válido por cada variable de entrada.');
  const transformed = values.map((v, i) => (v - network.means[i]) / network.stds[i]);
  const result = forward(network.layers, transformed).activations.at(-1)![0];
  return network.task === 'regression' ? result * network.targetStd + network.targetMean : result;
}

export function parameterCount(architecture: Architecture, inputCount: number): number {
  const dims = [inputCount, ...architecture.hiddenLayers.map(l => l.units), 1];
  return dims.slice(1).reduce((sum, units, i) => sum + (dims[i] + 1) * units, 0);
}

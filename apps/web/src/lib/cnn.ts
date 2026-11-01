// Motor CNN auténtico con TensorFlow.js; todo se ejecuta en el navegador (sin Python/API).
import type { Architecture, CnnConfig, CNNNetwork, Dataset, EpochMetric, TrainingConfig } from '../types/domain';
import { isDigitsDataset, splitDigits } from './digits';

export function validateCnnTraining(dataset: Dataset, architecture: Architecture, config: TrainingConfig): string | null {
  if (architecture.family !== 'cnn') return 'Selecciona una arquitectura CNN.';
  if (!isDigitsDataset(dataset)) return 'La CNN necesita un dataset de dígitos 8×8 con 64 píxeles y etiquetas 0–9.';
  if (config.task !== 'multiclass') return 'La tarea CNN debe ser clasificación multiclase.';
  if (dataset.projectId !== architecture.projectId) return 'Dataset y arquitectura deben pertenecer al mismo proyecto.';
  if (!architecture.cnn || ![8, 16, 32].includes(architecture.cnn.filters) || ![16, 32, 64].includes(architecture.cnn.denseUnits)) return 'La configuración CNN no es válida.';
  if (dataset.rows.length < 30) return 'La CNN necesita al menos 30 imágenes etiquetadas.';
  if (!Number.isInteger(config.epochs) || config.epochs < 1 || config.epochs > 40) return 'La CNN admite entre 1 y 40 épocas.';
  if (![16, 32, 64, 128].includes(config.batchSize)) return 'Selecciona un batch size de 16, 32, 64 o 128.';
  if (!(config.learningRate >= 0.0001 && config.learningRate <= 0.02)) return 'La tasa de aprendizaje debe estar entre 0.0001 y 0.02.';
  if (!Number.isFinite(config.validationSplit) || config.validationSplit < 0.1 || config.validationSplit > 0.3) return 'La validación debe estar entre 10 % y 30 %.';
  if (!Number.isSafeInteger(config.seed) || config.seed < 0 || config.seed > 1_000_000_000) return 'La semilla debe ser un entero válido.';
  return null;
}

/** Forma fija para que arquitecturas serializadas puedan reconstruirse para inferencia. */
export async function createCnnModel(cnn: CnnConfig) {
  const tf = await import('@tensorflow/tfjs');
  const model = tf.sequential();
  model.add(tf.layers.conv2d({ inputShape: [8, 8, 1], filters: cnn.filters, kernelSize: 3, activation: 'relu', padding: 'valid' }));
  model.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
  model.add(tf.layers.flatten());
  model.add(tf.layers.dense({ units: cnn.denseUnits, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 10, activation: 'softmax' }));
  return model;
}

export interface CNNTestSummary { loss: number; accuracy: number; samples: number; confusion: number[][]; }

/** Separa entrenamiento, validación y TEST antes de ajustar pesos: sin fuga de datos. */
export async function trainCnnNetwork(
  dataset: Dataset,
  architecture: Architecture,
  config: TrainingConfig,
  cancelled: () => boolean,
  report: (metric: EpochMetric) => void,
): Promise<{ network: CNNNetwork; test: CNNTestSummary } | null> {
  const issue = validateCnnTraining(dataset, architecture, config);
  if (issue) throw new Error(issue);
  if (cancelled()) return null;
  const tf = await import('@tensorflow/tfjs');
  await tf.ready();
  const cnn = architecture.cnn!;
  const { train, validation, test } = splitDigits(dataset.rows, config.seed, config.validationSplit);
  const values = (indices: number[]) => new Float32Array(indices.flatMap(i => dataset.rows[i].slice(0, 64).map(v => v / 16)));
  const labels = (indices: number[]) => indices.map(i => dataset.rows[i][64]);
  const xTrain = tf.tensor4d(values(train), [train.length, 8, 8, 1]);
  const xVal = tf.tensor4d(values(validation), [validation.length, 8, 8, 1]);
  const xTest = tf.tensor4d(values(test), [test.length, 8, 8, 1]);
  const makeTargets = (indices: number[]) => tf.tidy(() => tf.oneHot(tf.tensor1d(labels(indices), 'int32'), 10));
  const yTrain = makeTargets(train);
  const yVal = makeTargets(validation);
  const yTest = makeTargets(test);
  let model: Awaited<ReturnType<typeof createCnnModel>> | null = null;
  try {
    model = await createCnnModel(cnn);
    model.compile({ optimizer: tf.train.adam(config.learningRate), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
    const runningModel = model;
    await model.fit(xTrain, yTrain, {
      epochs: config.epochs,
      batchSize: config.batchSize,
      validationData: [xVal, yVal],
      shuffle: false, // los datos ya fueron barajados con la semilla de separación
      yieldEvery: 'epoch',
      callbacks: { onEpochEnd: async (epoch, logs) => {
        if (!logs) return;
        const acc = Number(logs.acc ?? logs.accuracy);
        const valAcc = Number(logs.val_acc ?? logs.val_accuracy);
        report({ epoch: epoch + 1, loss: Number(logs.loss), valLoss: Number(logs.val_loss),
          ...(Number.isFinite(acc) ? { accuracy: acc } : {}),
          ...(Number.isFinite(valAcc) ? { valAccuracy: valAcc } : {}) });
        if (cancelled()) runningModel.stopTraining = true;
        await tf.nextFrame(); // permite interacción y cancelación entre épocas
      } },
    });
    if (cancelled()) return null;
    const result = model.evaluate(xTest, yTest, { batchSize: config.batchSize });
    const evaluated = Array.isArray(result) ? result : [result];
    const testLoss = Number((await evaluated[0].data())[0]);
    const testAccuracy = Number((await evaluated[1].data())[0]);
    evaluated.forEach(tensor => tensor.dispose());
    const predicted = model.predict(xTest) as import('@tensorflow/tfjs').Tensor;
    const classTensor = predicted.argMax(-1);
    const predictedClasses = Array.from(await classTensor.data(), v => Number(v));
    classTensor.dispose();
    const confusion = Array.from({ length: 10 }, () => Array<number>(10).fill(0));
    for (let i = 0; i < test.length; i++) confusion[dataset.rows[test[i]][64]][predictedClasses[i]]++;
    predicted.dispose();
    const weights = await Promise.all(model.getWeights().map(async tensor => ({ shape: [...tensor.shape], values: Array.from(await tensor.data()) })));
    return { network: { kind: 'cnn', imageSize: 8, classes: 10, filters: cnn.filters, denseUnits: cnn.denseUnits, weights },
      test: { loss: testLoss, accuracy: testAccuracy, samples: test.length, confusion } };
  } finally {
    xTrain.dispose(); xVal.dispose(); xTest.dispose(); yTrain.dispose(); yVal.dispose(); yTest.dispose();
    model?.dispose();
  }
}

/** Reconstruye pesos reales guardados de un modelo CNN; no reentrena para predecir. */
export async function predictCnn(network: CNNNetwork, pixels: number[]): Promise<{ label: number; probabilities: number[] }> {
  if (pixels.length !== 64 || pixels.some(p => !Number.isFinite(p) || p < 0 || p > 16)) throw new Error('La imagen necesita 64 píxeles entre 0 y 16.');
  const tf = await import('@tensorflow/tfjs');
  await tf.ready();
  const model = await createCnnModel({ filters: network.filters, denseUnits: network.denseUnits });
  const weights = network.weights.map(w => tf.tensor(w.values, w.shape));
  try {
    model.setWeights(weights);
    const image = tf.tensor4d(pixels.map(value => value / 16), [1, 8, 8, 1]);
    try {
      const prediction = model.predict(image) as import('@tensorflow/tfjs').Tensor;
      try {
        const probabilities = Array.from(await prediction.data(), v => Number(v));
        const label = probabilities.indexOf(Math.max(...probabilities));
        return { label, probabilities };
      } finally { prediction.dispose(); }
    } finally { image.dispose(); }
  } finally { weights.forEach(w => w.dispose()); model.dispose(); }
}

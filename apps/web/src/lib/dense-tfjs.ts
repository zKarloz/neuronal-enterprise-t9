// Entrenamiento Feedforward REAL mediante TensorFlow.js en el navegador.
// Mantiene la estructura de pesos de NeuroLab v0.1–0.12 para no romper la inferencia histórica.
import type { Architecture, Dataset, EpochMetric, NetworkLayer, TrainedNetwork, TrainingConfig } from '../types/domain';
import { validateTraining } from './neural';
import { prepareDenseData } from './dense-preprocess';

/** Sólo Feedforward tabular: para imágenes 8×8 sigue disponible el motor CNN. */
export async function trainDenseTfjsNetwork(
  dataset: Dataset,
  architecture: Architecture,
  config: TrainingConfig,
  cancelled: () => boolean,
  report: (metric: EpochMetric) => void,
): Promise<TrainedNetwork | null> {
  const problem = validateTraining(dataset, architecture, config);
  if (problem) throw new Error(problem);
  if (cancelled()) return null;

  // La importación diferida evita inicializar TensorFlow.js hasta iniciar un entrenamiento.
  const tf = await import('@tensorflow/tfjs');
  await tf.ready();
  if (cancelled()) return null;
  const prepared = prepareDenseData(dataset, config);
  const model = tf.sequential();
  const trainX = tf.tensor2d(prepared.xTrain);
  const trainY = tf.tensor2d(prepared.yTrain);
  const validX = tf.tensor2d(prepared.xValidation);
  const validY = tf.tensor2d(prepared.yValidation);
  let optimizer: import('@tensorflow/tfjs').Optimizer | null = null;
  try {
    const isClassification = config.task === 'classification';
    const inputSize = prepared.features.length;
    const configurations = [
      ...architecture.hiddenLayers.map(layer => ({ units: layer.units, activation: layer.activation })),
      { units: 1, activation: isClassification ? 'sigmoid' : 'linear' },
    ];
    for (const [index, layer] of configurations.entries()) {
      model.add(tf.layers.dense({
        ...(index === 0 ? { inputShape: [inputSize] } : {}),
        units: layer.units,
        activation: layer.activation as 'relu' | 'sigmoid' | 'tanh' | 'linear',
        kernelInitializer: tf.initializers.glorotUniform({ seed: (config.seed + index) >>> 0 }),
        biasInitializer: 'zeros',
      }));
    }
    // Conservamos SGD para no cambiar de optimizador al migrar la implementación.
    optimizer = tf.train.sgd(config.learningRate);
    model.compile({
      optimizer,
      loss: isClassification ? 'binaryCrossentropy' : 'meanSquaredError',
      ...(isClassification ? { metrics: ['accuracy'] } : {}),
    });
    await model.fit(trainX, trainY, {
      epochs: config.epochs,
      batchSize: config.batchSize,
      validationData: [validX, validY],
      shuffle: false, // Partición/barajado ya fijados por seed; sin fuga desde validación.
      yieldEvery: 'epoch',
      callbacks: {
        onBatchEnd: async () => {
          // Una cancelación en batch evita esperar innecesariamente a toda la época.
          if (cancelled()) model.stopTraining = true;
        },
        onEpochEnd: async (epoch, logs) => {
          if (!logs) throw new Error('TensorFlow.js no devolvió métricas para esta época.');
          const loss = Number(logs.loss);
          const valLoss = Number(logs.val_loss);
          if (!Number.isFinite(loss) || !Number.isFinite(valLoss)) {
            throw new Error('El optimizador produjo valores no finitos. Reduce la tasa de aprendizaje.');
          }
          const accuracy = Number(logs.acc ?? logs.accuracy);
          const valAccuracy = Number(logs.val_acc ?? logs.val_accuracy);
          report({ epoch: epoch + 1, loss, valLoss,
            ...(isClassification && Number.isFinite(accuracy) ? { accuracy } : {}),
            ...(isClassification && Number.isFinite(valAccuracy) ? { valAccuracy } : {}),
          });
          if (cancelled()) model.stopTraining = true;
          await tf.nextFrame(); // Permite actualizar el monitor y atender clics de cancelación.
        },
      },
    });
    if (cancelled()) return null;

    // tfjs: kernel[input][units]; NeuroLab histórico: weights[units][input].
    // Transponemos al exportar para reutilizar `predict()` sin reentrenar modelos existentes.
    const layers: NetworkLayer[] = [];
    for (let index = 0; index < model.layers.length; index++) {
      const weights = model.layers[index].getWeights();
      try {
        if (weights.length !== 2 || weights[0].shape.length !== 2 || weights[1].shape.length !== 1) {
          throw new Error('La estructura de pesos de TensorFlow.js no es compatible con la inferencia Feedforward.');
        }
        const [inputs, units] = weights[0].shape;
        const flat = Array.from(await weights[0].data());
        const biases = Array.from(await weights[1].data());
        if (flat.some(value => !Number.isFinite(value)) || biases.some(value => !Number.isFinite(value))) {
          throw new Error('Los pesos del modelo entrenado contienen valores no finitos.');
        }
        const matrix = Array.from({ length: units }, (_, unit) =>
          Array.from({ length: inputs }, (_, input) => flat[input * units + unit]));
        layers.push({ weights: matrix, biases, activation: index === model.layers.length - 1
          ? (isClassification ? 'sigmoid' : 'linear') : architecture.hiddenLayers[index].activation });
      } finally {
        weights.forEach(weight => weight.dispose());
      }
    }
    return { layers, means: prepared.means, stds: prepared.stds,
      targetMean: prepared.targetMean, targetStd: prepared.targetStd,
      features: prepared.features, target: prepared.target, task: config.task, engine: 'tfjs' };
  } finally {
    trainX.dispose(); trainY.dispose(); validX.dispose(); validY.dispose();
    model.dispose();
    // El optimizador puede conservar tensores internos; liberarlos al terminar.
    optimizer?.dispose();
  }
}

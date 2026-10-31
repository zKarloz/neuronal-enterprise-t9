// Validaciones del editor M04: se usan también en el proveedor antes de persistir.
import type { Activation, Family, HiddenLayer, CnnConfig } from '../../types/domain';

const validActivations: Activation[] = ['relu', 'tanh', 'sigmoid'];

/** Valida exclusivamente configuraciones compatibles con el motor local disponible. */
export function validateArchitectureDraft(family: Family, name: string, layers: HiddenLayer[], cnn?: CnnConfig): string | null {
  const cleanName = name.trim();
  if (cleanName.length < 3 || cleanName.length > 80) return 'El nombre debe tener entre 3 y 80 caracteres.';
  if (family === 'cnn') {
    if (!cnn || ![8, 16, 32].includes(cnn.filters) || ![16, 32, 64].includes(cnn.denseUnits)) return 'La CNN requiere 8/16/32 filtros y 16/32/64 neuronas densas.';
    return null;
  }
  if (family !== 'feedforward') return null; // RNN/GAN permanecen documentales.
  if (layers.length < 1 || layers.length > 4) return 'Configura entre 1 y 4 capas ocultas.';
  if (new Set(layers.map(layer => layer.id)).size !== layers.length) return 'Las capas deben tener identificadores únicos.';
  for (const [index, layer] of layers.entries()) {
    if (!Number.isInteger(layer.units) || layer.units < 1 || layer.units > 64) return `La capa ${index + 1} debe tener entre 1 y 64 neuronas enteras.`;
    if (!validActivations.includes(layer.activation)) return `La activación de la capa ${index + 1} no es válida.`;
  }
  return null;
}

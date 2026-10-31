/**
 * Preprocesamiento reproducible de fotos de dígitos para el formato de scikit-learn digits:
 * 64 intensidades en [0,16], fondo oscuro y trazos claros.
 * Las fotografías se procesan exclusivamente en el navegador y nunca se persisten.
 */
export type InkMode = 'auto' | 'dark-on-light' | 'light-on-dark';
export type ResolvedInkMode = Exclude<InkMode, 'auto'>;

export interface GrayscaleImage {
  width: number;
  height: number;
  /** Luminancia por píxel (0 negro, 255 blanco). */
  pixels: Uint8ClampedArray;
}

export interface DigitProcessingOptions {
  inkMode: InkMode;
  /** Contraste mínimo sobre 255, de 0.05 a 0.45. */
  threshold: number;
}

export interface ProcessedDigit {
  pixels: number[];
  inkMode: ResolvedInkMode;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_COUNT = 8;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function validateImageUpload(file: { type: string; size: number; name: string }): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) return `«${file.name}» no es una imagen PNG, JPG o WebP válida.`;
  if (file.size === 0) return `«${file.name}» está vacía.`;
  if (file.size > MAX_IMAGE_BYTES) return `«${file.name}» supera el límite de 5 MB.`;
  return null;
}

/** Decodificación nativa con Canvas; reducción previa para acotar memoria y CPU. */
export async function imageFileToGrayscale(file: File): Promise<GrayscaleImage> {
  const error = validateImageUpload(file);
  if (error) throw new Error(error);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('No se pudo leer esta imagen. Prueba con otro PNG, JPG o WebP.'));
      image.src = url;
    });
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    if (!w || !h || w > 10000 || h > 10000) throw new Error('La imagen tiene dimensiones inválidas o demasiado grandes.');
    const factor = Math.min(1, 384 / Math.max(w, h));
    const width = Math.max(1, Math.round(w * factor));
    const height = Math.max(1, Math.round(h * factor));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Tu navegador no admite el procesamiento de imágenes con Canvas.');
    // Fondo blanco consistente para transparencias; evita interpretar el canal alfa como tinta negra.
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const pixels = new Uint8ClampedArray(width * height);
    for (let i = 0; i < pixels.length; i++) {
      const offset = i * 4;
      pixels[i] = Math.round(0.2126 * rgba[offset] + 0.7152 * rgba[offset + 1] + 0.0722 * rgba[offset + 2]);
    }
    return { width, height, pixels };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

/** Bilineal para conservar trazos al reducir una imagen original a una pequeña rejilla. */
function bilinear(values: Float32Array, width: number, height: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const first = values[y0 * width + x0] * (1 - fx) + values[y0 * width + x1] * fx;
  const second = values[y1 * width + x0] * (1 - fx) + values[y1 * width + x1] * fx;
  return first * (1 - fy) + second * fy;
}

/**
 * Infiere fondo a partir de los bordes, detecta la tinta, encuadra sin deformar y
 * remuestrea con antialiasing 6x6 hacia 8x8. No utiliza etiquetas ni un modelo.
 */
export function preprocessHandwrittenDigit(image: GrayscaleImage, options: DigitProcessingOptions): ProcessedDigit {
  const { width, height, pixels } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width * height !== pixels.length)
    throw new Error('La imagen no contiene píxeles válidos.');
  if (!Number.isFinite(options.threshold) || options.threshold < 0.05 || options.threshold > 0.45)
    throw new Error('La sensibilidad debe estar entre 5 % y 45 %.');
  if (!['auto', 'dark-on-light', 'light-on-dark'].includes(options.inkMode)) throw new Error('Modo de tinta no reconocido.');

  // El marco exterior aproxima el color del papel o del fondo de una imagen digital.
  const border = Math.max(1, Math.floor(Math.min(width, height) * 0.04));
  let borderTotal = 0;
  let borderCount = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x < border || y < border || x >= width - border || y >= height - border) {
      borderTotal += pixels[y * width + x];
      borderCount++;
    }
  }
  const background = borderTotal / borderCount;
  const inkMode: ResolvedInkMode = options.inkMode === 'auto'
    ? (background >= 127 ? 'dark-on-light' : 'light-on-dark')
    : options.inkMode;
  const threshold = options.threshold * 255;
  const contrast = new Float32Array(width * height);
  let maxContrast = 0;
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    const delta = inkMode === 'dark-on-light' ? background - pixels[i] : pixels[i] - background;
    if (delta <= threshold) continue;
    const strong = delta - threshold;
    contrast[i] = strong;
    maxContrast = Math.max(maxContrast, strong);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top || maxContrast <= 0) throw new Error('No se detectó un número. Prueba ajustando el contraste o el tipo de fondo.');

  // Mantener relación de aspecto y centrar el dibujo en ~6 de los 8 píxeles.
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const scale = Math.max(right - left + 1, bottom - top + 1) / 6.1;
  const supersampling = 6;
  const result: number[] = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    let total = 0;
    for (let subY = 0; subY < supersampling; subY++) for (let subX = 0; subX < supersampling; subX++) {
      const sx = centerX + (col + (subX + 0.5) / supersampling - 4) * scale;
      const sy = centerY + (row + (subY + 0.5) / supersampling - 4) * scale;
      total += bilinear(contrast, width, height, sx, sy);
    }
    result.push(Math.round(clamp(total / (supersampling ** 2) / maxContrast * 16, 0, 16) * 10) / 10);
  }
  if (Math.max(...result) <= 0) throw new Error('El trazo desapareció al reducirlo a 8×8. Usa un número más grueso.');
  return { pixels: result, inkMode, boundingBox: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } };
}

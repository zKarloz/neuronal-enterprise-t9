// Inferencia con fotografías del usuario: importación, normalización y predicción CNN real.
// El archivo original solo permanece en la memoria de esta pestaña; no se envía ni se persiste.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, FileImage, ImagePlus, LoaderCircle, RotateCcw, ScanLine, UploadCloud } from 'lucide-react';
import DigitPreview from '../../components/DigitPreview';
import { predictCnn } from '../../lib/cnn';
import {
  imageFileToGrayscale, preprocessHandwrittenDigit, validateImageUpload, MAX_IMAGE_COUNT,
  type GrayscaleImage, type InkMode,
} from '../../lib/image-preprocess';
import type { CNNNetwork } from '../../types/domain';
import { Notice, SectionTitle } from '../../components/ui';

type UserImage = { id: string; file: File; url: string };
type Result = { label: number; probabilities: number[] };

export default function ImportedDigitInference({ network }: { network: CNNNetwork }) {
  const [uploads, setUploads] = useState<UserImage[]>([]);
  const uploadsRef = useRef<UserImage[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [raster, setRaster] = useState<{ id: string; image: GrayscaleImage } | null>(null);
  const [reading, setReading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<InkMode>('auto');
  const [threshold, setThreshold] = useState(0.15);
  const [result, setResult] = useState<Result | null>(null);
  const [predicting, setPredicting] = useState(false);
  const predictionRequest = useRef(0); // Ignora resultados que llegan después de cambiar foto o ajuste.
  const [predictError, setPredictError] = useState('');
  const [dragging, setDragging] = useState(false);
  const selected = uploads.find(item => item.id === selectedId) ?? uploads[0];

  // Liberar todos los Blob URLs cuando se sustituye la selección o se desmonta la pantalla.
  useEffect(() => () => uploadsRef.current.forEach(item => URL.revokeObjectURL(item.url)), []);

  const importFiles = (files: File[]) => {
    if (!files.length) return;
    if (files.length > MAX_IMAGE_COUNT) {
      setLoadError(`Puedes seleccionar un máximo de ${MAX_IMAGE_COUNT} imágenes a la vez.`);
      return;
    }
    const issue = files.map(validateImageUpload).find(Boolean);
    if (issue) { setLoadError(issue); return; }
    const next = files.map((file, index) => ({
      id: `${Date.now()}-${index}`, file, url: URL.createObjectURL(file),
    }));
    uploadsRef.current.forEach(item => URL.revokeObjectURL(item.url));
    uploadsRef.current = next;
    setUploads(next);
    setSelectedId(next[0].id);
    setLoadError('');
    setMode('auto');
    setThreshold(0.15);
    setResult(null);
    setPredictError('');
  };

  // Cada fotografía se decodifica por separado; al cambiar rápidamente se ignoran cargas anteriores.
  useEffect(() => {
    let active = true;
    setRaster(null);
    setReading(!!selected);
    setLoadError('');
    if (!selected) return () => { active = false; };
    void imageFileToGrayscale(selected.file).then(decoded => {
      if (active) setRaster({ id: selected.id, image: decoded });
    }).catch(error => {
      if (active) setLoadError(error instanceof Error ? error.message : 'No se pudo leer la imagen.');
    }).finally(() => { if (active) setReading(false); });
    return () => { active = false; };
  }, [selected?.id]);

  const processed = useMemo(() => {
    if (!raster || raster.id !== selected?.id) return { digit: null, error: '' };
    try { return { digit: preprocessHandwrittenDigit(raster.image, { inkMode: mode, threshold }), error: '' }; }
    catch (error) { return { digit: null, error: error instanceof Error ? error.message : 'No se pudo normalizar esta imagen.' }; }
  }, [raster, selected?.id, mode, threshold]);

  // Una predicción anterior nunca debe mostrarse como resultado de otra imagen o ajuste.
  useEffect(() => {
    predictionRequest.current++;
    setResult(null);
    setPredicting(false);
    setPredictError('');
  }, [selected?.id, mode, threshold, network]);

  const predictUploadedImage = async () => {
    if (!processed.digit || predicting) return;
    const request = ++predictionRequest.current;
    setPredicting(true);
    setPredictError('');
    setResult(null);
    try {
      const answer = await predictCnn(network, processed.digit.pixels);
      if (predictionRequest.current === request) setResult(answer);
    } catch (error) {
      if (predictionRequest.current === request) setPredictError(error instanceof Error ? error.message : 'Error durante la inferencia CNN.');
    } finally {
      if (predictionRequest.current === request) setPredicting(false);
    }
  };

  return <section className="panel p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <SectionTitle title="Reconocer mis números escritos" subtitle="Importa fotografías o imágenes propias y pruébalas con los pesos ya entrenados"/>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"><CheckCircle2 size={14}/> Proceso local</span>
    </div>
    <div className="mb-5 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-950">
      <strong>Consejo para mejores resultados:</strong> escribe un solo dígito grande y centrado por imagen, con marcador negro sobre papel blanco, buena iluminación y sin otras letras. El modelo se entrenó con dígitos de 8×8; una foto diferente al dataset puede dar predicciones incorrectas.
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)]">
      <div className="space-y-4">
        <div className={`rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${dragging ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-slate-50/70'}`}
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={event => { event.preventDefault(); setDragging(false); }}
          onDrop={event => { event.preventDefault(); setDragging(false); importFiles(Array.from(event.dataTransfer.files)); }}>
          <UploadCloud className="mx-auto mb-2 text-primary-600" size={31}/>
          <p className="text-sm font-semibold text-ink">Arrastra aquí tus fotos de números</p>
          <p className="mt-1 text-xs text-slate-500">PNG, JPG o WebP · hasta {MAX_IMAGE_COUNT} imágenes · máximo 5 MB cada una</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <label htmlFor="cnn-import-files" className="btn-primary cursor-pointer"><ImagePlus size={16}/> Importar imágenes</label>
            <input id="cnn-import-files" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple
              onChange={event => { importFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }}/>
            <label htmlFor="cnn-take-photo" className="btn-outline cursor-pointer"><Camera size={16}/> Tomar foto</label>
            <input id="cnn-take-photo" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" capture="environment"
              onChange={event => { importFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }}/>
          </div>
        </div>
        {uploads.length > 0 && <div><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><label className="field-label mb-0">Imágenes seleccionadas ({uploads.length})</label><button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-700" onClick={() => {
          uploadsRef.current.forEach(item => URL.revokeObjectURL(item.url)); uploadsRef.current = []; setUploads([]); setSelectedId(''); setRaster(null); setResult(null); setLoadError('');
        }}><RotateCcw size={13}/> Quitar imágenes</button></div>
          <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Elegir imagen para predecir">{uploads.map((item, index) => <button type="button" key={item.id} aria-pressed={selected?.id === item.id} title={item.file.name} onClick={() => { setSelectedId(item.id); setResult(null); }} className={`w-[84px] shrink-0 overflow-hidden rounded-xl border-2 bg-white p-1 text-left transition-colors ${selected?.id === item.id ? 'border-primary-500' : 'border-slate-200 hover:border-primary-300'}`}>
            <img src={item.url} alt={`Imagen importada ${index + 1}`} className="h-16 w-full rounded-lg bg-slate-100 object-contain"/>
            <span className="block truncate px-1 pt-1 text-[10px] text-slate-600">{index + 1}. {item.file.name}</span>
          </button>)}</div>
        </div>}
        {loadError && <Notice tone="error">{loadError}</Notice>}
        {selected && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600"><FileImage size={15}/> Imagen original</div>
          <div className="flex min-h-[180px] items-center justify-center rounded-xl bg-slate-50 p-3"><img className="max-h-[270px] max-w-full rounded-lg object-contain" src={selected.url} alt={`Fotografía original: ${selected.file.name}`}/></div>
          <p className="mt-2 break-all text-xs text-slate-500">{selected.file.name} · {(selected.file.size / 1024).toFixed(1)} KB</p>
        </div>}
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold text-ink"><ScanLine size={18} className="text-primary-600"/> Ajustar imagen antes de predecir</div>
          <label className="field-label" htmlFor="cnn-ink-mode">Tipo de fondo</label>
          <select id="cnn-ink-mode" className="field" value={mode} onChange={event => setMode(event.target.value as InkMode)} disabled={!selected}>
            <option value="auto">Automático (recomendado)</option><option value="dark-on-light">Tinta oscura, fondo claro</option><option value="light-on-dark">Tinta clara, fondo oscuro</option>
          </select>
          <div className="mt-4 flex items-center justify-between gap-2"><label htmlFor="cnn-threshold" className="field-label mb-0">Umbral para detectar trazos</label><span className="text-xs font-semibold text-primary-700">{Math.round(threshold * 100)} %</span></div>
          <input id="cnn-threshold" disabled={!selected} type="range" min="0.05" max="0.45" step="0.05" value={threshold} onChange={event => setThreshold(Number(event.target.value))} className="mt-2 w-full accent-[#526fea]"/>
          <p className="mt-1 text-xs leading-5 text-slate-500">Si el número desaparece, reduce el umbral; si se ven sombras o manchas, auméntalo.</p>
          <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-slate-950 px-4 py-5">
            {processed.digit ? <DigitPreview pixels={processed.digit.pixels} size={144}/> : <div className="grid h-36 w-36 place-items-center rounded-lg border border-slate-700 text-center text-xs text-slate-400">{reading ? 'Procesando fotografía…' : 'Importa una imagen para ver sus 64 píxeles'}</div>}
            <span className="text-xs font-semibold text-slate-200">Entrada normalizada · 8 × 8</span>
          </div>
          {processed.digit && <p className="mt-2 text-center text-xs text-slate-500">Fondo detectado: {processed.digit.inkMode === 'dark-on-light' ? 'claro / tinta oscura' : 'oscuro / tinta clara'} · 64 intensidades de 0 a 16</p>}
          {processed.error && <div className="mt-3"><Notice tone="warning">{processed.error}</Notice></div>}
          <button type="button" onClick={() => void predictUploadedImage()} disabled={!processed.digit || reading || predicting} className="btn-primary mt-4 w-full">
            {predicting ? <LoaderCircle size={16} className="animate-spin"/> : <ScanLine size={16}/>}
            {predicting ? 'Analizando imagen…' : 'Predecir número con mi CNN'}
          </button>
        </div>
      </div>
    </div>
    {predictError && <div className="mt-4"><Notice tone="error">{predictError}</Notice></div>}
    {result && <div className="mt-5 rounded-2xl border border-primary-200 bg-primary-50/60 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3"><div className="grid h-16 w-16 place-items-center rounded-xl bg-white text-4xl font-bold text-primary-700 shadow-sm">{result.label}</div><div><p className="text-sm font-semibold text-ink">Número predicho por la CNN</p><p className="mt-1 text-xs text-slate-600">Puntuación Softmax de esa clase: {(Math.max(...result.probabilities) * 100).toFixed(1)} %</p><p className="mt-1 text-xs text-slate-500">La foto no tiene etiqueta verificada; esta puntuación no mide exactitud.</p></div></div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{result.probabilities.map((p, label) => <div className="rounded-lg border border-primary-100 bg-white p-2.5" key={label}>
        <div className="mb-1.5 flex items-center justify-between gap-1 text-[11px] font-semibold"><span>{label}</span><span>{(p * 100).toFixed(1)} %</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.max(0, Math.min(100, p * 100))}%` }}/></div>
      </div>)}</div>
    </div>}
    <p className="mt-4 text-xs leading-5 text-slate-500">Privacidad: las fotografías se procesan en el navegador; no se guardan junto al modelo, no se añaden al dataset de entrenamiento y no se envían a un servidor. Esta función es para probar predicciones, no para reentrenar la CNN.</p>
  </section>;
}

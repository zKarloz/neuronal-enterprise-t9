// Inspección y predicción desde pesos CNN persistidos sin reinstanciar el entrenamiento.
import { useState } from 'react';
import { BrainCircuit, Download, FlaskConical, LoaderCircle } from 'lucide-react';
import { exportJSON } from '../../lib/storage';
import { predictCnn } from '../../lib/cnn';
import { isDigitsDataset } from '../../lib/digits';
import DigitPreview from '../../components/DigitPreview';
import ImportedDigitInference from './ImportedDigitInference';
import { Notice, SectionTitle, formatMetric } from '../../components/ui';
import type { CNNNetwork, Dataset, ModelVersion, TrainingRun } from '../../types/domain';

export default function CnnModelDetail({ model, network, dataset, run }: {
  model: ModelVersion; network: CNNNetwork; dataset?: Dataset; run?: TrainingRun;
}) {
  const [selected, setSelected] = useState(0);
  const [answer, setAnswer] = useState<{ label: number; probabilities: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const compatible = isDigitsDataset(dataset);
  const sample = compatible ? dataset.rows[selected] : null;
  const predictSample = async () => {
    if (!sample) return;
    setBusy(true); setAnswer(null); setError('');
    try { setAnswer(await predictCnn(network, sample.slice(0, 64))); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo recuperar la CNN.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <section className="panel p-5"><div className="flex flex-wrap items-start justify-between gap-3"><SectionTitle title={`Modelo CNN v${model.version}.0 · ${model.name}`} subtitle="Pesos reales de Conv2D y Dense almacenados localmente"/><button className="btn-outline" onClick={() => exportJSON(`cnn-v${model.version}-${model.id.slice(0, 8)}.json`, model)}><Download size={16}/> Exportar pesos JSON</button></div>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Filtros 3×3</div><div className="mt-1 text-2xl font-bold text-ink">{network.filters}</div></div><div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Parámetros entrenados</div><div className="mt-1 text-2xl font-bold text-ink">{network.weights.reduce((n, w) => n + w.values.length, 0).toLocaleString('es-PE')}</div></div><div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Clases</div><div className="mt-1 text-2xl font-bold text-ink">0–9</div></div></div>
      {run?.test && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><strong>Prueba no vista:</strong> {(run.test.accuracy * 100).toFixed(1)} % de exactitud en {run.test.samples} imágenes · Pérdida {formatMetric(run.test.loss)}.</div>}
    </section>
    <section className="panel p-5"><SectionTitle title="Inferencia con imágenes reales" subtitle="Selecciona una imagen del dataset y predice con los pesos guardados"/>
      {!compatible ? <Notice tone="warning">El dataset original ya no está disponible en el proyecto. Para probar muestras etiquetadas, importa un dataset de dígitos 8×8. Las fotografías propias se pueden analizar abajo sin necesitar ese dataset.</Notice> : <>
        <div className="mb-4 flex flex-wrap items-end gap-4"><div className="grow"><label htmlFor="cnn-sample" className="field-label">Imagen del dataset (índice 1–{dataset.rows.length})</label><input id="cnn-sample" className="field" type="number" min="1" max={dataset.rows.length} value={selected + 1} onChange={e => { setSelected(Math.min(dataset.rows.length - 1, Math.max(0, Number(e.target.value) - 1 || 0))); setAnswer(null); }}/></div><DigitPreview pixels={sample!.slice(0, 64)} label={sample![64]} size={100}/><button disabled={busy} className="btn-primary" onClick={() => void predictSample()}>{busy ? <LoaderCircle size={16} className="animate-spin"/> : <FlaskConical size={16}/>} {busy ? 'Calculando...' : 'Predecir dígito'}</button></div>
        {error && <Notice tone="error">{error}</Notice>}
        {answer && <><div className="rounded-xl border border-primary-200 bg-primary-50 p-4"><div className="flex items-center gap-3"><BrainCircuit className="text-primary-700"/><div><p className="text-sm font-semibold text-ink">Predicción: {answer.label}</p><p className="text-xs text-slate-600">Etiqueta real: {sample![64]} · Confianza de clase predicha: {(Math.max(...answer.probabilities) * 100).toFixed(1)} %</p></div></div></div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{answer.probabilities.map((value, label) => <div key={label} className="rounded-lg bg-slate-50 p-3"><div className="mb-2 flex items-center justify-between text-xs font-semibold"><span>Dígito {label}</span><span>{(value * 100).toFixed(1)} %</span></div><div className="h-1.5 overflow-hidden rounded bg-slate-200"><div className="h-full rounded bg-primary-500" style={{ width: `${value * 100}%` }}/></div></div>)}</div>
        </>}
      </>}
    </section>
    <ImportedDigitInference network={network}/>
  </div>;
}

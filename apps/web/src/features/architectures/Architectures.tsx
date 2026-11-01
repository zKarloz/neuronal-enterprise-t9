// M04 — Biblioteca local y constructor interactivo de arquitecturas Feedforward.
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Boxes, Check, CheckCircle2, CirclePlus, CopyPlus, FilePlus2, Info, Layers3, ListTree, Network, Save, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { parameterCount } from '../../lib/neural';
import { EmptyState, Heading, Notice, SectionTitle, formatDate } from '../../components/ui';
import type { Activation, Architecture, Family, HiddenLayer, CnnConfig } from '../../types/domain';
import type { Page } from '../../app/App';
import ArchitectureGraph from './ArchitectureGraph';
import CNNArchitectureDiagram from './CNNArchitectureDiagram';
import { validateArchitectureDraft } from './validation';

type Selected = 'input' | 'output' | string;
const families: { key: Family; title: string; description: string }[] = [
  { key: 'feedforward', title: 'Feedforward', description: 'Capas densas y propagación hacia delante' },
  { key: 'rnn', title: 'RNN', description: 'Series y secuencias · editor pendiente' },
  { key: 'cnn', title: 'CNN', description: 'Convolución sobre imágenes · entrenamiento real en navegador' },
  { key: 'gan', title: 'GAN', description: 'Modelos generativos · editor pendiente' },
];
const initialLayer = (): HiddenLayer => ({ id: crypto.randomUUID(), units: 8, activation: 'relu' });

export default function Architectures({ navigate }: { navigate: (page: Page) => void }) {
  const { data, activeProject, activeArchitecture, saveArchitecture, selectArchitecture, removeArchitecture } = useWorkspace();
  // El identificador nulo representa una nueva configuración, no un registro de demostración.
  const [editingId, setEditingId] = useState<string | null>(activeArchitecture?.id ?? null);
  const [family, setFamily] = useState<Family>(activeArchitecture?.family ?? 'feedforward');
  const [name, setName] = useState(activeArchitecture?.name ?? 'Nueva arquitectura');
  const [cnn, setCnn] = useState<CnnConfig>(activeArchitecture?.cnn ?? { filters: 8, denseUnits: 32 });
  const [layers, setLayers] = useState<HiddenLayer[]>(activeArchitecture?.hiddenLayers.map(layer => ({ ...layer })) ?? [initialLayer()]);
  const [selected, setSelected] = useState<Selected>(activeArchitecture?.hiddenLayers[0]?.id ?? 'input');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  // El cambio de proyecto remonta este componente desde App; al borrar una configuración
  // en este módulo sí necesitamos sincronizar la selección y el formulario actual.
  const projectArchitectures = data.architectures.filter(arch => arch.projectId === activeProject?.id);
  const activeRecord = projectArchitectures.find(arch => arch.id === editingId);
  const dataset = data.datasets.find(d => d.projectId === activeProject?.id);
  const inputCount = Math.max(1, (dataset?.headers.length ?? 2) - 1);
  const selectedIndex = layers.findIndex(layer => layer.id === selected);
  const selectedLayer = layers[selectedIndex];
  const validation = validateArchitectureDraft(family, name, layers, cnn);
  const count = layers.reduce((sum, layer) => sum + (Number.isFinite(layer.units) ? layer.units : 0), 0);
  const parameters = !!dataset && family === 'feedforward' && layers.every(layer => Number.isInteger(layer.units) && layer.units > 0 && layer.units <= 64)
    ? parameterCount({ id: '', projectId: '', family, name, hiddenLayers: layers, updatedAt: '' }, inputCount)
    : null;

  useEffect(() => {
    if (editingId && !projectArchitectures.some(arch => arch.id === editingId)) {
      setEditingId(null);
      setDirty(true);
      setMessage('La arquitectura dejó de estar guardada. Puedes conservar el borrador como nueva.');
    }
  // Solo detecta la eliminación externa de la arquitectura que se está editando.
  }, [editingId, data.architectures]);

  if (!activeProject) return <><Heading eyebrow="Diseño · M04" title="Diseñador de arquitecturas"/><div className="panel"><EmptyState icon={<Network size={27}/>} title="Selecciona un proyecto" description="Necesitas un proyecto para diseñar y guardar arquitecturas neuronales." action={<button className="btn-primary" onClick={() => navigate('projects')}>Abrir proyectos</button>}/></div></>;

  const markDirty = () => { setDirty(true); setMessage(''); setError(''); };
  const load = (arch: Architecture) => {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos y cargar otra arquitectura?')) return;
    setEditingId(arch.id);
    setFamily(arch.family);
    setCnn(arch.cnn ?? { filters: 8, denseUnits: 32 });
    setName(arch.name);
    setLayers(arch.hiddenLayers.map(layer => ({ ...layer })));
    setSelected(arch.hiddenLayers[0]?.id ?? 'input');
    setDirty(false);
    setError('');
    setMessage('');
    selectArchitecture(activeProject.id, arch.id);
  };
  const createDraft = (duplicate = false) => {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos y comenzar otra arquitectura?')) return;
    setEditingId(null);
    setName(duplicate ? `${name.trim() || 'Arquitectura'} - copia` : 'Nueva arquitectura');
    setFamily(duplicate ? family : 'feedforward');
    setCnn(duplicate ? { ...cnn } : { filters: 8, denseUnits: 32 });
    const nextLayers = duplicate ? layers.map(layer => ({ ...layer, id: crypto.randomUUID() })) : [initialLayer()];
    setLayers(nextLayers);
    setSelected(nextLayers[0]?.id ?? 'input');
    setDirty(true);
    setError('');
    setMessage('');
  };
  const changeLayer = (id: string, patch: Partial<HiddenLayer>) => {
    setLayers(old => old.map(layer => layer.id === id ? { ...layer, ...patch } : layer));
    markDirty();
  };
  const addLayer = () => {
    if (layers.length >= 4) return;
    const layer = initialLayer();
    setLayers(old => [...old, layer]);
    setSelected(layer.id);
    markDirty();
  };
  const removeLayer = (id: string) => {
    if (layers.length <= 1) return;
    const next = layers.filter(layer => layer.id !== id);
    setLayers(next);
    setSelected(next[0].id);
    markDirty();
  };
  const moveLayer = (index: number, delta: number) => {
    const target = index + delta;
    if (index < 0 || target < 0 || target >= layers.length) return;
    setLayers(old => {
      const next = [...old];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    markDirty();
  };
  const save = (asNew = false) => {
    try {
      const id = saveArchitecture(activeProject.id, family, name, layers, asNew ? undefined : (editingId ?? undefined), family === 'cnn' ? cnn : undefined);
      setEditingId(id);
      setDirty(false);
      setError('');
      setMessage(asNew ? 'Nueva arquitectura guardada y seleccionada para entrenamiento.' : 'Arquitectura guardada y seleccionada para entrenamiento.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible guardar la arquitectura.');
    }
  };
  const remove = (arch: Architecture) => {
    if (!window.confirm(`¿Eliminar la arquitectura «${arch.name}»? Los modelos y resultados previamente entrenados se conservarán.`)) return;
    try {
      removeArchitecture(activeProject.id, arch.id);
      if (arch.id === editingId) {
        setEditingId(null);
        setDirty(true);
        setMessage('Arquitectura eliminada. El editor conserva una copia sin guardar.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo eliminar.');
    }
  };

  return <>
    <Heading eyebrow={`Laboratorio · M04 · ${activeProject.name}`} title="Diseñador de arquitecturas" description="Diseña y guarda Feedforward o CNN reales. La CNN reconoce dígitos manuscritos 8×8 y se entrena con TensorFlow.js en el navegador." action={<button className="btn-primary" onClick={() => save()} disabled={!!validation}><Save size={17}/> {editingId ? 'Guardar cambios' : 'Guardar arquitectura'}</button>}/>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {families.map(item => <button key={item.key} type="button" onClick={() => { if (family !== item.key) { setFamily(item.key); markDirty(); } }} aria-pressed={family === item.key} className={`rounded-2xl border px-4 py-3 text-left transition-colors ${family === item.key ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-100' : 'border-slate-200 bg-white hover:border-primary-200'}`}><div className="flex items-center justify-between"><span className="text-sm font-bold text-ink">{item.title}</span>{family === item.key && <CheckCircle2 className="text-primary-600" size={18}/>}</div><p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p></button>)}
    </div>
    {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
    {message && <div className="mb-4"><Notice tone="success">{message}</Notice></div>}
    {dirty && <div className="mb-4"><Notice tone="warning">Hay cambios sin guardar. Seleccionar otra arquitectura puede descartar el borrador.</Notice></div>}
    {validation && <div className="mb-4"><Notice tone="error">{validation}</Notice></div>}
    <div className="grid items-start gap-4 2xl:grid-cols-[270px_minmax(0,1fr)_270px] xl:grid-cols-[270px_minmax(0,1fr)]">
      <section className="panel min-w-0 p-4">
        <SectionTitle title="Mis arquitecturas" subtitle="Configuraciones del proyecto"/>
        <button type="button" className="btn-outline mb-3 w-full" onClick={() => createDraft()}><FilePlus2 size={17}/> Nueva arquitectura</button>
        {projectArchitectures.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">Todavía no hay arquitecturas guardadas para este proyecto.</p> : <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
          {projectArchitectures.map(arch => <div key={arch.id} className={`flex items-start gap-1 rounded-xl border p-2 ${editingId === arch.id ? 'border-primary-300 bg-primary-50' : 'border-slate-200 bg-white'}`}><button className="min-w-0 flex-1 rounded-lg p-1.5 text-left hover:bg-white/80" onClick={() => load(arch)}><span className="flex items-center gap-1.5 truncate text-xs font-bold text-ink">{activeArchitecture?.id === arch.id && <Check size={13} className="shrink-0 text-primary-600"/>}{arch.name}</span><span className="mt-1 block text-[11px] text-slate-500">{arch.family.toUpperCase()} · {formatDate(arch.updatedAt)}</span></button><button aria-label={`Eliminar ${arch.name}`} title="Eliminar configuración" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => remove(arch)}><Trash2 size={15}/></button></div>)}
        </div>}
        <div className="my-4 border-t border-slate-100"/>
        <label htmlFor="arch-name" className="field-label">Nombre de arquitectura</label>
        <input id="arch-name" className="field" maxLength={80} value={name} onChange={e => { setName(e.target.value); markDirty(); }}/>
        <div className="mt-4 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-ink">Capas ocultas</h3><span className="text-xs text-slate-400">{family === 'feedforward' ? `${layers.length}/4` : 'No aplicable'}</span></div>
        {family === 'feedforward' ? <>
          <div className="mt-3 space-y-2">{layers.map((layer, i) => <button key={layer.id} onClick={() => setSelected(layer.id)} aria-pressed={selected === layer.id} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${selected === layer.id ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-primary-200 hover:bg-slate-50'}`}><span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-primary-600"><Layers3 size={17}/></span><span className="min-w-0 flex-1"><strong className="block text-xs text-ink">Capa {i + 1}</strong><span className="text-[11px] text-slate-500">{layer.units || '—'} unidades · {layer.activation}</span></span></button>)}</div>
          <button className="btn-soft mt-3 w-full" onClick={addLayer} disabled={layers.length >= 4}><CirclePlus size={16}/> Añadir capa</button>
        </> : <div className="mt-3">{family === 'cnn' ? <Notice tone="info">CNN de reconocimiento de dígitos 8×8. Ajusta filtros y neuronas densas desde el inspector de propiedades.</Notice> : <Notice tone="warning">{family.toUpperCase()} sigue en modo documental; no tiene motor local disponible.</Notice>}</div>}
        <button className="btn-outline mt-4 w-full" onClick={() => createDraft(true)}><CopyPlus size={16}/> Duplicar como nueva</button>
      </section>

      <div className="min-w-0 space-y-4">
        <section className="panel p-4 sm:p-5"><SectionTitle title="Lienzo de la red" subtitle={family === 'cnn' ? 'Flujo de operaciones y dimensiones de la CNN' : 'Selecciona las columnas de neuronas con el ratón o el teclado'}/>
          {family === 'feedforward' ? <div className="overflow-x-auto rounded-2xl border border-slate-100"><ArchitectureGraph inputs={inputCount} layers={layers} selected={selected} onSelect={setSelected}/></div> : family === 'cnn' ? <CNNArchitectureDiagram cnn={cnn}/> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center"><div><Network size={33} className="mx-auto mb-3 text-slate-400"/><p className="text-sm font-semibold text-slate-700">{family.toUpperCase()} · sin lienzo especializado</p><p className="mt-2 text-xs text-slate-500">No se representan capas ficticias ni conexiones no compatibles.</p></div></div>}
          <div className="mt-4 flex flex-wrap gap-2">{(family === 'cnn' ? ['64 píxeles de entrada', 'Conv2D + MaxPool2D', '10 clases de salida'] : [dataset ? `${inputCount} entradas del CSV` : 'Entradas provisionales', `${family === 'feedforward' ? layers.length : 0} capas ocultas`, '1 neurona de salida']).map(label => <span key={label} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600">{label}</span>)}</div>
        </section>
        {family === 'feedforward' && <div className="grid gap-3 sm:grid-cols-3"><div className="panel p-4"><div className="text-xs text-slate-500">Capas ocultas</div><div className="mt-1 text-2xl font-bold text-ink">{layers.length}</div></div><div className="panel p-4"><div className="text-xs text-slate-500">Neuronas ocultas</div><div className="mt-1 text-2xl font-bold text-ink">{count}</div></div><div className="panel p-4"><div className="text-xs text-slate-500">Parámetros entrenables</div><div className="mt-1 text-2xl font-bold text-ink">{parameters === null ? '—' : parameters.toLocaleString('es-PE')}</div></div></div>}
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600"><Info size={17} className="mt-0.5 shrink-0 text-primary-600"/><p>{family === 'cnn' ? 'Esta CNN consume 64 píxeles por imagen de 8×8 y produce probabilidades para diez clases. El dataset debe tener etiqueta label y valores pixel_0…pixel_63.' : <>{dataset ? `El número de entradas se calcula usando ${dataset.headers.length - 1} columnas predictoras del CSV «${dataset.name}».` : 'Importa un CSV para calcular el tamaño real de la capa de entrada. Hasta entonces, el lienzo usa una entrada provisional.'} La salida es de una neurona; su activación depende de la tarea elegida durante el entrenamiento.</>}</p></div>
        <button className="btn-soft w-full" onClick={() => navigate(dataset ? 'training' : 'datasets')}><Boxes size={17}/> {dataset ? 'Continuar al entrenamiento' : 'Continuar: importar un CSV'}</button>
      </div>

      <section className="panel min-w-0 p-4 sm:p-5 xl:col-span-2 2xl:col-span-1"><SectionTitle title="Inspector de propiedades" subtitle={family === 'feedforward' ? 'Edita el elemento seleccionado' : 'Familia de red'}/>
        {family === 'cnn' ? <div className="space-y-5"><Notice tone="info">CNN entrenable con TensorFlow.js y dataset de dígitos de 8×8. La secuencia de operaciones es fija para reproducibilidad.</Notice><div><label className="field-label" htmlFor="cnn-filters">Filtros de convolución (3×3)</label><select id="cnn-filters" className="field" value={cnn.filters} onChange={e => { setCnn(old => ({ ...old, filters: Number(e.target.value) })); markDirty(); }}>{[8, 16, 32].map(n => <option key={n} value={n}>{n} filtros</option>)}</select></div><div><label className="field-label" htmlFor="cnn-dense">Neuronas densas</label><select id="cnn-dense" className="field" value={cnn.denseUnits} onChange={e => { setCnn(old => ({ ...old, denseUnits: Number(e.target.value) })); markDirty(); }}>{[16, 32, 64].map(n => <option key={n} value={n}>{n} neuronas</option>)}</select></div><p className="text-xs leading-5 text-slate-500">Conv2D (ReLU) → MaxPool2D → Flatten → Dense (ReLU) → Softmax. Se usa optimizador Adam durante el entrenamiento.</p></div> : family !== 'feedforward' ? <Notice tone="warning">{family.toUpperCase()} permanece documental.</Notice> : selectedLayer ? <>
          <div className="mb-5 flex items-center justify-between"><div><div className="text-xs font-semibold text-primary-600">Capa seleccionada</div><div className="mt-1 text-lg font-bold text-ink">Oculta {selectedIndex + 1}</div></div><Layers3 size={23} className="text-primary-600"/></div>
          <label className="field-label" htmlFor={`units-${selectedLayer.id}`}>Neuronas (1–64)</label>
          <input id={`units-${selectedLayer.id}`} type="number" min={1} max={64} step={1} className="field mb-4" value={selectedLayer.units} onChange={e => changeLayer(selectedLayer.id, { units: Number(e.target.value) })}/>
          <label className="field-label" htmlFor={`activation-${selectedLayer.id}`}>Función de activación</label>
          <select id={`activation-${selectedLayer.id}`} className="field" value={selectedLayer.activation} onChange={e => changeLayer(selectedLayer.id, { activation: e.target.value as Activation })}><option value="relu">ReLU</option><option value="tanh">tanh</option><option value="sigmoid">Sigmoide</option></select>
          <div className="mt-5 border-t border-slate-100 pt-4"><div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Organización</div><div className="flex gap-2"><button className="btn-outline flex-1 px-2" disabled={selectedIndex === 0} onClick={() => moveLayer(selectedIndex, -1)}><ArrowUp size={15}/> Subir</button><button className="btn-outline flex-1 px-2" disabled={selectedIndex === layers.length - 1} onClick={() => moveLayer(selectedIndex, 1)}><ArrowDown size={15}/> Bajar</button></div><button className="btn-danger mt-3 w-full" disabled={layers.length <= 1} onClick={() => removeLayer(selectedLayer.id)}><Trash2 size={16}/> Eliminar capa</button></div>
        </> : <div className="rounded-xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm font-bold text-ink"><ListTree size={17} className="text-primary-600"/>{selected === 'input' ? 'Capa de entrada' : 'Capa de salida'}</div><p className="mt-2 text-xs leading-5 text-slate-500">{selected === 'input' ? 'La dimensión de entrada se obtiene automáticamente del dataset, excluyendo la columna objetivo.' : 'Una unidad de salida: sigmoide para clasificación binaria y lineal para regresión. Se define durante el entrenamiento.'}</p></div>}
        {editingId && activeRecord && <p className="mt-5 text-xs text-slate-400">Guardada: {formatDate(activeRecord.updatedAt)}</p>}
        <button className="btn-primary mt-5 w-full" onClick={() => save()} disabled={!!validation}><Save size={16}/> {editingId ? 'Guardar cambios' : 'Guardar arquitectura'}</button>
        {editingId && <button className="btn-outline mt-2 w-full" onClick={() => save(true)} disabled={!!validation}><CopyPlus size={16}/> Guardar como nueva</button>}
      </section>
    </div>
  </>;
}

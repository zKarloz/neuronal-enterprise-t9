// M05: punto de entrada único para CSV tabulares y dígitos CNN en el navegador.
import { useRef, useState } from 'react';
import { CheckCircle2, Database, Download, FileSpreadsheet, FileUp, Image, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { datasetSummary } from '../../lib/csv';
import { isDigitsDataset, MAX_DIGITS_CSV_BYTES } from '../../lib/digits';
import { parseLocalCsv, type LocalCsvImport } from '../../lib/dataset-import';
import DigitPreview from '../../components/DigitPreview';
import { download } from '../../lib/storage';
import { EmptyState, Heading, Modal, Notice, SectionTitle, formatDate } from '../../components/ui';
import type { Page } from '../../app/App';

type Candidate = LocalCsvImport & { name: string };

function LocalDatasets({ navigate }: { navigate: (page: Page) => void }) {
  const { activeProject, data, importDataset, removeDataset, isTraining } = useWorkspace();
  const [importOpen, setImportOpen] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!activeProject) return <>
    <Heading title="Datasets"/>
    <div className="panel"><EmptyState icon={<Database size={27}/>} title="Selecciona un proyecto"
      description="Para importar archivos CSV, elige antes un proyecto de IA."
      action={<button className="btn-primary" onClick={() => navigate('projects')}>Abrir proyectos</button>}/></div>
  </>;

  const current = data.datasets.find(dataset => dataset.projectId === activeProject.id);
  const digitMode = isDigitsDataset(current);

  const closeModal = () => { setImportOpen(false); setCandidate(null); setError(''); };
  const showModal = () => { setCandidate(null); setError(''); setImportOpen(true); };
  const openPicker = () => {
    // Permite elegir dos veces el mismo archivo aunque el intento anterior haya fallado.
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.click(); }
  };

  const chooseFile = async (file?: File) => {
    setCandidate(null); setError('');
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { setError('Solo se admiten archivos con extensión .csv.'); return; }
    if (file.size > MAX_DIGITS_CSV_BYTES) { setError('El CSV supera el máximo de 1,5 MB para imágenes de dígitos.'); return; }
    try {
      // El tipo se detecta con el encabezado; no se aplica la validación CNN a CSV tabulares.
      const parsed = parseLocalCsv(await file.text(), file.size);
      setCandidate({ ...parsed, name: file.name });
      setTarget(parsed.kind === 'digits8x8' ? 'label' : parsed.headers.at(-1)!);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo validar el CSV.'); }
  };

  const chooseBundledDigits = async () => {
    setBusy(true); setCandidate(null); setError('');
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}datasets/digits-8x8.csv`);
      if (!response.ok) throw new Error('No se pudo leer el archivo de dígitos incluido.');
      const source = await response.text();
      const parsed = parseLocalCsv(source, new TextEncoder().encode(source).byteLength);
      if (parsed.kind !== 'digits8x8') throw new Error('El dataset incluido no tiene el formato de dígitos esperado.');
      setCandidate({ ...parsed, name: 'digits-8x8.csv' });
      setTarget('label');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo leer el dataset incluido.'); }
    finally { setBusy(false); }
  };

  const save = () => {
    if (!candidate || isTraining) return;
    try {
      importDataset(activeProject.id, candidate.name, candidate.headers, candidate.rows,
        candidate.kind === 'digits8x8' ? 'label' : target, candidate.kind);
      closeModal();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el dataset.'); }
  };

  const exportCsv = () => {
    if (!current) return;
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const contents = [current.headers.map(escape).join(','), ...current.rows.map(row => row.join(','))].join('\r\n');
    download(current.name, contents, 'text/csv');
  };
  const remove = () => {
    if (!current || isTraining || !window.confirm(`¿Eliminar el dataset ${current.name}? Los modelos previamente entrenados se conservarán.`)) return;
    try { removeDataset(current.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo eliminar el dataset.'); }
  };

  return <>
    <Heading title="Datasets" description="Importa datos numéricos para Feedforward o dígitos 8×8 para CNN. El procesamiento y el entrenamiento se realizan en tu dispositivo."
      action={<button type="button" className="btn-primary" disabled={isTraining} onClick={showModal}>
        <FileUp size={17}/> Importar dataset
      </button>}/>
    {error && !importOpen && <Notice tone="error">{error}</Notice>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="panel p-5">
        <SectionTitle title="Dataset del proyecto" subtitle="Solo hay un dataset activo por proyecto"/>
        {!current ? <EmptyState compact icon={<Database size={26}/>} title="Sin dataset importado"
          description="Pulsa Importar dataset para seleccionar un CSV tabular o los dígitos incluidos."
          action={<button type="button" className="btn-outline" onClick={showModal}>Seleccionar datos</button>}/> : <>
          <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="flex min-w-0 items-start gap-3"><FileSpreadsheet className="shrink-0 text-emerald-600" size={22}/>
              <div className="min-w-0"><strong className="block truncate text-sm text-ink">{current.name}</strong>
                <p className="mt-1 text-xs text-slate-500">{digitMode ? `${current.rows.length} imágenes de 8×8 · 10 clases posibles` : datasetSummary(current.headers, current.rows, current.target)}</p>
                <p className="mt-1 text-xs text-slate-400">Importado: {formatDate(current.createdAt)}</p>
              </div>
            </div><CheckCircle2 size={18} className="shrink-0 text-emerald-600"/>
          </div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Primeros registros (datos reales)</div>
          {digitMode ? <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 p-4">
            {current.rows.slice(0, 8).map((row, i) => <DigitPreview key={i} pixels={row.slice(0, 64)} label={row[64]} size={72}/>)}</div>
            : <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-right text-xs">
              <thead className="bg-slate-50"><tr>{current.headers.map(header => <th key={header} className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{header}{header === current.target && <span className="ml-1 text-primary-600">●</span>}</th>)}</tr></thead>
              <tbody>{current.rows.slice(0, 6).map((row, i) => <tr key={i} className="border-t border-slate-100">{row.map((value, j) => <td key={j} className="px-3 py-2.5 font-mono text-slate-600">{value}</td>)}</tr>)}</tbody>
            </table></div>}
          <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={exportCsv} className="btn-outline"><Download size={16}/> Exportar CSV</button>
            <button type="button" disabled={isTraining} onClick={remove} className="btn-danger"><Trash2 size={16}/> Eliminar</button></div>
        </>}
      </section>
      <aside className="panel p-5">
        <SectionTitle title="Formatos compatibles" subtitle="El sistema reconoce automáticamente el CSV"/>
        <div className="space-y-4 text-sm text-slate-600">
          <div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 shrink-0 text-primary-600" size={18}/><div><strong className="text-ink">Feedforward</strong><p className="mt-1 text-xs leading-5">CSV numérico: 2–16 columnas, hasta 2.000 filas y 900 KB. Permite clasificación binaria y regresión.</p></div></div>
          <div className="flex items-start gap-3"><Image className="mt-0.5 shrink-0 text-primary-600" size={18}/><div><strong className="text-ink">CNN</strong><p className="mt-1 text-xs leading-5">64 columnas pixel_0…pixel_63 y label, con dígitos de 8×8.</p></div></div>
          <p className="text-xs leading-5 text-slate-500">Importar un archivo nuevo reemplaza el dataset activo del proyecto, pero conserva los modelos ya entrenados.</p>
        </div>
      </aside>
    </div>

    {importOpen && <Modal title="Importar dataset" onClose={closeModal} wide>
      <p className="mb-4 text-sm leading-6 text-slate-600">Selecciona cualquier CSV compatible. Detectaremos si es tabular (Feedforward) o de dígitos 8×8 (CNN). No se envían tus datos al servidor.</p>
      <div className="flex flex-wrap gap-2">
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Archivo CSV" onChange={event => void chooseFile(event.target.files?.[0])}/>
        <button type="button" className="btn-primary" disabled={busy} onClick={openPicker}><UploadCloud size={17}/> Elegir archivo CSV</button>
        <button type="button" className="btn-outline" disabled={busy} onClick={() => void chooseBundledDigits()}>
          {busy ? <Loader2 size={17} className="animate-spin"/> : <Image size={17}/>} {busy ? 'Cargando...' : 'Usar dígitos incluidos'}
        </button>
        <a className="btn-outline" href={`${import.meta.env.BASE_URL}datasets/digits-8x8.csv`} download="digits-8x8.csv"><Download size={17}/> Descargar ejemplo CNN</a>
      </div>
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      {candidate && <div className="mt-5 rounded-xl border border-slate-200 p-4">
        <div className="mb-4 flex items-start gap-3"><CheckCircle2 className="shrink-0 text-emerald-600" size={20}/>
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{candidate.name}</p>
            <p className="mt-1 text-xs text-slate-500">{candidate.kind === 'digits8x8' ? 'CNN · Dígitos 8×8' : 'Feedforward · Datos tabulares'} · {candidate.rows.length} registros · {candidate.headers.length} columnas</p></div>
        </div>
        {candidate.kind === 'digits8x8' ? <div className="mb-4 flex items-center gap-3"><DigitPreview pixels={candidate.rows[0].slice(0, 64)} label={candidate.rows[0][64]}/><p className="text-xs text-slate-500">Columna objetivo fija: label · 10 dígitos posibles (0–9).</p></div> : <div className="mb-4">
          <label htmlFor="target-column" className="field-label">Columna objetivo</label>
          <select id="target-column" className="field" value={target} onChange={event => setTarget(event.target.value)}>
            {candidate.headers.map(header => <option key={header} value={header}>{header}</option>)}
          </select>
        </div>}
        <p className="mb-3 text-xs text-amber-700">{current ? 'Se reemplazará el dataset activo. Los modelos históricos se conservarán.' : 'Se guardará este dataset en tu cuenta.'}</p>
        <button type="button" className="btn-primary w-full" disabled={busy || isTraining} onClick={save}><FileUp size={17}/> {current ? 'Confirmar reemplazo' : 'Importar dataset'}</button>
      </div>}
    </Modal>}
  </>;
}

/** M05 tiene un único importador; el CSV se guarda automáticamente en tu cuenta. */
export default function Datasets({ navigate }: { navigate: (page: Page) => void }) {
  return <LocalDatasets navigate={navigate}/>;
}

// Importación de CSV validada en el navegador, sin enviar archivos a una API.
import { useRef, useState } from 'react';
import ModuleExperience from '../../app/ModuleExperience';
import { CheckCircle2, Database, Download, FileSpreadsheet, FileUp, Trash2, UploadCloud, Image, ScanLine } from 'lucide-react';
import RemoteDatasets from './RemoteDatasets';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { MAX_CSV_BYTES, datasetSummary, parseCsv } from '../../lib/csv';
import { isDigitsDataset, MAX_DIGITS_CSV_BYTES, parseDigitsCsv } from '../../lib/digits';
import DigitPreview from '../../components/DigitPreview';
import { download } from '../../lib/storage';
import { EmptyState, Heading, Notice, SectionTitle, formatDate } from '../../components/ui';
import type { Page } from '../../app/App';

function LocalDatasets({ navigate }: { navigate: (page: Page) => void }) {
  const { activeProject, data, importDataset, removeDataset } = useWorkspace();
  const [candidate, setCandidate] = useState<{ name: string; headers: string[]; rows: number[][] } | null>(null);
  const [target, setTarget] = useState('');
  const [digitCandidate, setDigitCandidate] = useState<{ name: string; headers: string[]; rows: number[][] } | null>(null);
  const [digitBusy, setDigitBusy] = useState(false);
  const digitInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  if (!activeProject) return <><Heading eyebrow="Datos · M05" title="Datasets"/><div className="panel"><EmptyState icon={<Database size={27}/>} title="Selecciona un proyecto" description="Para importar archivos CSV, elige antes un proyecto de IA." action={<button className="btn-primary" onClick={() => navigate('projects')}>Abrir proyectos</button>}/></div></>;
  const current = data.datasets.find(d => d.projectId === activeProject.id);
  const digitMode = isDigitsDataset(current);
  // El recurso proviene de un dataset real. Solo se importa por acción explícita, nunca al iniciar la app.
  const bundledDigits = async () => {
    setDigitBusy(true); setError('');
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}datasets/digits-8x8.csv`);
      if (!response.ok) throw new Error('No se pudo leer el archivo de dígitos incluido en el proyecto.');
      const parsed = parseDigitsCsv(await response.text());
      setDigitCandidate({ name: 'digits-8x8.csv', ...parsed });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Error al leer el dataset.'); }
    finally { setDigitBusy(false); }
  };
  const chooseDigits = async (file?: File) => {
    setError(''); setDigitCandidate(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name) || file.size > MAX_DIGITS_CSV_BYTES) { setError('Importa un CSV de dígitos válido de hasta 1,5 MB.'); return; }
    try { setDigitCandidate({ name: file.name, ...parseDigitsCsv(await file.text()) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Error al validar el archivo.'); }
  };
  const saveDigits = () => {
    if (!digitCandidate) return;
    try { importDataset(activeProject.id, digitCandidate.name, digitCandidate.headers, digitCandidate.rows, 'label', 'digits8x8'); setDigitCandidate(null); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudieron guardar las imágenes.'); }
  };
  const choose = async (file: File | undefined) => {
    setError(''); setCandidate(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { setError('Solo se admiten archivos con extensión .csv.'); return; }
    if (file.size > MAX_CSV_BYTES) { setError('El CSV supera el límite de 900 KB de este MVP local.'); return; }
    try { const parsed = parseCsv(await file.text()); setCandidate({ name: file.name, ...parsed }); setTarget(parsed.headers.at(-1)!); }
    catch (err) { setError((err as Error).message); }
  };
  const save = () => {
    if (!candidate) return;
    try { importDataset(activeProject.id, candidate.name, candidate.headers, candidate.rows, target); setCandidate(null); setError(''); if (inputRef.current) inputRef.current.value = ''; }
    catch (err) { setError((err as Error).message); }
  };
  const exportCsv = () => {
    if (!current) return;
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const contents = [current.headers.map(escape).join(','), ...current.rows.map(row => row.join(','))].join('\r\n');
    download(current.name, contents, 'text/csv');
  };
  const remove = () => { if (!current || !window.confirm(`¿Eliminar el dataset ${current.name}? Los modelos previamente entrenados se conservarán.`)) return; try { removeDataset(current.id); } catch (err) { setError((err as Error).message); } };
  return <>
    <Heading eyebrow={`Datos · M05 · ${activeProject.name}`} title="Datasets" description="Importa CSV tabulares o prepara un dataset real de imágenes para CNN. Todo se procesa localmente y sin conexión a Python."/>
    {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}
    <section className="panel mb-5 p-5"><div className="mb-4 flex items-start gap-3"><div className="rounded-xl bg-primary-50 p-2.5 text-primary-600"><Image size={21}/></div><div><h2 className="font-bold text-ink">Dataset para CNN · Dígitos manuscritos</h2><p className="mt-1 text-xs leading-5 text-slate-500">Conjunto auténtico Optical Recognition of Handwritten Digits (UCI / scikit-learn). 1.797 imágenes, 8×8 píxeles en escala 0–16 y etiquetas del 0 al 9. Se carga únicamente cuando lo solicitas.</p></div></div><div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={() => void bundledDigits()} disabled={digitBusy}><ScanLine size={17}/>{digitBusy ? 'Leyendo dataset...' : 'Seleccionar dataset incluido'}</button><input ref={digitInputRef} type="file" className="sr-only" accept=".csv,text/csv" onChange={e => void chooseDigits(e.target.files?.[0])}/><button className="btn-outline" onClick={() => digitInputRef.current?.click()}><UploadCloud size={16}/> Importar CSV CNN propio</button><a className="btn-outline" href={`${import.meta.env.BASE_URL}datasets/digits-8x8.csv`} download="digits-8x8.csv"><Download size={16}/> Descargar dataset real</a></div>{digitCandidate && <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-primary-200 bg-primary-50 p-4"><DigitPreview pixels={digitCandidate.rows[0].slice(0, 64)} label={digitCandidate.rows[0][64]}/><div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">{digitCandidate.name}</p><p className="text-xs text-slate-600">{digitCandidate.rows.length} imágenes validadas · 10 clases posibles · 64 píxeles</p><p className="mt-1 text-xs text-slate-500">Importar reemplazará el dataset activo de este proyecto. Confirma antes de iniciar una CNN.</p></div><button className="btn-primary" onClick={saveDigits}><FileUp size={17}/> Usar este dataset</button></div>}<p className="mt-3 text-xs text-slate-500">Fuente: UCI Machine Learning Repository, Optical Recognition of Handwritten Digits (Alpaydin y Kaynak, 1998). La versión reducida de scikit-learn contiene 1.797 muestras.</p></section>
    <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]"><section className="panel p-5"><SectionTitle title="Importar archivo CSV" subtitle="El archivo se procesa en tu navegador sin enviarlo a un servidor"/>
      <input ref={inputRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={e => void choose(e.target.files?.[0])}/>
      <button className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/60 px-5 py-10 transition-colors hover:border-primary-400 hover:bg-primary-50" onClick={() => inputRef.current?.click()}><span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white text-primary-600 shadow-sm"><UploadCloud size={28}/></span><strong className="text-sm text-ink">Seleccionar CSV de tu equipo</strong><span className="mt-1 text-xs text-slate-500">Hasta 900 KB · 2.000 filas · 16 columnas</span></button>
      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600"><strong className="text-slate-800">Requisitos del archivo</strong><p>Primera fila con encabezados únicos; todas las celdas numéricas y completas. Para clasificación binaria, la variable objetivo debe contener únicamente 0 o 1. Los datos se guardan localmente.</p></div>
      {candidate && <div className="mt-5 rounded-xl border border-primary-200 bg-white p-4"><div className="mb-4 flex items-start gap-3"><FileSpreadsheet className="shrink-0 text-emerald-600" size={22}/><div className="min-w-0"><p className="truncate text-sm font-bold text-ink">{candidate.name}</p><p className="mt-1 text-xs text-slate-500">{candidate.rows.length} filas · {candidate.headers.length} columnas válidas</p></div><CheckCircle2 className="ml-auto shrink-0 text-emerald-600" size={18}/></div><label className="field-label" htmlFor="target-column">Columna objetivo</label><select id="target-column" value={target} onChange={e => setTarget(e.target.value)} className="field">{candidate.headers.map(header => <option key={header} value={header}>{header}</option>)}</select><button onClick={save} className="btn-primary mt-4 w-full"><FileUp size={17}/> {current ? 'Reemplazar dataset actual' : 'Importar dataset'}</button></div>}
    </section><section className="panel p-5"><SectionTitle title="Dataset del proyecto" subtitle="Contenido generado por una importación real"/>
      {!current ? <EmptyState compact icon={<Database size={26}/>} title="Sin dataset importado" description="Tu archivo aparecerá aquí con las columnas, dimensiones y una vista previa de los registros reales."/> :
      <><div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4"><div className="flex min-w-0 items-start gap-3"><FileSpreadsheet className="shrink-0 text-emerald-600" size={22}/><div className="min-w-0"><strong className="block truncate text-sm text-ink">{current.name}</strong><p className="mt-1 text-xs text-slate-500">{digitMode ? `${current.rows.length} imágenes de 8×8 · 10 clases posibles` : datasetSummary(current.headers, current.rows, current.target)}</p><p className="mt-1 text-xs text-slate-400">Importado: {formatDate(current.createdAt)}</p></div></div><CheckCircle2 size={18} className="shrink-0 text-emerald-600"/></div>
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Primeros registros (datos reales)</div>{digitMode ? <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 p-4">{current.rows.slice(0, 8).map((row, i) => <DigitPreview key={i} pixels={row.slice(0, 64)} label={row[64]} size={72}/>)}</div> : <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-right text-xs"><thead className="bg-slate-50"><tr>{current.headers.map(h => <th key={h} className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{h}{h === current.target && <span className="ml-1 text-primary-600">●</span>}</th>)}</tr></thead><tbody>{current.rows.slice(0, 6).map((row, i) => <tr key={i} className="border-t border-slate-100">{row.map((value, j) => <td key={j} className="px-3 py-2.5 font-mono text-slate-600">{value}</td>)}</tr>)}</tbody></table></div>}
        <div className="mt-5 flex flex-wrap gap-2"><button onClick={exportCsv} className="btn-outline"><Download size={16}/> Exportar CSV</button><button onClick={remove} className="btn-danger"><Trash2 size={16}/> Eliminar</button></div>
      </>}
    </section></div>
  </>;
}


/** M05 prioriza la importación local y mantiene los CSV remotos en consulta avanzada. */
export default function Datasets({ navigate }: { navigate: (page: Page) => void }) {
  return <ModuleExperience page="datasets" browser={<LocalDatasets navigate={navigate}/>} historical={<RemoteDatasets navigate={navigate}/>}/>;
}

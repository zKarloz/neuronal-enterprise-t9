/** M09 remoto: exportaciones autenticadas desde datos realmente persistidos. */
import { useCallback, useEffect, useState } from 'react';
import { FileDown, FileJson, FileSpreadsheet, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { EmptyState, Heading, Notice, SectionTitle, formatDate } from '../../components/ui';
import { LoadingState, RemoteAuthRequired } from '../../components/RemoteStates';
import { request, type RemoteProject } from '../../lib/api/client';
import { ensureSession, loadSession, SESSION_CHANGED, type RemoteSession } from '../../lib/api/session';
import { downloadEpochsCsv, downloadProjectPdf, getProjectReport, type ProjectReport } from '../../lib/api/reports';

export default function RemoteReports() {
  const [session, setSession] = useState<RemoteSession | null>(() => loadSession());
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const token = useCallback(async () => {
    const current = loadSession();
    if (!current) throw new Error('Inicia sesión desde la esquina superior derecha.');
    const refreshed = await ensureSession(current);
    setSession(refreshed);
    return refreshed.access_token;
  }, []);
  useEffect(() => {
    const sync = () => setSession(loadSession());
    window.addEventListener(SESSION_CHANGED, sync);
    return () => window.removeEventListener(SESSION_CHANGED, sync);
  }, []);
  useEffect(() => {
    let active = true;
    if (!session) { setProjects([]); setReport(null); setLoadingProjects(false); return; }
    setLoadingProjects(true);
    void token().then(value => request<RemoteProject[]>('/projects', value)).then(rows => {
      if (active) { setProjects(rows); setProjectId(old => rows.some(p => p.id === old) ? old : (rows[0]?.id ?? '')); }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los proyectos.'); })
      .finally(() => { if (active) setLoadingProjects(false); });
    return () => { active = false; };
  }, [session?.access_token, token]);
  const refresh = useCallback(async () => {
    if (!projectId) return;
    const value = await token();
    setReport(await getProjectReport(projectId, value));
  }, [projectId, token]);
  useEffect(() => {
    let active = true;
    setReport(null);
    if (projectId) { setLoadingReport(true); void token().then(value => getProjectReport(projectId, value)).then(result => {
      if (active) setReport(result);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo recuperar el informe.'); })
      .finally(() => { if (active) setLoadingReport(false); }); }
    else setLoadingReport(false);
    return () => { active = false; };
  }, [projectId, token]);
  async function perform(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'La operación no pudo completarse.'); }
    finally { setBusy(false); }
  }
  function exportJson() {
    if (!report) return;
    const text = JSON.stringify(report, null, 2);
    const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `neurolab-informe-${projectId}.json`;
    anchor.hidden = true; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  if (session && (loadingProjects || loadingReport)) return <LoadingState label="Preparando reportes y exportaciones…"/>;
  return <>
    <Heading title="Reportes del servidor" description="Documenta proyectos, configuraciones y resultados guardados en PostgreSQL. Las descargas requieren una sesión autorizada."/>
    {!session ? <RemoteAuthRequired/> : <>
      <div className="panel mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1"><label className="field-label" htmlFor="report-project">Proyecto remoto</label>
          <select id="report-project" className="field" value={projectId} onChange={e => setProjectId(e.target.value)}>
            {!projects.length && <option value="">Sin proyectos remotos</option>}
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select></div>
        <button className="btn-outline" disabled={busy || !projectId} onClick={() => void perform(refresh)}><RefreshCw size={16}/> Actualizar informe</button>
      </div>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {notice && <div className="mb-4"><Notice tone="success">{notice}</Notice></div>}
      {!report ? <div className="panel"><EmptyState title="Informe no disponible" description="Selecciona un proyecto para consultar sus resultados remotos."/></div> : <>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([['Arquitecturas', report.architectures.length], ['Datasets',report.datasets.length],
            ['Entrenamientos',report.jobs.length], ['Modelos',report.models.length]] as const).map(([label,count]) =>
            <div key={label} className="panel p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-ink">{count}</p></div>)}
        </div>
        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <button type="button" onClick={exportJson} className="panel group flex flex-col items-start p-5 text-left hover:border-primary-300">
            <FileJson size={24} className="text-primary-600"/><strong className="mt-3 text-sm text-ink">Ficha JSON</strong>
            <p className="mt-1 flex-1 text-xs leading-5 text-slate-500">Resumen de proyecto, datasets, arquitecturas, trabajos y modelos.</p>
            <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary-600"><FileDown size={15}/> Descargar JSON</span>
          </button>
          <button type="button" disabled={busy} onClick={() => void perform(async () => {
            const value = await token(); await downloadEpochsCsv(projectId, value); setNotice('Métricas CSV descargadas.');
          })} className="panel group flex flex-col items-start p-5 text-left hover:border-primary-300 disabled:opacity-50">
            <FileSpreadsheet size={24} className="text-emerald-600"/><strong className="mt-3 text-sm text-ink">Métricas CSV</strong>
            <p className="mt-1 flex-1 text-xs leading-5 text-slate-500">Pérdida y precisión reales, una fila por época guardada.</p>
            <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary-600"><FileDown size={15}/> Descargar CSV</span>
          </button>
          <button type="button" disabled={busy} onClick={() => void perform(async () => {
            const value = await token(); await downloadProjectPdf(projectId, value); setNotice('Ficha PDF descargada.');
          })} className="panel group flex flex-col items-start p-5 text-left hover:border-primary-300 disabled:opacity-50">
            <FileText size={24} className="text-violet-600"/><strong className="mt-3 text-sm text-ink">Ficha PDF</strong>
            <p className="mt-1 flex-1 text-xs leading-5 text-slate-500">Resumen profesional del proyecto y sus ejecuciones.</p>
            <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary-600"><FileDown size={15}/> Descargar PDF</span>
          </button>
        </div>
        <section className="panel p-5">
          <SectionTitle title={`Informe · ${report.project.name}`} subtitle={`Actualizado: ${formatDate(report.generated_at)} · Hasta ${report.limited_to} registros por categoría`}/>
          {report.jobs.length === 0 ? <EmptyState compact title="Todavía no hay entrenamientos" description="Las exportaciones documentarán los experimentos cuando estén registrados."/> :
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Fecha</th><th className="p-3">Estado</th><th className="p-3">Épocas</th><th className="p-3">ID</th></tr></thead>
              <tbody>{report.jobs.map(job => <tr key={job.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap p-3 text-xs text-slate-600">{job.created_at ? formatDate(job.created_at) : '—'}</td>
                <td className="p-3 text-xs font-semibold text-ink">{job.status}</td>
                <td className="p-3 text-xs text-slate-600">{job.epochs_executed}/{job.epochs}</td>
                <td className="p-3 font-mono text-xs text-slate-500">{job.id.slice(0,8)}…</td>
              </tr>)}</tbody></table></div>}
          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500"><ShieldCheck size={16} className="shrink-0 text-emerald-600"/>
            Los informes no incluyen archivos CSV originales, claves privadas ni pesos del modelo. Las descargas quedan auditadas en el servidor.</div>
        </section>
      </>}
    </>}
  </>;
}

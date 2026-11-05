import { useState } from 'react';
import { Pagination, pageItems } from '../../components/Pagination';
import { SessionNotice } from '../../components/SessionNotice';
// Reportes exportables calculados a partir de ejecuciones del usuario.
import { ChartNoAxesCombined, Download, FileJson, FileSpreadsheet, Printer } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { download, exportJSON } from '../../lib/storage';
import { EmptyState, Heading, SectionTitle, StatusPill, formatDate, formatMetric } from '../../components/ui';
import type { CNNNetwork, TrainedNetwork } from '../../types/domain';

/** Distingue los pesos CNN de los pesos de una red Feedforward al exportar. */
function isCNNNetwork(network: TrainedNetwork | CNNNetwork): network is CNNNetwork {
  return 'kind' in network && network.kind === 'cnn';
}

/** Reportes producidos a partir de las entidades del usuario; sin informes precalculados. */
export default function Reports() {
  const { data, activeProject } = useWorkspace();
  const runs = data.runs.filter(r => !activeProject || r.projectId === activeProject.id);
  const models = data.models.filter(m => !activeProject || m.projectId === activeProject.id);
  const exportReport = () => exportJSON(`neurolab-reporte-${new Date().toISOString().slice(0, 10)}.json`, {
    exportDate: new Date().toISOString(),
    project: activeProject,
    architectures: data.architectures.filter(a => !activeProject || a.projectId === activeProject.id),
    datasets: data.datasets.filter(d => !activeProject || d.projectId === activeProject.id).map(({ rows, ...dataset }) => ({ ...dataset, rowCount: rows.length })),
    runs, models: models.map(({ network, ...model }) => ({ ...model, ...(isCNNNetwork(network) ? { family: 'cnn', task: 'multiclass', classes: 10, imageSize: 8, filters: network.filters } : { family: 'feedforward', features: network.features, target: network.target, task: network.task }) })),
  });
  const exportMetrics = () => {
    const header = ['run_id', 'architecture', 'dataset', 'epoch', 'loss', 'val_loss', 'accuracy', 'val_accuracy'].join(',');
    const lines = runs.flatMap(r => r.metrics.map(m => [r.id, `"${r.architectureName.replaceAll('"', '""')}"`, `"${r.datasetName.replaceAll('"', '""')}"`, m.epoch, m.loss, m.valLoss, m.accuracy ?? '', m.valAccuracy ?? ''].join(',')));
    download('neurolab-metricas.csv', [header, ...lines].join('\r\n'), 'text/csv');
  };
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  return <>
    <Heading eyebrow="Documentación · M09" title="Reportes y exportaciones" description="Genera entregables desde tus proyectos, configuraciones, entrenamientos y métricas efectivamente registrados."/>
    <div className="grid gap-4 md:grid-cols-3"><button disabled={!runs.length && !data.projects.length} className="panel group p-5 text-left transition-colors hover:border-primary-300 disabled:opacity-50" onClick={exportReport}><FileJson size={25} className="text-primary-600"/><div className="mt-4 font-bold text-ink">Reporte JSON</div><div className="mt-1 text-xs leading-5 text-slate-500">Proyectos, arquitectura, resumen de datasets y ejecuciones.</div><div className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary-600"><Download size={15}/> Generar archivo</div></button>
    <button disabled={!runs.some(r => r.metrics.length)} className="panel group p-5 text-left transition-colors hover:border-primary-300 disabled:opacity-50" onClick={exportMetrics}><FileSpreadsheet size={25} className="text-emerald-600"/><div className="mt-4 font-bold text-ink">Métricas CSV</div><div className="mt-1 text-xs leading-5 text-slate-500">Pérdida, exactitud y validación de cada época ejecutada.</div><div className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary-600"><Download size={15}/> Exportar resultados</div></button>
    <button disabled={!runs.length} className="panel group p-5 text-left transition-colors hover:border-primary-300 disabled:opacity-50" onClick={() => window.print()}><Printer size={25} className="text-violet-600"/><div className="mt-4 font-bold text-ink">Imprimir / PDF</div><div className="mt-1 text-xs leading-5 text-slate-500">Abre el diálogo del navegador para guardar este informe como PDF.</div><div className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary-600"><Printer size={15}/> Preparar impresión</div></button></div>
    <section className="panel mt-5 p-5"><SectionTitle title="Resumen del informe" subtitle={activeProject ? `Proyecto: ${activeProject.name}` : 'Todos los proyectos locales'}/>
    {!runs.length ? <EmptyState compact icon={<ChartNoAxesCombined size={26}/>} title="No hay resultados para documentar" description="Completa un entrenamiento para generar tablas de resultados y habilitar la exportación de métricas."/> : <><div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Ejecuciones</div><div className="mt-1 text-2xl font-bold text-ink">{runs.length}</div></div><div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Completadas</div><div className="mt-1 text-2xl font-bold text-ink">{runs.filter(r => r.status === 'completed').length}</div></div><div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Versiones de modelos</div><div className="mt-1 text-2xl font-bold text-ink">{models.length}</div></div></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Fecha</th><th className="p-3">Arquitectura</th><th className="p-3">Dataset</th><th className="p-3">Estado</th><th className="p-3">Pérdida validación</th></tr></thead><tbody>{pageItems(runs, page, pageSize).map(r => <tr className="border-t border-slate-100" key={r.id}><td className="whitespace-nowrap p-3 text-xs text-slate-500">{formatDate(r.createdAt)}</td><td className="p-3 font-semibold text-ink">{r.architectureName}</td><td className="p-3 text-xs text-slate-600">{r.datasetName}</td><td className="p-3"><StatusPill status={r.status}/></td><td className="p-3 font-mono text-xs text-slate-600">{r.metrics.length ? formatMetric(r.metrics.at(-1)!.valLoss) : '—'}</td></tr>)}</tbody></table></div><Pagination total={runs.length} page={page} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={setPageSize} label="experimentos"/></>}
    </section><div className="mt-5"><SessionNotice storageKey="reportes-local" tone="info">La exportación JSON del reporte no incorpora las filas del dataset ni los pesos del modelo. Puedes exportar los pesos desde «Modelos» y realizar una copia integral desde «Administración».</SessionNotice></div>
  </>;
}

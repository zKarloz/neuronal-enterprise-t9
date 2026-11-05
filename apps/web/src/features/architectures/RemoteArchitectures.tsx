/** M04 remoto: consultar y crear versiones inmutables. La API aún no permite borrar/editar en sitio. */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CirclePlus, CopyPlus, Layers3, Network, RefreshCw, Save, Trash2 } from 'lucide-react';
import { configured } from '../../lib/api/config';
import { request, type RemoteProject } from '../../lib/api/client';
import { ensureSession, loadSession, SESSION_CHANGED, type RemoteSession } from '../../lib/api/session';
import { createArchitecture, getArchitectures, type DenseLayer, type RemoteArchitecture, type ArchitectureDraft } from '../../lib/api/training';
import { EmptyState, Heading, Notice, formatDate } from '../../components/ui';
import { LoadingState, RemoteAuthRequired, RemoteUnavailable } from '../../components/RemoteStates';

const initialLayers = (): DenseLayer[] => [{ units: 16, activation: 'relu' }, { units: 8, activation: 'relu' }];

export default function RemoteArchitectures() {
  const [session, setSession] = useState<RemoteSession | null>(() => loadSession());
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [items, setItems] = useState<RemoteArchitecture[]>([]);
  const [name, setName] = useState('Arquitectura remota');
  const [family, setFamily] = useState<'feedforward' | 'cnn_8x8'>('feedforward');
  const [layers, setLayers] = useState<DenseLayer[]>(initialLayers);
  const [filters, setFilters] = useState(8);
  const [dense, setDense] = useState(16);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reload, setReload] = useState(0);
  const token = useCallback(async () => {
    const current = loadSession();
    if (!current) throw new Error('Debes iniciar sesión desde el topbar.');
    return (await ensureSession(current)).access_token;
  }, []);
  useEffect(() => {
    const sync = () => setSession(loadSession());
    window.addEventListener(SESSION_CHANGED, sync);
    return () => window.removeEventListener(SESSION_CHANGED, sync);
  }, []);
  useEffect(() => {
    if (!session || !configured) { setProjects([]); setLoadingProjects(false); return; }
    let active = true;
    setLoadingProjects(true); setError('');
    void token().then(access => request<RemoteProject[]>('/projects', access)).then(rows => {
      if (active) { setProjects(rows); setProjectId(old => rows.some(p => p.id === old) ? old : (rows[0]?.id ?? '')); }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Error al consultar proyectos.'); })
      .finally(() => { if (active) setLoadingProjects(false); });
    return () => { active = false; };
  }, [session?.access_token, reload, token]);
  useEffect(() => {
    if (!projectId) { setItems([]); setLoadingItems(false); return; }
    let active = true;
    setItems([]); setLoadingItems(true);
    void token().then(access => getArchitectures(projectId, access)).then(rows => { if (active) setItems(rows); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Error al consultar las arquitecturas.'); })
      .finally(() => { if (active) setLoadingItems(false); });
    return () => { active = false; };
  }, [projectId, token, reload]);
  const loadDraft = (item: RemoteArchitecture) => {
    setName(item.name); setFamily(item.family);
    if (item.family === 'feedforward') setLayers(item.config_json.layers ?? initialLayers());
    else { setFilters(item.config_json.conv_filters ?? 8); setDense(item.config_json.dense_units ?? 16); }
    setSuccess('Configuración copiada al formulario. Guardar crea otra versión sin modificar la anterior.');
  };
  const valid = name.trim().length >= 3 && name.trim().length <= 100 &&
    (family === 'cnn_8x8' || (layers.length >= 1 && layers.length <= 4 && layers.every(l => Number.isInteger(l.units) && l.units >= 2 && l.units <= 128)));
  const save = async () => {
    if (!projectId || !valid) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const draft: ArchitectureDraft = family === 'feedforward'
        ? { name: name.trim(), family, layers }
        : { name: name.trim(), family, conv_filters: filters, kernel_size: 3, dense_units: dense };
      const result = await createArchitecture(projectId, await token(), draft);
      setItems(await getArchitectures(projectId, await token()));
      setSuccess(`Arquitectura «${result.name}» guardada como versión ${result.version}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la arquitectura.'); }
    finally { setSaving(false); }
  };
  if (!configured) return <RemoteUnavailable/>;
  if (!session) return <RemoteAuthRequired/>;
  if (loadingProjects) return <LoadingState label="Consultando proyectos y arquitecturas…"/>;
  return <div className="space-y-5">
    <Heading title="Arquitecturas del servidor" description="Crea configuraciones Feedforward y CNN 8×8 versionadas para tus proyectos. Las versiones utilizadas por entrenamientos son inmutables."/>
    {error && <Notice tone="error">{error}</Notice>}
    {success && <Notice tone="success">{success}</Notice>}
    <div className="panel flex flex-wrap items-end gap-3 p-4"><div className="min-w-[220px] flex-1"><label htmlFor="remote-arch-project" className="field-label">Proyecto remoto</label><select id="remote-arch-project" className="field" value={projectId} onChange={event => setProjectId(event.target.value)}>
      {!projects.length && <option value="">Sin proyectos</option>}{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></div><button className="btn-outline" disabled={saving} onClick={() => setReload(v => v + 1)}><RefreshCw size={16}/> Actualizar</button></div>
    {!projectId ? <div className="panel"><EmptyState title="Crea un proyecto remoto primero" description="Las arquitecturas pertenecen a un proyecto autorizado."/></div> :
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,1fr)]">
        <section className="panel p-5"><h2 className="mb-4 text-base font-bold text-ink">Versiones guardadas ({items.length})</h2>
          {loadingItems ? <LoadingState label="Cargando versiones guardadas…"/> :
            !items.length ? <EmptyState compact icon={<Network size={26}/>} title="Sin arquitecturas" description="Crea la primera arquitectura remota utilizando el formulario."/> :
            <div className="max-h-[520px] space-y-2 overflow-y-auto">{items.map(item => <article key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{item.name}</h3>
                <p className="mt-1 text-xs text-slate-500">Versión {item.version} · {item.family === 'feedforward' ? 'Feedforward' : 'CNN 8×8'} · {formatDate(item.created_at)}</p></div>
                <button type="button" aria-label={`Reutilizar ${item.name}`} className="btn-outline !px-3 !py-2" onClick={() => loadDraft(item)}><CopyPlus size={15}/> Reutilizar</button></div>
              <p className="mt-2 text-xs text-slate-500">{item.family === 'feedforward'
                ? `${(item.config_json.layers ?? []).map(layer => `${layer.units} ${layer.activation}`).join(' → ')} · salida automática`
                : `${item.config_json.conv_filters} filtros · ${item.config_json.dense_units} neuronas densas`}</p>
            </article>)}</div>}
        </section>
        <section className="panel space-y-4 p-5"><div className="flex items-center gap-2"><Layers3 size={19} className="text-primary-600"/><h2 className="text-base font-bold text-ink">Guardar nueva versión</h2></div>
          <div><label htmlFor="remote-arch-name" className="field-label">Nombre</label><input id="remote-arch-name" className="field" value={name} maxLength={100} onChange={e => setName(e.target.value)}/></div>
          <div><label htmlFor="remote-arch-family" className="field-label">Familia neuronal</label><select id="remote-arch-family" className="field" value={family} onChange={e => setFamily(e.target.value as typeof family)}><option value="feedforward">Feedforward</option><option value="cnn_8x8">CNN · Dígitos 8×8</option></select></div>
          {family === 'feedforward' ? <div className="space-y-3"><p className="text-xs text-slate-500">Solo capas ocultas; la entrada y la salida dependen del dataset.</p>{layers.map((layer, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <div><label className="field-label" htmlFor={`server-arch-units-${i}`}>Capa {i + 1} · neuronas</label><input id={`server-arch-units-${i}`} className="field" type="number" min={2} max={128} value={layer.units} onChange={e => setLayers(old => old.map((l,j) => j === i ? { ...l, units: Number(e.target.value) } : l))}/></div>
            <div><label className="field-label" htmlFor={`server-arch-activation-${i}`}>Activación</label><select id={`server-arch-activation-${i}`} className="field" value={layer.activation} onChange={e => setLayers(old => old.map((l,j) => j === i ? { ...l, activation: e.target.value as DenseLayer['activation'] } : l))}><option value="relu">ReLU</option><option value="tanh">Tanh</option><option value="sigmoid">Sigmoid</option></select></div>
            <button className="btn-outline !px-3" type="button" aria-label={`Quitar capa ${i+1}`} disabled={layers.length <= 1} onClick={() => setLayers(old => old.filter((_, j) => j !== i))}><Trash2 size={16}/></button>
          </div>)}<button className="btn-outline" type="button" disabled={layers.length >= 4} onClick={() => setLayers(old => [...old, { units: 8, activation: 'relu' }])}><CirclePlus size={16}/> Añadir capa</button></div> :
          <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="remote-arch-filters" className="field-label">Filtros Conv2D (3×3)</label><select id="remote-arch-filters" className="field" value={filters} onChange={e => setFilters(Number(e.target.value))}>{[4,8,16,32].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
            <div><label htmlFor="remote-arch-dense" className="field-label">Neuronas densas</label><select id="remote-arch-dense" className="field" value={dense} onChange={e => setDense(Number(e.target.value))}>{[8,16,32,64,128].map(n => <option key={n} value={n}>{n}</option>)}</select></div></div>}
          <button type="button" className="btn-primary w-full" disabled={saving || !valid} onClick={() => void save()}><Save size={17}/>{saving ? 'Guardando…' : 'Guardar versión'}</button>
          <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={15}/> La API conserva las versiones anteriores; editar o eliminar una versión existente aún no está disponible.</p>
        </section>
      </div>}
  </div>;
}

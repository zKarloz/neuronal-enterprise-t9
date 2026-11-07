/**
 * Entrada única de cada módulo.
 * La experiencia principal utiliza datos y cómputo del navegador; los datos históricos
 * de FastAPI solo se consultan desde el área avanzada, sin pestañas duplicadas.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Archive } from 'lucide-react';
import { isLegacyServerSearch, pagePath, type Page } from '../lib/page-routes';

export function useLegacyView(): boolean {
  const [legacy, setLegacy] = useState(() => isLegacyServerSearch(window.location.search));
  useEffect(() => {
    const sync = () => setLegacy(isLegacyServerSearch(window.location.search));
    window.addEventListener('popstate', sync);
    window.addEventListener('neurolab:mode-changed', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('neurolab:mode-changed', sync);
    };
  }, []);
  return legacy;
}

export default function ModuleExperience({ page, browser, historical }: {
  page: Page;
  browser: ReactNode;
  historical: ReactNode;
}) {
  const legacy = useLegacyView();
  if (!legacy) return <>{browser}</>;
  return <>
    <aside role="note" className="panel mb-5 flex flex-wrap items-start gap-3 border border-amber-300/60 p-4 dark:border-amber-800/70">
      <Archive size={19} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"/>
      <div className="min-w-[220px] flex-1">
        <h2 className="text-sm font-bold text-ink">Herramientas heredadas · Servicios remotos</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Estos proyectos y modelos permanecen en FastAPI y PostgreSQL. No se han trasladado al navegador
          ni se sincronizan automáticamente. Los controles antiguos pueden depender del worker Python.
        </p>
      </div>
      <a className="btn-outline text-xs" href={pagePath(page)}><ArrowLeft size={15}/> Volver al laboratorio</a>
    </aside>
    {historical}
  </>;
}

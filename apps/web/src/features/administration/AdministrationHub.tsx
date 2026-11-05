/** M10 mantiene la administración local y añade permisos auditables en Servidor. */
import { useUrlMode } from '../../app/useUrlMode';
import { ModeTabs } from '../../components/ui';
import LocalAdministration from './Administration';
import RemoteAdministration from './RemoteAdministration';

export default function AdministrationHub() {
  const [mode, setMode] = useUrlMode();
  return <><ModeTabs mode={mode} setMode={setMode} label="Origen de administración"/>
    {mode === 'local' ? <LocalAdministration/> : <RemoteAdministration/>}
  </>;
}

/** M09: informes locales y remotos con la misma navegación. */
import { useUrlMode } from '../../app/useUrlMode';
import { ModeTabs } from '../../components/ui';
import LocalReports from './Reports';
import RemoteReports from './RemoteReports';

export default function ReportsHub() {
  const [mode, setMode] = useUrlMode(true);
  return <>
    <ModeTabs mode={mode} setMode={setMode} label="Origen del informe"/>
    {mode === 'local' ? <LocalReports/> : <RemoteReports/>}
  </>;
}

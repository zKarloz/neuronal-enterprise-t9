/** M04 híbrido: conserva el diseñador local y permite administrar versiones remotas. */
import { useUrlMode } from '../../app/useUrlMode';
import { ModeTabs } from '../../components/ui';
import LocalArchitectures from './Architectures';
import RemoteArchitectures from './RemoteArchitectures';
import type { Page } from '../../lib/page-routes';
export default function ArchitecturesHub({ navigate }: { navigate: (page: Page) => void }) {
  const [mode, setMode] = useUrlMode();
  return <><ModeTabs mode={mode} setMode={setMode} label="Origen de arquitecturas"/>
    {mode === 'local' ? <LocalArchitectures navigate={navigate}/> : <RemoteArchitectures/>}
  </>;
}

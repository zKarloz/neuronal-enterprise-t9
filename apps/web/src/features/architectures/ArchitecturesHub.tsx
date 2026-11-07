/** M04: diseñador de arquitecturas guardado automáticamente en la cuenta. */
import LocalArchitectures from './Architectures';
import type { Page } from '../../lib/page-routes';
export default function ArchitecturesHub({ navigate }: { navigate: (page: Page) => void }) {
  return <LocalArchitectures navigate={navigate}/>;
}

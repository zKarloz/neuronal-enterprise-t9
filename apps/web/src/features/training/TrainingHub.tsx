/** M06: TensorFlow.js calcula y entrena sin worker de Python. */
import LocalTraining from './Training';
import type { Page } from '../../app/App';
export default function TrainingHub({ navigate }: { navigate: (page: Page) => void }) {
  return <LocalTraining navigate={navigate}/>;
}

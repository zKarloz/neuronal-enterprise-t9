/**
 * Interfaz única desde v0.13.0. Se conserva la firma de props para evitar
 * romper módulos mientras las pantallas históricas dejan de utilizarse.
 * Ningún parámetro ?vista=servidor vuelve a exponer el laboratorio antiguo.
 */
import type { ReactNode } from 'react';
import type { Page } from '../lib/page-routes';

export default function ModuleExperience({ browser }: { page: Page; browser: ReactNode; historical: ReactNode }) {
  return <>{browser}</>;
}

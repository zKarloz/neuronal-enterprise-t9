/** Estados de red compartidos: nunca anunciar ausencia de datos durante una carga. */
import { Cloud, LoaderCircle, ShieldCheck } from 'lucide-react';
import { EmptyState } from './ui';

export function LoadingState({ label = 'Cargando información del servidor…' }: { label?: string }) {
  return <div role="status" aria-live="polite" className="panel flex min-h-36 items-center justify-center gap-3 p-6 text-sm text-slate-500">
    <LoaderCircle size={20} className="animate-spin text-primary-600" aria-hidden="true"/>{label}
  </div>;
}
export function RemoteAuthRequired() {
  return <div className="panel"><EmptyState icon={<ShieldCheck size={27}/>} title="Accede a tu espacio de trabajo"
    description="Inicia sesión con Google desde el topbar para generar reportes de tus proyectos remotos."/></div>;
}
export function RemoteUnavailable() {
  return <div className="panel"><EmptyState icon={<Cloud size={27}/>} title="Servidor no configurado"
    description="Configura VITE_API_BASE_URL para conectar NeuroLab con la API privada."/></div>;
}

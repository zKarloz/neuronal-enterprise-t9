// Inicio de React en modo estricto y contexto de trabajo local.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { WorkspaceProvider } from './app/WorkspaceProvider';
import App from './app/App';
import { ToastProvider } from './components/ToastProvider';

// Aplicar el tema antes de pintar React evita el destello de fondo claro al recargar.
try {
  const preference = localStorage.getItem('neurolab-theme-v1');
  const dark = preference === 'dark' || (preference === null && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('theme-dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
} catch { /* El modo privado puede restringir localStorage. */ }

// Punto de entrada único del frontend React.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorkspaceProvider>
      <ToastProvider><App /></ToastProvider>
    </WorkspaceProvider>
  </React.StrictMode>
);

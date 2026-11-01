// Inicio de React en modo estricto y contexto de trabajo local.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { WorkspaceProvider } from './app/WorkspaceProvider';
import App from './app/App';

// Punto de entrada único del frontend React.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  </React.StrictMode>
);

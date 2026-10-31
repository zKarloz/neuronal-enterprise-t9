import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite sirve únicamente el frontend: no hay proxies ni servidor de datos.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});

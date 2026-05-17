import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development the API runs on :3000 and the Vite dev server on :5173.
// We proxy /api and /uploads so the frontend can stay origin-agnostic in code
// and CORS isn't a concern in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
      '/health': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});

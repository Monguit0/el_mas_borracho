import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverUrl = process.env.BORRACHO_SERVER_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En desarrollo, el celular y el servidor se ven como un mismo origen.
    proxy: {
      '/api': serverUrl,
      '/socket.io': { target: serverUrl, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

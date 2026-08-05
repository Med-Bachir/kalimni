import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The console talks to the same API as the mobile app. In dev it proxies
// /api so the browser sees one origin and CORS never enters the picture; in
// production set VITE_API_URL to the deployed API and add that web origin to
// the API's CORS_ORIGINS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET || 'http://localhost:4000', changeOrigin: true },
    },
  },
});

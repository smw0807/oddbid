import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { colyseusBrowserWebSocket } from './build/colyseus-browser';
export default defineConfig({
  plugins: [colyseusBrowserWebSocket(), vue()],
  optimizeDeps: { exclude: ['@colyseus/sdk'], include: ['@colyseus/sdk > ws'] },
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/matchmake': { target: 'http://127.0.0.1:2567', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:2567', changeOrigin: true },
      // Colyseus upgrades /<processId>/<six-character roomId>; keep Vite HMR local.
      '^/[^/]+/[A-Z0-9]{6}(?:\\?|$)': {
        target: 'http://127.0.0.1:2567',
        ws: true,
      },
    },
  },
});

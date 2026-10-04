import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { colyseusBrowserWebSocket } from './build/colyseus-browser';
import { validateServerUrl } from './build/server-url';
const envDir = fileURLToPath(new URL('../..', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  validateServerUrl(env.VITE_SERVER_URL, env.VERCEL === '1' || !!env.VERCEL_ENV);
  return {
    plugins: [colyseusBrowserWebSocket(), vue()],
    optimizeDeps: { exclude: ['@colyseus/sdk'], include: ['@colyseus/sdk > ws'] },
    envDir,
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
  };
});

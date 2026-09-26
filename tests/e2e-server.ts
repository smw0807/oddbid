import { fileURLToPath } from 'node:url';
import { createGameServer } from '../apps/server/src/app.js';

const app = createGameServer({
  port: 2568,
  host: '127.0.0.1',
  roundMs: 5000,
  revealMs: 650,
  webDist: fileURLToPath(new URL('../apps/web/dist', import.meta.url)),
});
await app.listen();
console.log('OddBid browser test server: http://127.0.0.1:2568');
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void app.shutdown().then(() => process.exit(0));
  });
}

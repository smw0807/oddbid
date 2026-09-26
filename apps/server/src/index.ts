import { fileURLToPath } from 'node:url';
import { createGameServer } from './app.js';

const port = Number(process.env.PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer from 1 to 65535.');
const game = createGameServer({
  port,
  host: process.env.HOST ?? '0.0.0.0',
  webDist: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
});
await game.listen();
console.info(`OddBid server listening on http://localhost:${port}`);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
    await game.shutdown();
  } catch (error: unknown) {
    console.error('Could not stop the server cleanly:', error);
    process.exitCode = 1;
  }
}
process.once('SIGINT', () => {
  void stop();
});
process.once('SIGTERM', () => {
  void stop();
});

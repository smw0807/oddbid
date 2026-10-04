import { fileURLToPath } from 'node:url';
import { createGameServer } from './app.js';

const game = createGameServer({
  webDist: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
});
const port = await game.listen();
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

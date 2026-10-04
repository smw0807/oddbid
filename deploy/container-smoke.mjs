import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from '@colyseus/sdk';

const docker = (args) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const image = process.argv[2];
if (!image) throw new Error('Expected a Docker image');
const revision = 'a'.repeat(40);
const allowedOrigin = 'https://oddbid.example';
const container = docker([
  'run',
  '--detach',
  '--rm',
  '--publish',
  '127.0.0.1::2567',
  '--env',
  'NODE_ENV=production',
  '--env',
  `ALLOWED_ORIGINS=${allowedOrigin}`,
  '--env',
  `APP_REVISION=${revision}`,
  image,
]);
let room;
try {
  const user = docker(['inspect', '--format', '{{.Config.User}}', container]);
  assert.ok(user && user !== 'root' && user !== '0', 'container must run as an unprivileged user');
  const address = docker(['port', container, '2567/tcp']).split('\n')[0];
  const endpoint = `http://${address}`;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(2_000) });
      const health = await response.json();
      if (response.ok && health.ok && health.service === 'oddbid' && health.revision === revision) {
        ready = true;
        break;
      }
    } catch {
      /* Wait until the server binds its port. */
    }
    await sleep(500);
  }
  assert.ok(ready, 'production container health includes the expected revision');
  const allowed = await fetch(`${endpoint}/matchmake/create/auction`, {
    method: 'OPTIONS',
    headers: {
      Origin: allowedOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type',
    },
  });
  assert.ok(allowed.ok);
  assert.equal(allowed.headers.get('access-control-allow-origin'), allowedOrigin);
  const denied = await fetch(`${endpoint}/matchmake/create/auction`, {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '거절확인' }),
  });
  assert.equal(denied.status, 403);
  room = await new Client(endpoint.replace(/^http/, 'ws')).create('auction', {
    name: '배포확인',
    practice: true,
  });
  room.onMessage('self', () => {});
  room.onMessage('reaction', () => {});
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Container SDK did not receive a room snapshot')),
      5_000,
    );
    room.onMessage('snapshot', (state) => {
      clearTimeout(timeout);
      try {
        assert.equal(state.players.length, 3);
        assert.equal(state.phase, 'lobby');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    room.send('sync');
  });
  console.log(
    'Production container: nonroot, health revision, CORS policy and real SDK/WebSocket room passed.',
  );
} finally {
  if (room) {
    room.reconnection.enabled = false;
    await room.leave();
  }
  docker(['stop', '--time', '10', container]);
}

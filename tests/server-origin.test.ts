import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { Client, type SeatReservation } from '@colyseus/sdk';
import { createGameServer } from '../apps/server/src/app.js';
import { readServerConfig } from '../apps/server/src/config.js';
import { installHttpOriginGuard, isOriginAllowed } from '../apps/server/src/origin-policy.js';

const frontendOrigin = 'https://oddbid.vercel.app';
const previewOrigin = 'https://oddbid-preview-one.vercel.app';

test('production refuses missing or unsafe origin configuration before server startup', () => {
  for (const ALLOWED_ORIGINS of [
    undefined,
    '',
    ' ',
    '*',
    'https://*.vercel.app',
    'http://oddbid.example',
    'https://localhost',
    'https://localhost.',
    'https://app.localhost',
    'https://127.0.0.1:5173',
    'https://[::1]',
    'https://oddbid.example/',
    'https://oddbid.example/game',
    'https://oddbid.example?x=1',
    'https://oddbid.example#game',
    'https://user:password@oddbid.example',
    'null',
    `${frontendOrigin},`,
  ]) {
    assert.throws(
      () => readServerConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS }),
      /ALLOWED_ORIGINS/u,
    );
  }
  assert.throws(
    () => createGameServer({ environment: { NODE_ENV: 'production' } }),
    /ALLOWED_ORIGINS/u,
  );
});

test('production parses exact origins, bounded port, and health revision', () => {
  const config = readServerConfig({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: ` ${frontendOrigin}, ${previewOrigin},${frontendOrigin} `,
    PORT: '8080',
    HOST: '127.0.0.1',
    APP_REVISION: 'abc1234',
  });
  assert.deepEqual(config.allowedOrigins, [frontendOrigin, previewOrigin]);
  assert.equal(config.port, 8080);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.revision, 'abc1234');
  assert.equal(readServerConfig({}).revision, 'dev');
  for (const PORT of ['', '0', '-1', '65536', '3.5', '1e3', 'not-a-port']) {
    assert.throws(() => readServerConfig({ PORT }), /PORT/u);
  }
  assert.throws(() => readServerConfig({ NODE_ENV: 'prod' }), /NODE_ENV/u);
  assert.throws(() => readServerConfig({ APP_REVISION: 'value\nwith-newline' }), /APP_REVISION/u);
});

test('origin policy allows native callers and exact configured origins, not suffix matches', () => {
  const allowed = [frontendOrigin, previewOrigin];
  assert.equal(isOriginAllowed(undefined, allowed), true);
  assert.equal(isOriginAllowed(null, allowed), true);
  assert.equal(isOriginAllowed(frontendOrigin, allowed), true);
  assert.equal(isOriginAllowed(previewOrigin, allowed), true);
  for (const origin of [
    '',
    'null',
    'https://random.vercel.app',
    `${frontendOrigin}.evil.example`,
    `${frontendOrigin}:8443`,
    `${frontendOrigin}/path`,
    'https://*.vercel.app',
    `${frontendOrigin}, ${previewOrigin}`,
    'http://localhost:5173',
  ]) {
    assert.equal(isOriginAllowed(origin, allowed), false, origin);
  }
});

test('development retains LAN access unless an explicit allowlist is configured', () => {
  const defaults = readServerConfig({ NODE_ENV: 'development' });
  for (const origin of [
    'http://localhost:5173',
    'http://127.0.0.1:2568',
    'http://[::1]:5173',
    'http://192.168.0.10:5173',
  ]) {
    assert.equal(isOriginAllowed(origin, defaults.allowedOrigins), true);
  }
  const restricted = readServerConfig({
    NODE_ENV: 'development',
    ALLOWED_ORIGINS: 'http://192.168.0.10:5173',
  });
  assert.equal(isOriginAllowed('http://192.168.0.10:5173', restricted.allowedOrigins), true);
  assert.equal(isOriginAllowed('http://localhost:5173', restricted.allowedOrigins), false);
});

function upgradeStatus(
  endpoint: string,
  origin?: string,
): Promise<{ status: number; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(endpoint, {
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        ...(origin === undefined ? {} : { Origin: origin }),
      },
    });
    request.on('upgrade', (response, socket) => {
      socket.destroy();
      resolve({ status: response.statusCode ?? 0, headers: response.headers });
    });
    request.on('response', (response) => {
      response.resume();
      resolve({ status: response.statusCode ?? 0, headers: response.headers });
    });
    request.on('error', reject);
    request.setTimeout(3000, () => request.destroy(new Error('WebSocket handshake timed out.')));
    request.end();
  });
}

describe(
  'production HTTP and WebSocket origin boundary',
  { concurrency: false, timeout: 20_000 },
  () => {
    let game: ReturnType<typeof createGameServer>;
    let endpoint: string;

    before(async () => {
      game = createGameServer({
        port: 0,
        host: '127.0.0.1',
        webDist: '/nonexistent/oddbid-web-dist',
        environment: {
          NODE_ENV: 'production',
          ALLOWED_ORIGINS: `${frontendOrigin},${previewOrigin}`,
          APP_REVISION: 'revision-under-test',
        },
      });
      endpoint = `http://127.0.0.1:${await game.listen()}`;
    });

    after(async () => {
      await game?.shutdown();
    });

    test('backend-only health exposes its revision without requiring Origin', async () => {
      const response = await fetch(`${endpoint}/health`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        service: 'oddbid',
        revision: 'revision-under-test',
      });
    });

    test('allowed preflight reaches exact origin CORS headers', async () => {
      for (const origin of [frontendOrigin, previewOrigin]) {
        const response = await fetch(`${endpoint}/matchmake/create/auction`, {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
          },
        });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
        assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
        assert.match(response.headers.get('vary') ?? '', /Origin/iu);
        assert.match(response.headers.get('access-control-allow-headers') ?? '', /Content-Type/iu);
      }
    });

    test('disallowed preflight and matchmaking requests are rejected before Colyseus', async () => {
      for (const origin of [
        'https://someone-else.vercel.app',
        `${frontendOrigin}.evil.example`,
        'http://localhost:5173',
        'null',
      ]) {
        for (const method of ['OPTIONS', 'POST']) {
          const response = await fetch(`${endpoint}/matchmake/create/auction`, {
            method,
            headers: { Origin: origin, 'Content-Type': 'application/json' },
            ...(method === 'POST' ? { body: JSON.stringify({ name: '차단된손님' }) } : {}),
          });
          assert.equal(response.status, 403, `${method} ${origin}`);
          assert.equal(response.headers.get('access-control-allow-origin'), null);
          assert.deepEqual(await response.json(), { error: 'Origin is not allowed.' });
        }
      }
    });

    test('allowed matchmaking creates a playable seat and guard installation is idempotent', async () => {
      const listenerCount = game.httpServer.listenerCount('request');
      installHttpOriginGuard(game.httpServer, [frontendOrigin, previewOrigin]);
      assert.equal(game.httpServer.listenerCount('request'), listenerCount);
      const response = await fetch(`${endpoint}/matchmake/create/auction`, {
        method: 'POST',
        headers: { Origin: frontendOrigin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '허용된손님' }),
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), frontendOrigin);
      assert.match(response.headers.get('vary') ?? '', /Origin/iu);
      const reservation = (await response.json()) as SeatReservation;
      const room = await new Client(endpoint).consumeSeatReservation(reservation);
      try {
        assert.match(room.roomId, /^[A-Z0-9]{6}$/u);
      } finally {
        room.reconnection.enabled = false;
        await room.leave();
      }
    });

    test('WebSocket handshakes enforce Origin independently from HTTP matchmaking', async () => {
      for (const origin of [frontendOrigin, previewOrigin, undefined]) {
        assert.equal((await upgradeStatus(endpoint, origin)).status, 101);
      }
      for (const origin of [
        'https://someone-else.vercel.app',
        `${frontendOrigin}.evil.example`,
        'http://localhost:5173',
        'null',
      ]) {
        assert.equal((await upgradeStatus(endpoint, origin)).status, 403, origin);
      }
    });

    test('native SDK callers without Origin can still create, connect, and leave', async () => {
      const room = await new Client(endpoint).create('auction', { name: '서버점검' });
      try {
        assert.match(room.roomId, /^[A-Z0-9]{6}$/u);
      } finally {
        room.reconnection.enabled = false;
        await room.leave();
      }
    });
  },
);

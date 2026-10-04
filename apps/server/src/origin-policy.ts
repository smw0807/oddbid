import type { Server as HttpServer } from 'node:http';

const guardedServers = new WeakSet<HttpServer>();

/**
 * Origin is a browser boundary, not authentication. Native SDKs and health probes
 * legitimately omit it; a non-browser caller can also forge an allowed Origin.
 * Development without an explicit list retains localhost and LAN access.
 */
export function isOriginAllowed(
  origin: string | null | undefined,
  allowedOrigins: readonly string[] | null,
): boolean {
  if (origin === undefined || origin === null) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol) || origin !== url.origin || origin.includes('*'))
    return false;
  return allowedOrigins === null || allowedOrigins.includes(origin);
}

/**
 * Colyseus 0.18 installs its own Node request listener and handles matchmaking
 * and OPTIONS before Express. Wrap that listener only after bindRoutes runs;
 * Express middleware alone cannot reject those requests.
 */
export function installHttpOriginGuard(
  server: HttpServer,
  allowedOrigins: readonly string[] | null,
): void {
  if (guardedServers.has(server)) return;
  guardedServers.add(server);
  const listeners = server.listeners('request');
  server.removeAllListeners('request');
  server.on('request', (request, response) => {
    const origin = request.headers.origin;
    response.setHeader('Vary', 'Origin');
    if (!isOriginAllowed(origin, allowedOrigins)) {
      response.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: 'Origin is not allowed.' }));
      return;
    }
    // Handle preflight here so the framework cannot answer rejected Origins first.
    if (request.method === 'OPTIONS') {
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
      response.setHeader(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      );
      response.setHeader('Access-Control-Max-Age', '600');
      response.writeHead(204);
      response.end();
      return;
    }
    for (const listener of listeners) listener.call(server, request, response);
  });
}

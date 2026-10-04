import { createServer, type Server as HttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { configuredAuctionRoom } from './auction-room.js';
import { readServerConfig, type ServerEnvironment } from './config.js';
import { installHttpOriginGuard, isOriginAllowed } from './origin-policy.js';

export interface GameServerOptions {
  port?: number;
  host?: string;
  roundMs?: number;
  revealMs?: number;
  reconnectionSeconds?: number;
  webDist?: string;
  environment?: ServerEnvironment;
}

export interface GameServer {
  server: Server;
  httpServer: HttpServer;
  listen(): Promise<number>;
  shutdown(): Promise<void>;
}

export function createGameServer(options: GameServerOptions = {}): GameServer {
  const config = readServerConfig(options.environment);
  const port = options.port ?? config.port;
  const host = options.host ?? config.host;
  const httpServer = createServer();
  const server = new Server({
    transport: new WebSocketTransport({
      server: httpServer,
      maxPayload: 4096,
      pingInterval: 5000,
      pingMaxRetries: 2,
      beforeUpgrade: (request) => {
        if (!isOriginAllowed(request.headers.get('origin'), config.allowedOrigins)) {
          return Response.json({ error: 'Origin is not allowed.' }, { status: 403 });
        }
      },
    }),
    greet: false,
    gracefullyShutdown: false,
    express: (app) => {
      app.disable('x-powered-by');
      app.get('/health', (_request, response) =>
        response.json({ ok: true, service: 'oddbid', revision: config.revision }),
      );
      if (options.webDist && existsSync(resolve(options.webDist, 'index.html'))) {
        const webDist = resolve(options.webDist);
        app.use(express.static(webDist));
        app.get('/', (_request, response) => response.sendFile(resolve(webDist, 'index.html')));
      }
    },
  });
  server.define(
    'auction',
    configuredAuctionRoom({
      roundMs: options.roundMs,
      revealMs: options.revealMs,
      reconnectionSeconds: options.reconnectionSeconds,
    }),
  );
  return {
    server,
    httpServer,
    async listen() {
      let rejectBind: (error: Error) => void = () => {};
      const bindFailure = new Promise<never>((_resolve, reject) => {
        rejectBind = reject;
      });
      httpServer.once('error', rejectBind);
      try {
        await Promise.race([
          server.listen(port, host, undefined, () =>
            installHttpOriginGuard(httpServer, config.allowedOrigins),
          ),
          bindFailure,
        ]);
      } catch (error: unknown) {
        await server.gracefullyShutdown(false);
        throw error;
      } finally {
        httpServer.off('error', rejectBind);
      }
      const address = httpServer.address();
      if (!address || typeof address === 'string')
        throw new Error('The server did not bind a TCP port.');
      return address.port;
    },
    async shutdown() {
      await server.gracefullyShutdown(false);
    },
  };
}

import type { Plugin } from 'vite';

/**
 * @colyseus/sdk 0.18.4 tries the Node `WebSocket(url, { headers, protocols })`
 * overload in browsers, then catches and retries. WebKit emits a page error for
 * that invalid subprotocol even though the SDK subsequently connects.
 * Use the native browser overload in the browser bundle only. Keep this patch
 * explicit and fail on SDK changes so an upgrade cannot silently drop the fix.
 * Chromium/WebKit multiplayer tests cover connection, reload, and leaving.
 */
export function colyseusBrowserWebSocket(): Plugin {
  const nodeConstructor = 'this.ws = new WebSocket(url, { headers, protocols: this.protocols });';
  return {
    name: 'oddbid-colyseus-browser-websocket',
    enforce: 'pre',
    transform(code, id) {
      const modulePath = id.split('?')[0]?.replaceAll('\\', '/');
      if (!modulePath?.endsWith('/@colyseus/sdk/build/transport/WebSocketTransport.mjs')) return;
      if (!code.includes(nodeConstructor)) {
        this.error(
          'Colyseus WebSocket transport changed. Review and remove/update the 0.18.4 browser compatibility patch.',
        );
      }
      return {
        code: code.replace(nodeConstructor, 'this.ws = new WebSocket(url, this.protocols);'),
        map: null,
      };
    },
  };
}

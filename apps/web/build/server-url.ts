/** Separate hosting must never silently connect to Vercel as its game server. */
export function validateServerUrl(value: string | undefined, vercelBuild: boolean): void {
  if (!value) {
    if (vercelBuild) throw new Error('VITE_SERVER_URL is required for Vercel builds.');
    return;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_SERVER_URL must be a WebSocket origin.');
  }
  if (
    !['ws:', 'wss:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    value !== value.trim()
  ) {
    throw new Error(
      'VITE_SERVER_URL must be a ws:// or wss:// origin without credentials or a path.',
    );
  }
  if (vercelBuild && url.protocol !== 'wss:')
    throw new Error('Vercel builds require a secure wss:// VITE_SERVER_URL.');
}

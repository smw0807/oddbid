export interface ServerConfig {
  port: number;
  host: string;
  allowedOrigins: readonly string[] | null;
  revision: string;
}

export type ServerEnvironment = Readonly<Record<string, string | undefined>>;

/** Validate before constructing Colyseus, so a bad production config never opens a socket. */
export function readServerConfig(environment: ServerEnvironment = process.env): ServerConfig {
  const mode = environment.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(mode)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }
  const rawPort = environment.PORT ?? '2567';
  const port = Number(rawPort);
  if (!/^\d+$/u.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }

  const configuredOrigins = environment.ALLOWED_ORIGINS?.trim();
  if (mode === 'production' && !configuredOrigins) {
    throw new Error('ALLOWED_ORIGINS is required in production.');
  }
  const allowedOrigins = configuredOrigins
    ? [...new Set(configuredOrigins.split(',').map((entry) => validateOrigin(entry.trim(), mode)))]
    : null;
  const revision = environment.APP_REVISION?.trim() || 'dev';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(revision)) {
    throw new Error('APP_REVISION must be 1–128 letters, numbers, dots, underscores, or hyphens.');
  }
  return { port, host: environment.HOST?.trim() || '0.0.0.0', allowedOrigins, revision };
}

function validateOrigin(origin: string, mode: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('ALLOWED_ORIGINS must contain comma-separated exact HTTP(S) origins.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    origin !== url.origin ||
    origin.includes('*') ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'ALLOWED_ORIGINS entries must be exact origins without paths, wildcards, credentials, queries, or fragments.',
    );
  }
  if (mode === 'production' && (url.protocol !== 'https:' || isLoopback(url.hostname))) {
    throw new Error(
      'Production ALLOWED_ORIGINS must use HTTPS and must not include localhost or loopback hosts.',
    );
  }
  return url.origin;
}

function isLoopback(hostname: string): boolean {
  const host = hostname.replace(/\.$/u, '');
  return (
    host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./u.test(host)
  );
}

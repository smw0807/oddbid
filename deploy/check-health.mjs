import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { parseSecureOrigin } from './validate-production-env.mjs';

export async function checkBackendOnce(base, revision, frontendOrigin, request = fetch) {
  const response = await request(new URL('/health', base), {
    signal: AbortSignal.timeout(5_000),
    redirect: 'error',
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true || body.service !== 'oddbid' || body.revision !== revision)
    return false;
  const preflight = await request(new URL('/matchmake/create/auction', base), {
    method: 'OPTIONS',
    signal: AbortSignal.timeout(5_000),
    redirect: 'error',
    headers: {
      Origin: frontendOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type',
    },
  });
  return (
    preflight.ok &&
    preflight.headers.get('access-control-allow-origin') === frontendOrigin &&
    preflight.headers.get('access-control-allow-methods')?.split(/,\s*/).includes('POST') &&
    preflight.headers
      .get('access-control-allow-headers')
      ?.toLowerCase()
      .split(/,\s*/)
      .includes('content-type')
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, revision, frontendOrigin] = process.argv.slice(2);
  parseSecureOrigin(base, 'BACKEND_URL');
  parseSecureOrigin(frontendOrigin, 'FRONTEND_ORIGIN');
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Expected a commit SHA');
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if (await checkBackendOnce(base, revision, frontendOrigin)) {
        healthy = true;
        break;
      }
    } catch {
      /* Wait for initial TLS issuance and server startup. */
    }
    await sleep(5_000);
  }
  if (!healthy)
    throw new Error(
      'Public backend health, revision or frontend Origin check failed. Frontend publishing is stopped; inspect EC2, DNS, TLS and ALLOWED_ORIGINS.',
    );
  console.log(`Backend HTTPS and frontend Origin are healthy at revision ${revision}.`);
}

import { pathToFileURL } from 'node:url';

export function parseSecureOrigin(value, name, protocol = 'https:') {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid secure origin`);
  }
  if (url.protocol !== protocol || url.username || url.password || value !== url.origin)
    throw new Error(`${name} must be an exact secure origin without credentials or a path`);
  return url;
}

export function validateProductionEnv(env) {
  const required = [
    'AWS_REGION',
    'AWS_ROLE_ARN',
    'ECR_REPOSITORY',
    'EC2_INSTANCE_ID',
    'BACKEND_URL',
    'FRONTEND_ORIGIN',
    'VITE_SERVER_URL',
    'VERCEL_ORG_ID',
    'VERCEL_PROJECT_ID',
    'VERCEL_TOKEN',
  ];
  for (const name of required) {
    if (!env[name]?.trim()) throw new Error(`Missing production configuration: ${name}`);
  }
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(env.AWS_REGION)) throw new Error('Invalid AWS_REGION');
  if (!/^arn:aws:iam::\d{12}:role\/[\w+=,.@\/-]+$/.test(env.AWS_ROLE_ARN))
    throw new Error('Invalid AWS_ROLE_ARN');
  if (!/^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/.test(env.ECR_REPOSITORY))
    throw new Error('Invalid ECR_REPOSITORY');
  if (!/^i-(?:[a-f0-9]{8}|[a-f0-9]{17})$/.test(env.EC2_INSTANCE_ID))
    throw new Error('Invalid EC2_INSTANCE_ID');
  const backend = parseSecureOrigin(env.BACKEND_URL, 'BACKEND_URL');
  const websocket = parseSecureOrigin(env.VITE_SERVER_URL, 'VITE_SERVER_URL', 'wss:');
  parseSecureOrigin(env.FRONTEND_ORIGIN, 'FRONTEND_ORIGIN');
  if (backend.host !== websocket.host)
    throw new Error('BACKEND_URL and VITE_SERVER_URL must address the same backend');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateProductionEnv(process.env);
  console.log('Production configuration is present and consistent.');
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { makeSsmCommand } from './make-ssm-command.mjs';
import { parseSecureOrigin, validateProductionEnv } from './validate-production-env.mjs';
import { checkBackendOnce } from './check-health.mjs';
import { waitForSsm } from './wait-ssm.mjs';

const sha = 'a'.repeat(40);
const env = {
  GITHUB_SHA: sha,
  RELEASE_ID: `${sha}-123-1`,
  AWS_REGION: 'ap-northeast-2',
  IMAGE_URI: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/oddbid:${sha}-123-1`,
};

test('SSM command transports immutable release files without interpreting their shell contents', () => {
  const command = makeSsmCommand(env);
  assert.deepEqual(command.executionTimeout, ['900']);
  assert.equal(command.commands.filter((line) => line.includes('base64 --decode')).length, 3);
  assert.ok(command.commands.at(-1).includes(`'${env.IMAGE_URI}' '${sha}' '${env.AWS_REGION}'`));
  for (const key of ['GITHUB_SHA', 'RELEASE_ID', 'IMAGE_URI', 'AWS_REGION']) {
    assert.throws(() => makeSsmCommand({ ...env, [key]: "x'; touch /tmp/unwanted; '" }));
  }
  assert.throws(() =>
    makeSsmCommand({ ...env, IMAGE_URI: env.IMAGE_URI.replace('ap-northeast-2', 'us-east-1') }),
  );
});

test('preflight rejects missing credentials and mismatched or insecure backend endpoints', () => {
  const config = {
    ...env,
    AWS_ROLE_ARN: 'arn:aws:iam::123456789012:role/oddbid-deploy',
    ECR_REPOSITORY: 'oddbid',
    EC2_INSTANCE_ID: 'i-0123456789abcdef0',
    BACKEND_URL: 'https://api.example.com',
    FRONTEND_ORIGIN: 'https://play.example.com',
    VITE_SERVER_URL: 'wss://api.example.com',
    VERCEL_ORG_ID: 'team_example',
    VERCEL_PROJECT_ID: 'prj_example',
    VERCEL_TOKEN: 'test-value-not-a-real-token',
  };
  assert.doesNotThrow(() => validateProductionEnv(config));
  assert.throws(() => validateProductionEnv({ ...config, VERCEL_TOKEN: '' }));
  assert.throws(() =>
    validateProductionEnv({ ...config, VITE_SERVER_URL: 'wss://different.example.com' }),
  );
  assert.throws(() => validateProductionEnv({ ...config, BACKEND_URL: 'http://api.example.com' }));
  assert.throws(() => validateProductionEnv({ ...config, FRONTEND_ORIGIN: '' }));
});

test('invalid deployment URLs never expose their input in validation errors', () => {
  for (const value of [
    'https://user:do-not-print@[invalid',
    'https://user:do-not-print@api.example.com',
  ]) {
    assert.throws(
      () => parseSecureOrigin(value, 'BACKEND_URL'),
      (error) => !String(error).includes('do-not-print') && !('input' in error),
    );
  }
});

test('public deployment gate checks both revision and actual frontend CORS permission', async () => {
  const origin = 'https://play.example.com';
  const fake = (revision, allowed) => async (_url, init) =>
    init.method === 'OPTIONS'
      ? new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': allowed,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        })
      : Response.json({ ok: true, service: 'oddbid', revision });
  assert.equal(
    await checkBackendOnce('https://api.example.com', sha, origin, fake(sha, origin)),
    true,
  );
  assert.equal(
    await checkBackendOnce('https://api.example.com', sha, origin, fake('old', origin)),
    false,
  );
  assert.equal(
    await checkBackendOnce('https://api.example.com', sha, origin, fake(sha, '*')),
    false,
  );
  assert.equal(
    await checkBackendOnce(
      'https://api.example.com',
      sha,
      origin,
      fake(sha, 'https://other.example.com'),
    ),
    false,
  );
});

test('SSM eventual consistency and in-progress responses do not count as success', async () => {
  const responses = [
    undefined,
    { Status: 'Pending' },
    { Status: 'InProgress' },
    { Status: 'Success', ResponseCode: 0 },
  ];
  let reads = 0;
  await waitForSsm(() => responses[reads++], { delay: async () => {}, report: () => {} });
  assert.equal(reads, 4);
});

test('SSM failure, cancellation, inconsistent success and timeouts stop the deployment', async () => {
  for (const Status of ['Failed', 'TimedOut', 'Cancelled', 'Cancelling']) {
    await assert.rejects(waitForSsm(() => ({ Status }), { report: () => {} }));
  }
  await assert.rejects(
    waitForSsm(() => ({ Status: 'Success', ResponseCode: 1 }), { report: () => {} }),
  );
  let clock = 0;
  await assert.rejects(
    waitForSsm(() => ({ Status: 'Pending' }), {
      timeoutMs: 10,
      intervalMs: 5,
      now: () => clock,
      delay: async (amount) => {
        clock += amount;
      },
      report: () => {},
    }),
  );
});

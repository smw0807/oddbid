import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function waitForSsm(
  readStatus,
  {
    timeoutMs = 1_020_000,
    intervalMs = 5_000,
    now = Date.now,
    delay = sleep,
    report = console.log,
  } = {},
) {
  const deadline = now() + timeoutMs;
  let previous;
  while (now() < deadline) {
    const result = readStatus();
    const status = result?.Status;
    if (status && status !== previous) report(`SSM status: ${status}`);
    previous = status;
    if (status === 'Success') {
      if (result.ResponseCode !== 0)
        throw new Error('SSM reported success with a nonzero response code');
      return;
    }
    if (status && !['Pending', 'InProgress', 'Delayed'].includes(status)) {
      throw new Error(
        `EC2 deployment ${status}. Inspect this command in Systems Manager; frontend deployment is stopped.`,
      );
    }
    await delay(intervalMs);
  }
  throw new Error(
    'Timed out waiting for EC2. Inspect the SSM command before retrying; frontend deployment is stopped.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [commandId, instanceId] = process.argv.slice(2);
  if (!/^[a-f0-9-]{36}$/.test(commandId ?? '') || !/^i-[a-f0-9]{8,17}$/.test(instanceId ?? ''))
    throw new Error('Expected an SSM command ID and EC2 instance ID');
  console.log(`Waiting for SSM command ${commandId}`);
  await waitForSsm(() => {
    try {
      return JSON.parse(
        execFileSync(
          'aws',
          [
            'ssm',
            'get-command-invocation',
            '--command-id',
            commandId,
            '--instance-id',
            instanceId,
            '--output',
            'json',
          ],
          { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] },
        ),
      );
    } catch (error) {
      if (String(error.stderr).includes('InvocationDoesNotExist')) return undefined;
      throw new Error(
        'Could not read the SSM command status. Check AWS credentials and GetCommandInvocation permission.',
      );
    }
  });
}

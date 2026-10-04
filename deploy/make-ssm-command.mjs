import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function makeSsmCommand(env) {
  const { IMAGE_URI, GITHUB_SHA, RELEASE_ID, AWS_REGION } = env;
  if (!/^[a-f0-9]{40}$/.test(GITHUB_SHA ?? '')) throw new Error('Invalid GITHUB_SHA');
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(AWS_REGION ?? ''))
    throw new Error('Invalid AWS_REGION');
  if (!new RegExp(`^${GITHUB_SHA}-[0-9]+-[0-9]+$`).test(RELEASE_ID ?? ''))
    throw new Error('Invalid RELEASE_ID');
  const image = IMAGE_URI?.match(
    /^(\d{12})\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com\/([a-z0-9]+(?:[._/-][a-z0-9]+)*):([a-z0-9-]+)$/,
  );
  if (!image || image[2] !== AWS_REGION || image[4] !== RELEASE_ID)
    throw new Error('Image must be the current release in the configured regional ECR registry');
  const directory = `/opt/oddbid/releases/${RELEASE_ID}`;
  const commands = [
    'set -eu',
    'umask 077',
    'test -f /opt/oddbid/server.env',
    'test -f /opt/oddbid/.env',
    `test ! -e '${directory}'`,
    `install -d -m 0750 '${directory}'`,
  ];
  for (const name of ['compose.yaml', 'Caddyfile', 'update-server.sh']) {
    const encoded = readFileSync(new URL(name, import.meta.url)).toString('base64');
    commands.push(`printf '%s' '${encoded}' | base64 --decode > '${directory}/${name}'`);
  }
  commands.push(
    `chmod 0750 '${directory}/update-server.sh'`,
    `bash '${directory}/update-server.sh' '${IMAGE_URI}' '${GITHUB_SHA}' '${AWS_REGION}'`,
  );
  return { commands, executionTimeout: ['900'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(makeSsmCommand(process.env)));
}

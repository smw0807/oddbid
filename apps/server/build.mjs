import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: Object.keys(pkg.dependencies).filter((name) => name !== '@oddbid/shared'),
});

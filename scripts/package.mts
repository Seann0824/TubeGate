import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { verifyPackage } from './verify-package.mts';

const root = fileURLToPath(new URL('..', import.meta.url));
const destination = resolve(root, 'dist');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const entry of ['manifest.json', 'src', 'assets']) {
  await cp(resolve(root, entry), resolve(destination, entry), {
    recursive: true,
    filter: (source) => !source.endsWith('.ts'),
  });
}
await build({
  absWorkingDir: root,
  entryPoints: [
    'src/background.ts',
    'src/content.ts',
    'src/popup.ts',
    'src/settings.ts',
    'src/onboarding.ts',
  ],
  outdir: resolve(destination, 'src'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  legalComments: 'none',
});
await verifyPackage(destination);
console.log(`Packaged extension in ${destination}`);

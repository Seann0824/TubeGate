import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPackage } from './verify-package.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const destination = resolve(root, 'dist');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const entry of ['manifest.json', 'src', 'assets']) await cp(resolve(root, entry), resolve(destination, entry), { recursive: true });
await verifyPackage(destination);
console.log(`Packaged extension in ${destination}`);

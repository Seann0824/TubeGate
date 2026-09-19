import type { ManifestV3 } from './types';
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';

export async function verifyPackage(root: string) {
  const manifest: ManifestV3 = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  const referenced = new Set([
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action.default_icon || {}),
    ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...(entry.css || [])]),
  ]);
  const worker = await readFile(resolve(root, manifest.background.service_worker), 'utf8');
  for (const call of worker.matchAll(/importScripts\(([\s\S]*?)\)/g)) {
    for (const dependency of call[1].matchAll(/['"]([^'"]+)['"]/g)) {
      referenced.add(`${dirname(manifest.background.service_worker)}/${dependency[1]}`);
    }
  }
  // Follow local page assets as packaging dependencies, without testing UI markup or layout.
  for (const page of [
    manifest.action.default_popup,
    manifest.options_page,
    'src/onboarding.html',
  ]) {
    referenced.add(page);
    const html = await readFile(resolve(root, page), 'utf8');
    for (const asset of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
      if (/^[a-z]+:/i.test(asset[1])) throw new Error(`Remote page asset: ${asset[1]}`);
      referenced.add(`${dirname(page)}/${asset[1]}`);
    }
  }
  for (const file of referenced) {
    const target = resolve(root, file);
    const local = relative(root, target);
    if (local.startsWith('..') || isAbsolute(local))
      throw new Error(`Dependency escapes package: ${file}`);
    await access(target);
  }
  console.log(`Verified ${referenced.size} packaged entrypoints and dependencies.`);
}

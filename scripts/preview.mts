import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const preview = await build({
  entryPoints: [fileURLToPath(new URL('./preview-client.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'iife',
});
const client = preview.outputFiles[0].contents;
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};
createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    if (pathname === '/preview-client.js') {
      response.setHeader('Content-Type', mime['.js']);
      response.end(client);
      return;
    }
    const path = resolve(
      root,
      '.' + (pathname === '/' ? '/src/settings.html' : decodeURIComponent(pathname))
    );
    const local = relative(root, path);
    if (local.startsWith('..') || isAbsolute(local)) {
      response.writeHead(403);
      response.end();
      return;
    }
    const data = await readFile(path);
    response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(
      extname(path) === '.html'
        ? data
            .toString()
            .replace(/<body([^>]*)>/, '<body$1><script src="/preview-client.js"></script>')
        : data
    );
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(4173, '127.0.0.1', () =>
  console.log('Design preview: http://127.0.0.1:4173/src/settings.html')
);

// A stand-in app for the smoke test: serves a folder of built web pages on this computer only, sending unknown paths
// to index.html (as a single-page app's server does) and answering /api with 503.
//
//   node scripts/serve-static.mjs ../apogee/dist/web 4311

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const dir = resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 4311);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (path.startsWith('/api')) {
    res.writeHead(503, { 'content-type': 'application/json' });
    return res.end('{"error":"stand-in"}');
  }
  let file = resolve(join(dir, path));
  if (file !== dir && !file.startsWith(dir + sep)) file = join(dir, 'index.html');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(dir, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`${dir} on http://127.0.0.1:${port}`));

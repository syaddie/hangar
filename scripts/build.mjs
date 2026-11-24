// Builds Hangar into dist/: the main process and the shell's preload (CommonJS, for Electron), the shell page, its
// fonts and the icons. `--watch` rebuilds on every change (restart Electron to pick up main-process changes).

import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'shell', 'fonts'), { recursive: true });
mkdirSync(join(dist, 'assets', 'apps'), { recursive: true });

const node = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: 'linked',
  logLevel: 'warning',
};

const jobs = [
  { ...node, entryPoints: [join(root, 'src/main/main.ts')], outfile: join(dist, 'main/main.js') },
  // Sandboxed preloads run as plain scripts with only a few Electron modules, so this one is bundled with nothing else.
  { ...node, entryPoints: [join(root, 'src/preload/shell.ts')], outfile: join(dist, 'preload/shell.js') },
  {
    bundle: true,
    platform: 'browser',
    target: 'chrome140',
    format: 'iife',
    sourcemap: 'linked',
    logLevel: 'warning',
    entryPoints: [join(root, 'src/shell/shell.ts')],
    outfile: join(dist, 'shell/shell.js'),
  },
];

function copyStatic() {
  copyFileSync(join(root, 'src/shell/index.html'), join(dist, 'shell/index.html'));
  copyFileSync(join(root, 'src/shell/shell.css'), join(dist, 'shell/shell.css'));
  const next = join(root, 'node_modules/@fontsource/atkinson-hyperlegible-next/files');
  const mono = join(root, 'node_modules/@fontsource/atkinson-hyperlegible-mono/files');
  for (const w of [400, 500, 600, 700]) {
    copyFileSync(join(next, `atkinson-hyperlegible-next-latin-${w}-normal.woff2`), join(dist, `shell/fonts/next-${w}.woff2`));
  }
  copyFileSync(join(mono, 'atkinson-hyperlegible-mono-latin-500-normal.woff2'), join(dist, 'shell/fonts/mono-500.woff2'));
  cpSync(join(root, 'assets'), join(dist, 'assets'), { recursive: true });
  if (!existsSync(join(dist, 'assets/icon.png'))) console.warn('No assets/icon.png yet: run `npm run icons`.');
}

if (watch) {
  for (const job of jobs) await (await context(job)).watch();
  copyStatic();
  console.log('Watching src/ for changes.');
} else {
  await Promise.all(jobs.map((job) => build(job)));
  copyStatic();
}

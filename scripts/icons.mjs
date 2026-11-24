// Makes Hangar's icons from one of the logo concepts in logos/ (trajectory unless told otherwise):
//
//   npm run icons                 the chosen logo, as it is
//   npm run icons -- fan          switch to another concept (fan, airfoil, transfer, trajectory)
//
// Writes assets/logo.svg (the rail's mark), assets/icon.png (512px, for Linux, macOS and the installer) and
// assets/icon.ico (16 to 256px, for Windows' taskbar, Start menu and the window). It also copies Apogee's and
// Launchpad's own icons from their repos next door, for the rail before their manifests have been read.

import { Resvg } from '@resvg/resvg-js';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const assets = join(root, 'assets');
mkdirSync(join(assets, 'apps'), { recursive: true });

const pick = process.argv[2];
if (pick) {
  const src = join(root, 'logos', `${pick}.svg`);
  if (!existsSync(src)) {
    console.error(`No logos/${pick}.svg. Run \`node logos/make.mjs\` first, or pick fan, airfoil, transfer or trajectory.`);
    process.exit(1);
  }
  copyFileSync(src, join(assets, 'logo.svg'));
} else if (!existsSync(join(assets, 'logo.svg'))) {
  copyFileSync(join(root, 'logos', 'trajectory.svg'), join(assets, 'logo.svg'));
}

const svg = readFileSync(join(assets, 'logo.svg'));
const png = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

writeFileSync(join(assets, 'icon.png'), png(512));

// An .ico is a directory of images; Windows Vista and later take PNG data in it, which keeps the edges smooth.
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const images = sizes.map(png);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(size >= 256 ? 0 : size, at);
  header.writeUInt8(size >= 256 ? 0 : size, at + 1);
  header.writeUInt8(0, at + 2);
  header.writeUInt8(0, at + 3);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(images[i].length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += images[i].length;
});
writeFileSync(join(assets, 'icon.ico'), Buffer.concat([header, ...images]));

const projects = join(root, '..');
const apps = [
  ['apogee', join(projects, 'apogee/src/web/public/icon-192.png')],
  ['launchpad', join(projects, 'launchpad/web/public/icons/icon-192.png')],
];
for (const [id, src] of apps) {
  if (existsSync(src)) copyFileSync(src, join(assets, 'apps', `${id}.png`));
  else console.warn(`Couldn’t find ${src}; ${id} gets its icon from its manifest instead.`);
}

console.log(`Icons made from ${pick ?? 'assets/logo.svg'}: assets/icon.png, assets/icon.ico (${sizes.join(', ')} px).`);

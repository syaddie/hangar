// Hangar's entry point: one instance, one window (src/main/hangar.ts).
//
// For trying it without touching the real setup, two variables: HANGAR_DATA, a folder for the saved state in place of
// Electron's userData, and HANGAR_APPS, a JSON list of apps ([{"id":"apogee","name":"Apogee","url":"http://..."}])
// used when that folder has no saved state yet. `--hangar-bounds=x,y,width,height` opens the window on a fixed spot.

import { app, Menu } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppEntry } from '../shared/types';
import { Hangar } from './hangar';
import { Store } from './store';

const dist = join(__dirname, '..');
const assets = join(dist, 'assets');

if (process.env.HANGAR_DATA) app.setPath('userData', process.env.HANGAR_DATA);
app.setName('Hangar');
if (process.platform === 'win32') app.setAppUserModelId('com.syaddie.hangar');

/** A bundled icon as a data: URL, so the first two apps look right before their manifests have been read. */
function bundledIcon(file: string): string | undefined {
  const path = join(assets, 'apps', file);
  return existsSync(path) ? `data:image/png;base64,${readFileSync(path).toString('base64')}` : undefined;
}

function defaultApps(): AppEntry[] {
  if (process.env.HANGAR_APPS) {
    try {
      const list = JSON.parse(process.env.HANGAR_APPS) as AppEntry[];
      return list.map((a) => ({ ...a, icon: a.icon ?? bundledIcon(`${a.id}.png`) }));
    } catch {
      console.error('HANGAR_APPS isn’t a JSON list; using the usual apps.');
    }
  }
  return [
    { id: 'apogee', name: 'Apogee', url: 'https://apogee.syaddy.com/', icon: bundledIcon('apogee.png'), nameFrom: 'manifest' },
    {
      id: 'launchpad',
      name: 'Launchpad',
      url: 'https://launchpad.syaddy.com/',
      icon: bundledIcon('launchpad.png'),
      nameFrom: 'manifest',
    },
  ];
}

function boundsArg() {
  const arg = process.argv.find((a) => a.startsWith('--hangar-bounds='));
  if (!arg) return undefined;
  const [x, y, width, height] = arg.split('=')[1]!.split(',').map(Number);
  return [x, y, width, height].every((n) => Number.isFinite(n)) ? { x: x!, y: y!, width: width!, height: height! } : undefined;
}

let hangar: Hangar | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!hangar) return;
    if (hangar.win.isMinimized()) hangar.win.restore();
    hangar.win.show();
    hangar.win.focus();
  });

  // Nothing Hangar loads gets to embed a <webview> or open a window with Node in it.
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', (e) => e.preventDefault());
  });

  app.whenReady().then(() => {
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
      );
    } else {
      Menu.setApplicationMenu(null);
    }
    const store = new Store(app.getPath('userData'), defaultApps());
    hangar = new Hangar({
      store,
      dist,
      icon: join(assets, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
      bounds: boundsArg(),
    });
    // Ready for the smoke test (scripts/smoke.mjs) to reach in.
    (globalThis as { hangar?: Hangar }).hangar = hangar;
  });

  app.on('window-all-closed', () => app.quit());
}

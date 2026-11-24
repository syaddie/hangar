// Files an app downloads go straight to the Downloads folder, as in a browser, with a name that doesn't overwrite
// anything already there. The top bar shows the latest few (src/shell), and they can be opened or shown in the folder.

import { app, shell, type DownloadItem, type Session } from 'electron';
import { existsSync } from 'node:fs';
import { extname, basename, join } from 'node:path';
import type { Download } from '../shared/types';

interface Tracked extends Download {
  path: string;
}

const KEEP = 6;

/** "report.pdf" → "report (2).pdf" until the name is free. */
export function freeName(dir: string, name: string, exists: (p: string) => boolean = existsSync): string {
  const safe = basename(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'download';
  const ext = extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  let candidate = safe;
  for (let n = 2; exists(join(dir, candidate)); n++) candidate = `${stem} (${n})${ext}`;
  return join(dir, candidate);
}

export class Downloads {
  private list: Tracked[] = [];
  private next = 1;

  constructor(
    ses: Session,
    private changed: () => void,
  ) {
    ses.on('will-download', (_e, item) => this.track(item));
  }

  get all(): Download[] {
    return this.list.map(({ id, name, state, progress }) => ({ id, name, state, progress }));
  }

  private track(item: DownloadItem): void {
    const path = freeName(app.getPath('downloads'), item.getFilename());
    item.setSavePath(path);
    const d: Tracked = { id: String(this.next++), name: basename(path), state: 'progressing', progress: null, path };
    this.list = [d, ...this.list].slice(0, KEEP);
    const update = () => {
      const total = item.getTotalBytes();
      d.progress = total > 0 ? Math.min(1, item.getReceivedBytes() / total) : null;
      this.changed();
    };
    item.on('updated', (_e, state) => {
      d.state = state === 'interrupted' ? 'interrupted' : 'progressing';
      update();
    });
    item.once('done', (_e, state) => {
      d.state = state;
      d.progress = state === 'completed' ? 1 : d.progress;
      this.changed();
    });
    this.changed();
  }

  show(id: string): void {
    const d = this.list.find((x) => x.id === id);
    if (d) shell.showItemInFolder(d.path);
  }

  async open(id: string): Promise<void> {
    const d = this.list.find((x) => x.id === id);
    if (d && d.state === 'completed') await shell.openPath(d.path);
  }

  clear(): void {
    this.list = this.list.filter((d) => d.state === 'progressing');
    this.changed();
  }
}

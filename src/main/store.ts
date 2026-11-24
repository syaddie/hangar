// Hangar's one file of saved state (hangar.json in Electron's userData folder): the apps, their order, the settings,
// each app's zoom and the window's place. Written whole to a temporary file and renamed over the old one, so a crash
// mid-write leaves the last good copy; read through `readConfig`, so a damaged file never stops Hangar opening.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readConfig, type Config } from './policy';
import type { AppEntry } from '../shared/types';

export class Store {
  readonly file: string;
  config: Config;
  private timer: NodeJS.Timeout | null = null;

  constructor(dir: string, defaults: AppEntry[]) {
    this.file = join(dir, 'hangar.json');
    let raw: unknown = undefined;
    if (existsSync(this.file)) {
      try {
        raw = JSON.parse(readFileSync(this.file, 'utf8'));
      } catch {
        // Keep the unreadable file for a look later, and start from the defaults rather than not at all.
        try {
          copyFileSync(this.file, `${this.file}.unreadable-${Date.now()}`);
        } catch {
          /* nothing more to do */
        }
      }
    }
    this.config = readConfig(raw, defaults);
  }

  /** Saves soon, so a burst of changes (a window being dragged) is one write. */
  save(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), 400);
  }

  saveNow(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.config, null, 2));
    renameSync(tmp, this.file);
  }
}

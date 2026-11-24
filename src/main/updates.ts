// Hangar updating itself. Every push to main has GitHub Actions build a new version and publish it as a release on
// github.com/syaddie/hangar (.github/workflows/release.yml); the installed Hangar finds it, downloads it in the
// background (only the parts that changed) and says it's ready. A restart, or simply quitting Hangar, installs it.
//
// Run from source (`npm start`) there's nothing to update: the code is already the latest you have. HANGAR_UPDATES=off
// turns updating off in an installed copy too, for testing one: a copy that has found an update installs it on quit.

import { app, powerMonitor } from 'electron';
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { UpdateState } from '../shared/types';
import { describeUpdateError } from './policy';

const FIRST_CHECK_MS = 8_000;
const EVERY_MS = 4 * 60 * 60 * 1000;

/** A short log of what the updater did, for when an update doesn't arrive (userData/logs/updates.log). */
function logger() {
  const dir = join(app.getPath('userData'), 'logs');
  const file = join(dir, 'updates.log');
  const write = (level: string, msg: unknown) => {
    try {
      mkdirSync(dir, { recursive: true });
      try {
        if (statSync(file).size > 256_000) renameSync(file, `${file}.old`);
      } catch {
        // no log yet
      }
      appendFileSync(file, `${new Date().toISOString()} ${level} ${String(msg)}\n`);
    } catch {
      // Logging must never break updating.
    }
  };
  return {
    info: (m: unknown) => write('info', m),
    warn: (m: unknown) => write('warn', m),
    error: (m: unknown) => write('error', m),
    debug: () => undefined,
  };
}

export class Updates {
  state: UpdateState;
  private timer: NodeJS.Timeout | null = null;
  private updater: typeof import('electron-updater').autoUpdater | null = null;

  constructor(private changed: () => void) {
    const off = process.env.HANGAR_UPDATES === 'off';
    this.state = !app.isPackaged ? { phase: 'off', reason: 'source' } : off ? { phase: 'off', reason: 'switched-off' } : { phase: 'idle' };
    if (this.state.phase === 'off') return;
    // Loaded only when installed, so running from source never sets an updater up.
    const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');
    this.updater = autoUpdater;
    autoUpdater.logger = logger();
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.disableWebInstaller = true;
    autoUpdater.on('checking-for-update', () => {
      if (this.state.phase !== 'ready' && this.state.phase !== 'downloading') this.set({ phase: 'checking' });
    });
    autoUpdater.on('update-not-available', () => {
      if (this.state.phase !== 'ready') this.set({ phase: 'idle', checkedAt: Date.now() });
    });
    autoUpdater.on('update-available', (info) => this.set({ phase: 'downloading', version: info.version, percent: 0 }));
    autoUpdater.on('download-progress', (p) => {
      if (this.state.phase === 'downloading') this.set({ ...this.state, percent: Math.round(p.percent) });
    });
    autoUpdater.on('update-downloaded', (info) => this.set({ phase: 'ready', version: info.version }));
    autoUpdater.on('error', (err: Error) => {
      // A failed check never takes away an update that's already downloaded and waiting.
      if (this.state.phase === 'ready') return;
      this.set({ phase: 'error', message: describeUpdateError(err?.message ?? String(err)), checkedAt: Date.now() });
    });
    setTimeout(() => this.check(), FIRST_CHECK_MS);
    this.timer = setInterval(() => this.check(), EVERY_MS);
    // After a night asleep, look straight away rather than at the next four-hourly turn.
    powerMonitor.on('resume', () => setTimeout(() => this.check(), 15_000));
  }

  private set(state: UpdateState): void {
    this.state = state;
    this.changed();
  }

  check(): void {
    if (!this.updater || this.state.phase === 'checking' || this.state.phase === 'downloading') return;
    this.updater.checkForUpdates().catch(() => undefined); // failures arrive as 'error' events too
  }

  /** Quits, installs the waiting version without asking, and opens Hangar again. */
  restart(): void {
    if (!this.updater || this.state.phase !== 'ready') return;
    setImmediate(() => this.updater!.quitAndInstall(true, true));
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

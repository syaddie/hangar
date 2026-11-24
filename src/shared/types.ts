// What the main process and the shell window say to each other. The shell never sees Electron; it gets this state and
// sends these commands (src/preload/shell.ts).

/** One app in the hangar: a site Hangar keeps open in a view of its own. */
export interface AppEntry {
  /** Stable and never reused, so saved zoom and order survive a rename. */
  id: string;
  name: string;
  /** Where the app starts: an http(s) address, normalised by `normalizeUrl`. */
  url: string;
  /** A data: URL, taken from the app's web manifest once it has loaded (or bundled for the first two apps). */
  icon?: string;
  /** Whether the name came from the app itself (so a later manifest may refresh it) or was typed by the owner. */
  nameFrom?: 'manifest' | 'owner';
}

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemeChoice;
  openAtLogin: boolean;
}

export type AppStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Why an app couldn't be shown, in words for the owner. */
export interface AppError {
  /** Chromium's net error name, such as ERR_NAME_NOT_RESOLVED. */
  code: string;
  /** One sentence on what went wrong, from `describeLoadError`. */
  reason: string;
  host: string;
}

export interface AppState extends AppEntry {
  status: AppStatus;
  /** The page's own title, once it has one. */
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Percent: 100 is the page's own size. */
  zoom: number;
  error?: AppError;
}

export interface Download {
  id: string;
  name: string;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  /** 0 to 1, or null when the size isn't known. */
  progress: number | null;
}

export interface FindState {
  open: boolean;
  text: string;
  /** 1-based index of the highlighted match, 0 when none. */
  active: number;
  matches: number;
}

/**
 * Hangar's own updates (src/main/updates.ts). New versions download by themselves; "ready" is one waiting for a
 * restart, which also happens by itself the next time Hangar quits.
 */
export type UpdateState =
  | { phase: 'off'; reason: 'source' | 'switched-off' }
  | { phase: 'idle'; checkedAt?: number }
  | { phase: 'checking' }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string; checkedAt: number };

/** What's covering the app area, if anything. While a sheet is open the app is shown as a still behind it. */
export type Sheet = null | { kind: 'settings' } | { kind: 'add' } | { kind: 'edit'; id: string };

export interface ShellState {
  apps: AppState[];
  activeId: string | null;
  /** The theme in effect, after "system" is worked out. */
  theme: 'light' | 'dark';
  settings: Settings;
  sheet: Sheet;
  /** A still of the active app, shown behind a sheet. */
  backdrop: string | null;
  find: FindState;
  downloads: Download[];
  fullscreen: boolean;
  /** True until the first app has painted, while the launch drawing plays. */
  launching: boolean;
  version: string;
  /** Windows, macOS or Linux, for the window controls' space and key names. */
  platform: NodeJS.Platform;
  /** False when run from source (`npm start`), where opening at sign-in can't work. */
  packaged: boolean;
  update: UpdateState;
}

export type Command =
  | { type: 'switch'; id: string }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'reload' }
  | { type: 'home' }
  | { type: 'retry'; id: string }
  | { type: 'openExternal'; id?: string }
  | { type: 'appMenu'; id: string; x: number; y: number }
  | { type: 'openSheet'; sheet: Exclude<Sheet, null> }
  | { type: 'closeSheet' }
  | { type: 'addApp'; url: string; name?: string }
  | { type: 'updateApp'; id: string; url: string; name: string }
  | { type: 'removeApp'; id: string }
  | { type: 'moveApp'; id: string; to: number }
  | { type: 'setTheme'; theme: ThemeChoice }
  | { type: 'setOpenAtLogin'; on: boolean }
  | { type: 'find'; text: string; forward?: boolean; next?: boolean }
  | { type: 'closeFind' }
  | { type: 'zoom'; by: 'in' | 'out' | 'reset' }
  | { type: 'downloadsMenu'; x: number; y: number }
  | { type: 'showDownload'; id: string }
  | { type: 'openDownload'; id: string }
  | { type: 'clearDownloads' }
  | { type: 'focusApp' }
  | { type: 'checkForUpdates' }
  | { type: 'restartToUpdate' };

/** The answer to a command that can fail with something to tell the owner (adding or editing an app). */
export type CommandResult = { ok: true } | { ok: false; message: string };

/** The shell's sizes in px. The main process lays the app views out around them, so both read them from here. */
export const LAYOUT = {
  rail: 64,
  top: 44,
  /** The gap between the app and the window's right and bottom edges. */
  inset: 8,
  radius: 10,
} as const;

// The window and everything in it. One window holds the shell (the rail, the top bar and whatever the app area shows
// when no app is: the launch drawing, a failed load, a sheet) and, over the app area, one view per app. Each app's view
// stays alive once opened, so switching is instant and nothing is lost; only the active one is visible.
//
// All apps share one saved session ("persist:hangar"), so a Cloudflare Access sign-in on one app's domain carries to
// the next and stays across restarts. Links are routed by src/main/policy.ts: within an app or its sign-in they stay,
// to another app they switch to it, and anything else opens in the default browser.

import {
  app,
  BaseWindow,
  BrowserWindow,
  Menu,
  WebContentsView,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  screen,
  session,
  shell,
  type Rectangle,
  type Session,
  type WebContents,
} from 'electron';
import { join } from 'node:path';
import {
  LAYOUT,
  type AppEntry,
  type AppError,
  type AppState,
  type Command,
  type CommandResult,
  type FindState,
  type Sheet,
  type ShellState,
} from '../shared/types';
import * as P from './policy';
import { Store } from './store';
import { Downloads } from './downloads';
import { pageMenu } from './menus';

/** The chrome's colours, for what Electron paints itself: the window behind the views and the window controls. */
const CHROME = {
  light: { bg: '#e6e9ef', ink: '#161a22' },
  dark: { bg: '#0d1222', ink: '#e8ecf5' },
} as const;

const PARTITION = 'persist:hangar';

interface Bay {
  entry: AppEntry;
  view: WebContentsView | null;
  status: AppState['status'];
  title: string;
  error?: AppError;
  /** Has painted a page of its own at least once since it was last (re)loaded, so it's safe to show. */
  loaded: boolean;
  /** Set when the manifest has been read on this load, so it's read once per load. */
  manifestRead: boolean;
  retryTimer?: NodeJS.Timeout;
  retryDelay: number;
}

export interface HangarOptions {
  store: Store;
  dist: string;
  /** The window and taskbar icon. */
  icon: string;
  /** For the smoke test: open on a fixed spot. */
  bounds?: Rectangle;
}

export class Hangar {
  readonly win: BaseWindow;
  readonly shellView: WebContentsView;
  readonly ses: Session;
  private bays = new Map<string, Bay>();
  private store: Store;
  private sheet: Sheet = null;
  private backdrop: string | null = null;
  private find: FindState = { open: false, text: '', active: 0, matches: 0 };
  private downloads: Downloads;
  private launching = true;
  /** The app whose page asked for full screen (a video), so leaving it restores the window as it was. */
  private htmlFullscreen: string | null = null;
  private pushQueued = false;
  private preloaded = false;

  constructor(private opts: HangarOptions) {
    this.store = opts.store;
    const cfg = this.store.config;
    nativeTheme.themeSource = cfg.settings.theme;
    const c = this.chrome();

    const b = opts.bounds ?? this.restoredBounds();
    this.win = new BaseWindow({
      ...b,
      minWidth: 560,
      minHeight: 420,
      show: false,
      title: 'Hangar',
      icon: opts.icon,
      backgroundColor: c.bg,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: c.bg, symbolColor: c.ink, height: LAYOUT.top - 1 },
      trafficLightPosition: { x: 18, y: 15 },
    });
    if (!opts.bounds && cfg.window.maximized) this.win.maximize();

    this.ses = session.fromPartition(PARTITION);
    this.prepareSession();
    this.downloads = new Downloads(this.ses, () => this.push());

    this.shellView = new WebContentsView({
      webPreferences: {
        preload: join(opts.dist, 'preload', 'shell.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
        // Keep rendering while the window is hidden or covered, so it's current the moment it's seen again.
        backgroundThrottling: false,
      },
    });
    this.shellView.setBackgroundColor(c.bg);
    this.win.contentView.addChildView(this.shellView);
    this.wireShell();

    for (const entry of cfg.apps) this.bays.set(entry.id, this.newBay(entry));

    this.win.on('resize', () => this.layout());
    this.win.on('resize', () => this.rememberWindow());
    this.win.on('move', () => this.rememberWindow());
    this.win.on('maximize', () => this.rememberWindow());
    this.win.on('unmaximize', () => this.rememberWindow());
    this.win.on('enter-full-screen', () => this.layoutAndPush());
    this.win.on('leave-full-screen', () => {
      this.htmlFullscreen = null;
      this.layoutAndPush();
    });
    this.win.on('focus', () => this.focusActive());
    this.win.on('close', () => {
      this.rememberWindow();
      this.store.saveNow();
    });
    // The mouse's back and forward buttons, on Windows.
    this.win.on('app-command', (_e, cmd) => {
      if (cmd === 'browser-backward') this.activeWc()?.navigationHistory.goBack();
      if (cmd === 'browser-forward') this.activeWc()?.navigationHistory.goForward();
    });
    nativeTheme.on('updated', () => this.applyTheme());
    screen.on('display-removed', () => this.keepOnScreen());

    this.layout();
    void this.shellView.webContents.loadFile(join(opts.dist, 'shell', 'index.html'));
    this.shellView.webContents.once('did-finish-load', () => {
      this.win.show();
      this.activate(cfg.activeId);
    });
  }

  // ---- Session: one for every app ----

  private prepareSession(): void {
    const ses = this.ses;
    ses.setUserAgent(P.browserUserAgent(ses.getUserAgent()));
    const allowed = new Set([
      'notifications',
      'clipboard-read',
      'clipboard-sanitized-write',
      'fullscreen',
      'pointerLock',
      'window-management',
    ]);
    const fromApp = (url: string | undefined) => !!url && !!P.appForUrl(url, this.entries());
    ses.setPermissionRequestHandler((_wc, permission, done, details) => {
      done(allowed.has(permission) && fromApp(details.requestingUrl));
    });
    ses.setPermissionCheckHandler((_wc, permission, origin) => allowed.has(permission) && fromApp(origin));
    ses.setSpellCheckerLanguages(['en-GB', 'en-US'].filter((l) => ses.availableSpellCheckerLanguages.includes(l)));
  }

  // ---- The shell ----

  private wireShell(): void {
    const wc = this.shellView.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e) => e.preventDefault());
    wc.on('before-input-event', (e, input) => {
      const s = P.shortcutFor(input, process.platform);
      if (!s) return;
      e.preventDefault();
      if (s.type === 'devtools') wc.openDevTools({ mode: 'detach' });
      else this.runShortcut(s);
    });
    ipcMain.handle('hangar:state', (e) => (e.sender === wc ? this.state() : null));
    ipcMain.handle('hangar:command', (e, cmd: Command) => (e.sender === wc ? this.command(cmd) : null));
  }

  private push(): void {
    if (this.pushQueued) return;
    this.pushQueued = true;
    setImmediate(() => {
      this.pushQueued = false;
      if (this.shellView.webContents.isDestroyed()) return;
      this.shellView.webContents.send('hangar:state', this.state());
      this.updateTitle();
    });
  }

  state(): ShellState {
    const zoom = this.store.config.zoom;
    return {
      apps: [...this.bays.values()].map((b) => {
        const h = b.view?.webContents.navigationHistory;
        return {
          ...b.entry,
          status: b.status,
          title: b.title,
          canGoBack: !!h?.canGoBack(),
          canGoForward: !!h?.canGoForward(),
          zoom: zoom[b.entry.id] ?? 100,
          ...(b.error ? { error: b.error } : {}),
        };
      }),
      activeId: this.store.config.activeId,
      theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
      settings: this.store.config.settings,
      sheet: this.sheet,
      backdrop: this.backdrop,
      find: this.find,
      downloads: this.downloads.all,
      fullscreen: this.win.isFullScreen(),
      launching: this.launching,
      version: app.getVersion(),
      platform: process.platform,
      packaged: app.isPackaged,
    };
  }

  // ---- Bays: one per app ----

  private entries(): AppEntry[] {
    return this.store.config.apps;
  }

  private newBay(entry: AppEntry): Bay {
    return { entry, view: null, status: 'idle', title: '', loaded: false, manifestRead: false, retryDelay: 4000 };
  }

  private active(): Bay | undefined {
    const id = this.store.config.activeId;
    return id ? this.bays.get(id) : undefined;
  }

  private activeWc(): WebContents | undefined {
    const wc = this.active()?.view?.webContents;
    return wc && !wc.isDestroyed() ? wc : undefined;
  }

  /** Makes the app's view and starts loading it. */
  private open(bay: Bay, url = bay.entry.url): void {
    if (bay.view) return;
    const view = new WebContentsView({
      webPreferences: {
        session: this.ses,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        plugins: true, // Chromium's PDF viewer, for files an app shows (Launchpad's Files)
        spellcheck: true,
      },
    });
    bay.view = view;
    view.setBackgroundColor(this.chrome().bg);
    view.setBorderRadius(LAYOUT.radius);
    view.setVisible(false);
    this.win.contentView.addChildView(view);
    this.wireApp(bay, view.webContents);
    this.layout();
    this.load(bay, url);
  }

  private load(bay: Bay, url: string): void {
    const wc = bay.view?.webContents;
    if (!wc || wc.isDestroyed()) return;
    bay.loaded = false;
    bay.manifestRead = false;
    bay.status = 'loading';
    this.syncViews();
    this.push();
    // Failures arrive through did-fail-load; the promise's rejection is the same news.
    wc.loadURL(url).catch(() => undefined);
  }

  private wireApp(bay: Bay, wc: WebContents): void {
    const id = bay.entry.id;
    const zoomNow = () => wc.setZoomFactor((this.store.config.zoom[id] ?? 100) / 100);

    wc.setWindowOpenHandler(({ url }) => {
      const route = P.routeNewWindow(url, this.entries());
      if (route.kind === 'app' && route.id === id) return this.popupOptions();
      if (route.kind === 'stay') return this.popupOptions(); // a sign-in popup: it needs its opener
      this.follow(route);
      return { action: 'deny' };
    });
    wc.on('did-create-window', (popup) => this.adoptPopup(popup, bay));

    wc.on('will-navigate', (e) => {
      const route = P.routeNavigation(wc.getURL(), e.url, bay.entry, this.entries());
      if (route.kind === 'stay') return;
      e.preventDefault();
      this.follow(route);
    });

    wc.on('did-start-loading', () => {
      bay.status = 'loading';
      this.push();
    });
    wc.on('did-stop-loading', () => {
      if (bay.status === 'loading') bay.status = bay.error ? 'error' : 'ready';
      this.push();
    });
    wc.on('dom-ready', () => this.revealSoon(bay));
    wc.on('did-finish-load', () => {
      this.reveal(bay);
      void this.readManifest(bay);
    });
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      // -3 is a navigation that was stopped or replaced (a download, a newer click), not a failure.
      if (!isMainFrame || code === -3) return;
      bay.error = { ...P.describeLoadError(description, P.hostOf(url || bay.entry.url)), host: P.hostOf(url) };
      bay.status = 'error';
      bay.loaded = false;
      this.settleLaunch(bay);
      this.syncViews();
      this.scheduleRetry(bay);
      this.push();
    });
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return;
      bay.error = {
        code: details.reason.toUpperCase().replace(/-/g, '_'),
        reason: `${bay.entry.name} stopped working. Try again to reload it.`,
        host: P.hostOf(bay.entry.url),
      };
      bay.status = 'error';
      bay.loaded = false;
      this.syncViews();
      this.push();
    });
    wc.on('page-title-updated', (_e, title) => {
      bay.title = title;
      this.push();
    });
    wc.on('did-navigate', () => {
      zoomNow();
      this.push();
    });
    wc.on('did-navigate-in-page', () => this.push());
    wc.on('zoom-changed', (_e, direction) => this.zoom(direction, bay));
    wc.on('found-in-page', (_e, result) => {
      if (bay !== this.active()) return;
      this.find = { ...this.find, active: result.activeMatchOrdinal, matches: result.matches };
      this.push();
    });
    wc.on('before-input-event', (e, input) => {
      const s = P.shortcutFor(input, process.platform);
      if (!s) return;
      e.preventDefault();
      if (s.type === 'devtools') wc.openDevTools({ mode: 'detach' });
      else this.runShortcut(s);
    });
    wc.on('context-menu', (_e, params) => {
      pageMenu(params, wc, {
        openLink: (url) => this.follow(P.routeNewWindow(url, this.entries())),
        appNameFor: (url) => {
          const other = P.appForUrl(url, this.entries());
          return other && other.id !== id ? other.name : null;
        },
        openPageExternally: () => void shell.openExternal(wc.getURL()),
      })?.popup({ window: this.win });
    });
    wc.on('enter-html-full-screen', () => {
      this.htmlFullscreen = id;
      if (!this.win.isFullScreen()) this.win.setFullScreen(true);
      this.layoutAndPush();
    });
    wc.on('leave-html-full-screen', () => {
      if (this.htmlFullscreen && this.win.isFullScreen()) this.win.setFullScreen(false);
      this.htmlFullscreen = null;
      this.layoutAndPush();
    });
    zoomNow();
  }

  private popupOptions() {
    const c = this.chrome();
    return {
      action: 'allow' as const,
      overrideBrowserWindowOptions: {
        width: 980,
        height: 760,
        autoHideMenuBar: true,
        backgroundColor: c.bg,
        icon: this.opts.icon,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, plugins: true },
      },
    };
  }

  /** A window an app opened on itself (a file, a sign-in popup): the same link rules and menus as the app. */
  private adoptPopup(popup: BrowserWindow, bay: Bay): void {
    popup.setMenuBarVisibility(false);
    const wc = popup.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      const route = P.routeNewWindow(url, this.entries());
      if (route.kind === 'stay' || (route.kind === 'app' && route.id === bay.entry.id)) {
        void wc.loadURL(url);
      } else this.follow(route);
      return { action: 'deny' };
    });
    wc.on('context-menu', (_e, params) => {
      pageMenu(params, wc, {
        openLink: (url) => this.follow(P.routeNewWindow(url, this.entries())),
        appNameFor: (url) => P.appForUrl(url, this.entries())?.name ?? null,
        openPageExternally: () => void shell.openExternal(wc.getURL()),
      })?.popup({ window: popup });
    });
  }

  /** Shows a page that has its structure but may still be fetching images, rather than wait for every last one. */
  private revealSoon(bay: Bay): void {
    setTimeout(() => {
      if (!bay.loaded && !bay.error && bay.view?.webContents.getURL()) this.reveal(bay);
    }, 350);
  }

  private reveal(bay: Bay): void {
    if (bay.error && bay.status === 'error') return;
    bay.error = undefined;
    bay.retryDelay = 4000;
    this.clearRetry(bay);
    bay.loaded = true;
    if (bay.status === 'error') bay.status = 'ready';
    const wasHidden = !bay.view?.getVisible();
    this.settleLaunch(bay);
    this.syncViews();
    this.push();
    // The app that just appeared takes the keyboard, so typing goes straight to it.
    if (wasHidden && bay === this.active() && this.win.isFocused()) this.focusActive();
    this.preloadOthers();
  }

  /** The launch drawing ends when the first app has something to show, or can't. */
  private settleLaunch(bay: Bay): void {
    if (this.launching && bay === this.active()) {
      this.launching = false;
      this.push();
    }
  }

  /** Once the first app is up, the rest load behind it, so switching to them is instant. */
  private preloadOthers(): void {
    if (this.preloaded) return;
    this.preloaded = true;
    setTimeout(() => {
      for (const b of this.bays.values()) if (!b.view) this.open(b);
    }, 1500);
  }

  private clearRetry(bay: Bay): void {
    if (bay.retryTimer) clearTimeout(bay.retryTimer);
    bay.retryTimer = undefined;
  }

  private scheduleRetry(bay: Bay): void {
    if (!bay.error || !P.isTransient(bay.error.code)) return;
    this.clearRetry(bay);
    bay.retryTimer = setTimeout(() => {
      bay.retryTimer = undefined;
      if (!this.bays.has(bay.entry.id) || !bay.error) return;
      if (net.isOnline()) this.load(bay, bay.entry.url);
      else this.scheduleRetry(bay);
    }, bay.retryDelay);
    bay.retryDelay = Math.min(bay.retryDelay * 2, 60_000);
  }

  /** Reads the app's web manifest from inside its page (so its sign-in cookies go with it) for its name and icon. */
  private async readManifest(bay: Bay): Promise<void> {
    const wc = bay.view?.webContents;
    if (!wc || wc.isDestroyed() || bay.manifestRead) return;
    if (P.originOf(wc.getURL()) !== P.originOf(bay.entry.url)) return; // still on a sign-in page
    bay.manifestRead = true;
    try {
      const found = (await wc.executeJavaScript(
        `(async () => {
          const link = document.querySelector('link[rel~="manifest"]');
          if (!link) return null;
          const res = await fetch(link.href, { credentials: 'include' });
          if (!res.ok) return null;
          return { manifest: await res.json(), url: link.href };
        })()`,
      )) as { manifest: unknown; url: string } | null;
      if (!found) return;
      const iconUrl = P.pickManifestIcon(found.manifest, found.url);
      const name = P.manifestName(found.manifest);
      let changed = false;
      if (name && bay.entry.nameFrom !== 'owner' && name !== bay.entry.name) {
        bay.entry.name = name;
        bay.entry.nameFrom = 'manifest';
        changed = true;
      }
      if (iconUrl && P.originOf(iconUrl) === P.originOf(bay.entry.url)) {
        const icon = (await wc.executeJavaScript(
          `(async () => {
            const res = await fetch(${JSON.stringify(iconUrl)}, { credentials: 'include' });
            if (!res.ok) return null;
            const blob = await res.blob();
            if (!blob.type.startsWith('image/') || blob.size > 300000) return null;
            return await new Promise((done) => {
              const r = new FileReader();
              r.onload = () => done(r.result);
              r.onerror = () => done(null);
              r.readAsDataURL(blob);
            });
          })()`,
        )) as string | null;
        if (icon && icon.startsWith('data:image/') && icon !== bay.entry.icon) {
          bay.entry.icon = icon;
          changed = true;
        }
      }
      if (changed) {
        this.store.save();
        this.push();
      }
    } catch {
      // No manifest, or not JSON: the app keeps the name and icon it has.
    }
  }

  // ---- Showing the right thing ----

  activate(id: string | null | undefined): void {
    const bay = (id && this.bays.get(id)) || [...this.bays.values()][0];
    if (this.sheet) this.closeSheet(false);
    if (this.find.open) this.closeFind();
    if (!bay) {
      this.store.config.activeId = null;
      this.launching = false;
      this.syncViews();
      this.push();
      return;
    }
    this.store.config.activeId = bay.entry.id;
    this.store.save();
    if (!bay.view) this.open(bay);
    else if (bay.error && bay.status !== 'loading') {
      // Opening an app that failed tries it again now, rather than at its next automatic retry.
      this.clearRetry(bay);
      this.load(bay, bay.entry.url);
    }
    this.syncViews();
    this.push();
    this.focusActive();
  }

  /** Only the active app's view is visible, and only when it has a page to show and nothing covers it. */
  private syncViews(): void {
    const activeId = this.store.config.activeId;
    for (const b of this.bays.values()) {
      b.view?.setVisible(b.entry.id === activeId && !this.sheet && b.loaded && !b.error);
    }
  }

  private focusActive(): void {
    const bay = this.active();
    if (this.sheet || this.find.open || !bay?.loaded || bay.error) return;
    bay.view?.webContents.focus();
  }

  private layout(): void {
    const [w, h] = this.win.getContentSize() as [number, number];
    this.shellView.setBounds({ x: 0, y: 0, width: w, height: h });
    const full = this.win.isFullScreen();
    const area: Rectangle = full
      ? { x: 0, y: 0, width: w, height: h }
      : {
          x: LAYOUT.rail,
          y: LAYOUT.top,
          width: Math.max(0, w - LAYOUT.rail - LAYOUT.inset),
          height: Math.max(0, h - LAYOUT.top - LAYOUT.inset),
        };
    for (const b of this.bays.values()) {
      b.view?.setBounds(area);
      b.view?.setBorderRadius(full ? 0 : LAYOUT.radius);
    }
  }

  private layoutAndPush(): void {
    this.layout();
    this.push();
  }

  private chrome() {
    return nativeTheme.shouldUseDarkColors ? CHROME.dark : CHROME.light;
  }

  private applyTheme(): void {
    const c = this.chrome();
    this.win.setBackgroundColor(c.bg);
    this.shellView.setBackgroundColor(c.bg);
    if (process.platform !== 'darwin') {
      this.win.setTitleBarOverlay({ color: c.bg, symbolColor: c.ink, height: LAYOUT.top - 1 });
    }
    for (const b of this.bays.values()) b.view?.setBackgroundColor(c.bg);
    this.push();
  }

  private updateTitle(): void {
    const bay = this.active();
    this.win.setTitle(bay ? `${bay.entry.name} – Hangar` : 'Hangar');
  }

  // ---- The window's place ----

  private restoredBounds(): Rectangle | { width: number; height: number } {
    const w = this.store.config.window;
    const size = { width: w.width, height: w.height };
    if (w.x === undefined || w.y === undefined) return size;
    const rect = { x: w.x, y: w.y, ...size };
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return rect.x + 120 < a.x + a.width && rect.x + rect.width - 120 > a.x && rect.y >= a.y - 8 && rect.y + 40 < a.y + a.height;
    });
    return visible ? rect : size;
  }

  private keepOnScreen(): void {
    const b = this.win.getBounds();
    const a = screen.getDisplayMatching(b).workArea;
    if (b.x > a.x + a.width - 120 || b.y > a.y + a.height - 40) this.win.center();
  }

  private rememberWindow(): void {
    if (this.opts.bounds || this.win.isFullScreen() || this.win.isMinimized()) return;
    const n = this.win.getNormalBounds();
    this.store.config.window = { x: n.x, y: n.y, width: n.width, height: n.height, maximized: this.win.isMaximized() };
    this.store.save();
  }

  // ---- Links that leave an app ----

  private follow(route: P.Route): void {
    if (route.kind === 'external') void shell.openExternal(route.url);
    if (route.kind === 'app') {
      const bay = this.bays.get(route.id);
      if (!bay) return;
      if (!bay.view) {
        this.store.config.activeId = route.id;
        this.open(bay, route.url);
        this.activate(route.id);
      } else {
        this.load(bay, route.url);
        this.activate(route.id);
      }
    }
  }

  // ---- Keys and commands ----

  private runShortcut(s: P.Shortcut): void {
    const ids = [...this.bays.keys()];
    const at = ids.indexOf(this.store.config.activeId ?? '');
    switch (s.type) {
      case 'switchIndex':
        if (ids[s.index]) this.activate(ids[s.index]);
        return;
      case 'switchLast':
        if (ids.length) this.activate(ids[ids.length - 1]);
        return;
      case 'next':
      case 'previous': {
        if (ids.length < 2) return;
        const step = s.type === 'next' ? 1 : -1;
        this.activate(ids[(at + step + ids.length) % ids.length]);
        return;
      }
      case 'reload':
      case 'hardReload':
        this.reload(s.type === 'hardReload');
        return;
      case 'back':
        this.activeWc()?.navigationHistory.goBack();
        return;
      case 'forward':
        this.activeWc()?.navigationHistory.goForward();
        return;
      case 'find':
        this.openFind();
        return;
      case 'zoom':
        this.zoom(s.by);
        return;
      case 'settings':
        void this.openSheet({ kind: 'settings' });
        return;
      case 'addApp':
        void this.openSheet({ kind: 'add' });
        return;
      case 'fullscreen':
        this.win.setFullScreen(!this.win.isFullScreen());
        return;
    }
  }

  private reload(hard = false): void {
    const bay = this.active();
    if (!bay) return;
    if (!bay.view) return this.open(bay);
    if (bay.error) return this.load(bay, bay.entry.url);
    if (hard) bay.view.webContents.reloadIgnoringCache();
    else bay.view.webContents.reload();
  }

  private zoom(by: 'in' | 'out' | 'reset', bay = this.active()): void {
    if (!bay) return;
    const id = bay.entry.id;
    const next = P.stepZoom(this.store.config.zoom[id] ?? 100, by);
    if (next === 100) delete this.store.config.zoom[id];
    else this.store.config.zoom[id] = next;
    bay.view?.webContents.setZoomFactor(next / 100);
    this.store.save();
    this.push();
  }

  private openFind(): void {
    if (!this.activeWc() || this.sheet) return;
    this.find = { ...this.find, open: true };
    this.push();
    this.shellView.webContents.focus();
  }

  private closeFind(): void {
    this.activeWc()?.stopFindInPage('keepSelection');
    this.find = { open: false, text: this.find.text, active: 0, matches: 0 };
    this.push();
  }

  private async openSheet(sheet: Exclude<Sheet, null>): Promise<void> {
    if (this.find.open) this.closeFind();
    const bay = this.active();
    const wasShowing = !this.sheet && !!bay?.view && bay.loaded && !bay.error;
    if (wasShowing) {
      try {
        const still = await bay!.view!.webContents.capturePage();
        this.backdrop = still.isEmpty() ? null : `data:image/jpeg;base64,${still.toJPEG(82).toString('base64')}`;
      } catch {
        this.backdrop = null;
      }
    } else if (!this.sheet) this.backdrop = null;
    this.sheet = sheet;
    this.syncViews();
    this.push();
    this.shellView.webContents.focus();
  }

  private closeSheet(refocus = true): void {
    this.sheet = null;
    this.backdrop = null;
    this.syncViews();
    this.push();
    if (refocus) this.focusActive();
  }

  async command(cmd: Command): Promise<CommandResult> {
    switch (cmd.type) {
      case 'switch':
        this.activate(cmd.id);
        break;
      case 'back':
        this.activeWc()?.navigationHistory.goBack();
        break;
      case 'forward':
        this.activeWc()?.navigationHistory.goForward();
        break;
      case 'reload':
        this.reload();
        break;
      case 'home': {
        const bay = this.active();
        if (bay?.view) this.load(bay, bay.entry.url);
        break;
      }
      case 'retry': {
        const bay = this.bays.get(cmd.id);
        if (bay) {
          bay.retryDelay = 4000;
          this.clearRetry(bay);
          if (!bay.view) this.open(bay);
          else this.load(bay, bay.entry.url);
        }
        break;
      }
      case 'openExternal': {
        const bay = cmd.id ? this.bays.get(cmd.id) : this.active();
        const url = bay?.view?.webContents.getURL() || bay?.entry.url;
        if (url && /^https?:/.test(url)) await shell.openExternal(url);
        break;
      }
      case 'appMenu':
        this.appMenu(cmd.id, cmd.x, cmd.y);
        break;
      case 'openSheet':
        await this.openSheet(cmd.sheet);
        break;
      case 'closeSheet':
        this.closeSheet();
        break;
      case 'addApp':
        return this.addApp(cmd.url, cmd.name);
      case 'updateApp':
        return this.updateApp(cmd.id, cmd.url, cmd.name);
      case 'removeApp':
        this.removeApp(cmd.id);
        break;
      case 'moveApp':
        this.moveApp(cmd.id, cmd.to);
        break;
      case 'setTheme':
        this.store.config.settings = { ...this.store.config.settings, theme: cmd.theme };
        nativeTheme.themeSource = cmd.theme;
        this.store.save();
        this.applyTheme();
        break;
      case 'setOpenAtLogin':
        if (!app.isPackaged) return { ok: false, message: 'Only the installed Hangar can open when you sign in.' };
        app.setLoginItemSettings({ openAtLogin: cmd.on });
        this.store.config.settings = { ...this.store.config.settings, openAtLogin: cmd.on };
        this.store.save();
        this.push();
        break;
      case 'find': {
        const wc = this.activeWc();
        if (!wc) break;
        const text = cmd.text;
        this.find = { ...this.find, open: true, text };
        if (!text) {
          wc.stopFindInPage('clearSelection');
          this.find = { ...this.find, active: 0, matches: 0 };
        } else {
          wc.findInPage(text, { forward: cmd.forward !== false, findNext: !cmd.next });
        }
        this.push();
        break;
      }
      case 'closeFind':
        this.closeFind();
        this.focusActive();
        break;
      case 'zoom':
        this.zoom(cmd.by);
        break;
      case 'downloadsMenu':
        this.downloadsMenu(cmd.x, cmd.y);
        break;
      case 'showDownload':
        this.downloads.show(cmd.id);
        break;
      case 'openDownload':
        await this.downloads.open(cmd.id);
        break;
      case 'clearDownloads':
        this.downloads.clear();
        break;
      case 'focusApp':
        this.focusActive();
        break;
    }
    return { ok: true };
  }

  private addApp(input: string, name?: string): CommandResult {
    const n = P.normalizeUrl(input);
    if (!n.ok) return n;
    const clash = P.appForUrl(n.url, this.entries());
    if (clash) return { ok: false, message: `${clash.name} already opens ${P.hostOf(n.url)}.` };
    const cfg = this.store.config;
    const typed = name?.trim();
    const id = P.newId(typed || P.nameFromUrl(n.url), [...cfg.apps.map((a) => a.id), ...cfg.retired]);
    const entry: AppEntry = {
      id,
      name: (typed || P.nameFromUrl(n.url)).slice(0, 40),
      url: n.url,
      nameFrom: typed ? 'owner' : 'manifest',
    };
    cfg.apps.push(entry);
    this.bays.set(id, this.newBay(entry));
    this.store.save();
    this.sheet = null;
    this.backdrop = null;
    this.activate(id);
    return { ok: true };
  }

  private updateApp(id: string, input: string, name: string): CommandResult {
    const bay = this.bays.get(id);
    if (!bay) return { ok: false, message: 'That app isn’t in Hangar any more.' };
    const n = P.normalizeUrl(input);
    if (!n.ok) return n;
    const clash = P.appForUrl(n.url, this.entries());
    if (clash && clash.id !== id) return { ok: false, message: `${clash.name} already opens ${P.hostOf(n.url)}.` };
    const typed = name.trim().slice(0, 40);
    if (typed && typed !== bay.entry.name) {
      bay.entry.name = typed;
      bay.entry.nameFrom = 'owner';
    } else if (!typed) {
      bay.entry.nameFrom = 'manifest';
    }
    const moved = P.originOf(n.url) !== P.originOf(bay.entry.url);
    bay.entry.url = n.url;
    if (moved) delete bay.entry.icon;
    this.store.save();
    if (moved && bay.view) this.load(bay, n.url);
    this.push();
    return { ok: true };
  }

  private removeApp(id: string): void {
    const bay = this.bays.get(id);
    if (!bay) return;
    const cfg = this.store.config;
    const at = cfg.apps.findIndex((a) => a.id === id);
    cfg.apps = cfg.apps.filter((a) => a.id !== id);
    cfg.retired = [...cfg.retired, id];
    delete cfg.zoom[id];
    if (bay.retryTimer) clearTimeout(bay.retryTimer);
    if (bay.view) {
      this.win.contentView.removeChildView(bay.view);
      bay.view.webContents.close();
    }
    this.bays.delete(id);
    // Rebuild the map in the saved order (Map keeps insertion order, which is the rail's).
    const order = new Map(cfg.apps.map((a) => [a.id, this.bays.get(a.id)!]));
    this.bays = order;
    if (this.sheet?.kind === 'edit' && this.sheet.id === id) this.sheet = { kind: 'settings' };
    if (cfg.activeId === id) {
      cfg.activeId = null;
      const next = cfg.apps[Math.min(at, cfg.apps.length - 1)];
      if (this.sheet) {
        cfg.activeId = next?.id ?? null;
        if (next && !this.bays.get(next.id)?.view) this.open(this.bays.get(next.id)!);
      } else this.activate(next?.id ?? null);
    }
    this.store.save();
    this.syncViews();
    this.push();
  }

  private moveApp(id: string, to: number): void {
    const cfg = this.store.config;
    const from = cfg.apps.findIndex((a) => a.id === id);
    if (from < 0) return;
    cfg.apps = P.moveItem(cfg.apps, from, to);
    this.bays = new Map(cfg.apps.map((a) => [a.id, this.bays.get(a.id)!]));
    this.store.save();
    this.push();
  }

  private downloadsMenu(x: number, y: number): void {
    const list = this.downloads.all;
    const items: Electron.MenuItemConstructorOptions[] = list.map((d) => {
      const pct = d.progress === null ? '' : ` (${Math.round(d.progress * 100)}%)`;
      if (d.state === 'progressing') return { label: `${d.name}${pct}`, enabled: false };
      if (d.state !== 'completed') return { label: `${d.name}: didn’t finish`, enabled: false };
      return {
        label: d.name,
        submenu: [
          { label: 'Open', click: () => void this.downloads.open(d.id) },
          { label: 'Show in folder', click: () => this.downloads.show(d.id) },
        ],
      };
    });
    if (!items.length) items.push({ label: 'Nothing downloaded yet', enabled: false });
    items.push(
      { type: 'separator' },
      { label: 'Open the Downloads folder', click: () => void shell.openPath(app.getPath('downloads')) },
      { label: 'Clear the list', enabled: list.some((d) => d.state !== 'progressing'), click: () => this.downloads.clear() },
    );
    Menu.buildFromTemplate(items).popup({ window: this.win, x: Math.round(x), y: Math.round(y) });
  }

  private appMenu(id: string, x: number, y: number): void {
    const bay = this.bays.get(id);
    if (!bay) return;
    const ids = [...this.bays.keys()];
    const at = ids.indexOf(id);
    const wc = bay.view?.webContents;
    const name = bay.entry.name;
    Menu.buildFromTemplate([
      { label: `Open ${name}`, enabled: this.store.config.activeId !== id, click: () => this.activate(id) },
      {
        label: 'Reload',
        click: () => {
          if (!bay.view) this.open(bay);
          else if (bay.error) this.load(bay, bay.entry.url);
          else bay.view.webContents.reload();
        },
      },
      { label: 'Go to its start page', enabled: !!wc, click: () => this.load(bay, bay.entry.url) },
      { type: 'separator' },
      { label: 'Open in browser', click: () => void shell.openExternal(wc?.getURL() || bay.entry.url) },
      { label: 'Copy address', click: () => clipboard.writeText(wc?.getURL() || bay.entry.url) },
      { type: 'separator' },
      { label: 'Move up', enabled: at > 0, click: () => this.moveApp(id, at - 1) },
      { label: 'Move down', enabled: at < ids.length - 1, click: () => this.moveApp(id, at + 1) },
      { label: 'Edit…', click: () => void this.openSheet({ kind: 'edit', id }) },
      { type: 'separator' },
      {
        label: `Remove ${name}…`,
        click: async () => {
          const { response } = await dialog.showMessageBox(this.win, {
            type: 'question',
            buttons: ['Remove', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
            title: 'Remove from Hangar',
            message: `Remove ${name} from Hangar?`,
            detail: `Its bay goes. ${name} itself and your sign-in to it are kept, so adding it back later picks up where you were.`,
          });
          if (response === 0) this.removeApp(id);
        },
      },
    ]).popup({ window: this.win, x: Math.round(x), y: Math.round(y) });
  }
}

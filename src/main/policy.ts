// Hangar's rules, as plain functions with no Electron in them, so they're tested on their own (test/policy.test.ts):
// what counts as an app's address, where a link goes, which keys do what, how a failed load is put into words, which
// manifest icon to use, and what a saved config may hold.

import type { AppEntry, Settings, ThemeChoice } from '../shared/types';

// ---- Addresses ----

export type Normalized = { ok: true; url: string } | { ok: false; message: string };

const LOCAL_HOSTS = /^(localhost|127(\.\d{1,3}){3}|\[::1\]|[a-z0-9-]+\.(localhost|test|local))$/i;

/**
 * Turns what the owner typed into an app address: "apogee.syaddy.com" becomes "https://apogee.syaddy.com/", and a local
 * address with no scheme ("localhost:4310") gets http. Only http and https are apps.
 */
export function normalizeUrl(input: string): Normalized {
  const text = input.trim();
  if (!text) return { ok: false, message: 'Type the app’s address, such as apogee.syaddy.com.' };
  let candidate = text;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    const host = candidate.split(/[/?#]/)[0]!.replace(/:\d+$/, '');
    candidate = `${LOCAL_HOSTS.test(host) ? 'http' : 'https'}://${candidate}`;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, message: `“${text}” isn’t a web address.` };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, message: 'Only web addresses (http or https) can be apps.' };
  }
  if (!url.hostname || (!url.hostname.includes('.') && !LOCAL_HOSTS.test(url.hostname))) {
    return { ok: false, message: `“${text}” isn’t a web address.` };
  }
  if (url.username || url.password) {
    return { ok: false, message: 'Leave the sign-in out of the address; the app asks for it itself.' };
  }
  url.hash = '';
  return { ok: true, url: url.href };
}

export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The app an address belongs to: the one on the same origin (scheme, host and port). */
export function appForUrl<T extends Pick<AppEntry, 'url'>>(url: string, apps: readonly T[]): T | undefined {
  const origin = originOf(url);
  if (!origin) return undefined;
  return apps.find((a) => originOf(a.url) === origin);
}

// ---- Where links go ----

/** Sign-in pages an app may send you to and that must open inside it, so the sign-in lands back in the app. */
export function isSignInHost(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const h = u.hostname.toLowerCase();
  return (
    h.endsWith('.cloudflareaccess.com') ||
    h === 'accounts.google.com' ||
    h === 'login.microsoftonline.com' ||
    (h === 'github.com' && u.pathname.startsWith('/login'))
  );
}

export type Route =
  | { kind: 'stay' }
  | { kind: 'app'; id: string; url: string }
  | { kind: 'external'; url: string }
  | { kind: 'block' };

const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:', 'obsidian:', 'ms-outlook:', 'msteams:']);

function external(url: string): Route {
  try {
    return EXTERNAL_SCHEMES.has(new URL(url).protocol) ? { kind: 'external', url } : { kind: 'block' };
  } catch {
    return { kind: 'block' };
  }
}

/**
 * A link that asks for a new window (target="_blank", window.open). An address of one of the apps opens in that app,
 * a sign-in page opens in place, and anything else goes to the default browser.
 */
export function routeNewWindow(url: string, apps: readonly AppEntry[]): Route {
  const app = appForUrl(url, apps);
  if (app) return { kind: 'app', id: app.id, url };
  if (isSignInHost(url)) return { kind: 'stay' };
  return external(url);
}

/**
 * The page in an app's view going somewhere else by itself (a link without a target, a form, a script). Server
 * redirects never come here, so an app's own sign-in redirects always go through.
 *
 * - Within the app's origin, and on sign-in pages: it stays.
 * - Away from a page that isn't the app's own (the sign-in pages' own steps, an identity provider): it stays, so a
 *   sign-in can finish.
 * - To another app: that app opens at the address.
 * - Anywhere else: the default browser, and the app stays where it was.
 */
export function routeNavigation(from: string, to: string, app: AppEntry, apps: readonly AppEntry[]): Route {
  const home = originOf(app.url);
  const target = originOf(to);
  if (!target) {
    if (to.startsWith('about:blank')) return { kind: 'stay' };
    return external(to);
  }
  if (target === home) return { kind: 'stay' };
  if (isSignInHost(to)) return { kind: 'stay' };
  const fromOrigin = originOf(from);
  if (fromOrigin && fromOrigin !== home) return { kind: 'stay' };
  if (!from || from === 'about:blank') return { kind: 'stay' };
  const other = appForUrl(to, apps);
  if (other) return { kind: 'app', id: other.id, url: to };
  return external(to);
}

// ---- Keys ----

export type Shortcut =
  | { type: 'switchIndex'; index: number }
  | { type: 'switchLast' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'reload' }
  | { type: 'hardReload' }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'find' }
  | { type: 'zoom'; by: 'in' | 'out' | 'reset' }
  | { type: 'settings' }
  | { type: 'addApp' }
  | { type: 'fullscreen' }
  | { type: 'devtools' };

export interface KeyInput {
  type: string;
  key: string;
  code?: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

/**
 * The keys Hangar answers, before the page sees them. "Mod" is Ctrl (Cmd on a Mac). Everything else goes to the app as
 * usual, so the apps' own shortcuts keep working.
 */
export function shortcutFor(input: KeyInput, platform: NodeJS.Platform): Shortcut | null {
  if (input.type !== 'keyDown') return null;
  const mod = platform === 'darwin' ? input.meta : input.control;
  const key = input.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;

  if (mod && !input.alt && /^Digit[1-9]$/.test(input.code ?? '')) {
    const n = Number(input.code!.slice(5));
    return n === 9 ? { type: 'switchLast' } : { type: 'switchIndex', index: n - 1 };
  }
  if (input.control && !input.alt && key === 'Tab') return input.shift ? { type: 'previous' } : { type: 'next' };
  if (mod && !input.alt && (key === 'PageDown' || key === 'PageUp') && !input.shift) {
    return key === 'PageDown' ? { type: 'next' } : { type: 'previous' };
  }
  if (key === 'F5') return input.control || input.shift ? { type: 'hardReload' } : { type: 'reload' };
  if (mod && !input.alt && lower === 'r') return input.shift ? { type: 'hardReload' } : { type: 'reload' };
  if (input.alt && !mod && key === 'ArrowLeft') return { type: 'back' };
  if (input.alt && !mod && key === 'ArrowRight') return { type: 'forward' };
  if (mod && !input.alt && !input.shift && lower === 'f') return { type: 'find' };
  if (mod && !input.alt && (key === '=' || key === '+')) return { type: 'zoom', by: 'in' };
  if (mod && !input.alt && (key === '-' || key === '_')) return { type: 'zoom', by: 'out' };
  if (mod && !input.alt && !input.shift && key === '0') return { type: 'zoom', by: 'reset' };
  if (mod && !input.alt && !input.shift && key === ',') return { type: 'settings' };
  if (mod && input.shift && !input.alt && lower === 'n') return { type: 'addApp' };
  if (key === 'F11' && !mod && !input.alt) return { type: 'fullscreen' };
  if ((mod && input.shift && !input.alt && lower === 'i') || key === 'F12') return { type: 'devtools' };
  return null;
}

// ---- Load failures, in words ----

const NET_REASONS: Record<string, (host: string) => string> = {
  ERR_INTERNET_DISCONNECTED: () => 'This computer is offline. Hangar tries again as soon as it’s back.',
  ERR_NETWORK_CHANGED: () => 'The network changed while it was loading.',
  ERR_NAME_NOT_RESOLVED: (h) => `No server answers to ${h}. Check the address, or the network’s DNS.`,
  ERR_NAME_RESOLUTION_FAILED: (h) => `No server answers to ${h}. Check the address, or the network’s DNS.`,
  ERR_CONNECTION_REFUSED: (h) => `${h} turned the connection away. The app may not be running.`,
  ERR_CONNECTION_RESET: (h) => `The connection to ${h} was cut off.`,
  ERR_CONNECTION_CLOSED: (h) => `${h} closed the connection.`,
  ERR_CONNECTION_TIMED_OUT: (h) => `${h} took too long to answer.`,
  ERR_TIMED_OUT: (h) => `${h} took too long to answer.`,
  ERR_ADDRESS_UNREACHABLE: (h) => `${h} can’t be reached from this network.`,
  ERR_CERT_AUTHORITY_INVALID: (h) => `${h}’s certificate isn’t trusted, so Hangar didn’t open it.`,
  ERR_CERT_COMMON_NAME_INVALID: (h) => `${h}’s certificate is for a different address, so Hangar didn’t open it.`,
  ERR_CERT_DATE_INVALID: (h) => `${h}’s certificate has expired, so Hangar didn’t open it.`,
  ERR_PROXY_CONNECTION_FAILED: () => 'The network’s proxy didn’t answer.',
  ERR_TUNNEL_CONNECTION_FAILED: (h) => `The network’s proxy wouldn’t connect to ${h}.`,
  ERR_BLOCKED_BY_ADMINISTRATOR: (h) => `This computer’s administrator has blocked ${h}.`,
  ERR_SSL_PROTOCOL_ERROR: (h) => `${h} didn’t set up a secure connection.`,
  ERR_UNSAFE_PORT: (h) => `Port ${h.split(":").pop()} is one that browsers never open. Give the app another port.`,
  ERR_TOO_MANY_REDIRECTS: (h) => `${h} kept sending Hangar somewhere else. Its sign-in may need setting up again.`,
};

/** Electron's errorDescription is the net error's name ("ERR_NAME_NOT_RESOLVED"); this puts it into a sentence. */
export function describeLoadError(description: string, host: string): { code: string; reason: string } {
  const code = description.replace(/^net::/, '').trim() || 'ERR_FAILED';
  const say = NET_REASONS[code];
  return { code, reason: say ? say(host) : `${host} couldn’t be opened.` };
}

/** Errors worth waiting out: Hangar retries these by itself when the network comes back or the app is opened again. */
export function isTransient(code: string): boolean {
  return /INTERNET_DISCONNECTED|NETWORK_CHANGED|NAME_NOT_RESOLVED|NAME_RESOLUTION|CONNECTION_|TIMED_OUT|ADDRESS_UNREACHABLE|PROXY|TUNNEL/.test(
    code,
  );
}

// ---- Manifest icons ----

interface ManifestIcon {
  src?: unknown;
  sizes?: unknown;
  type?: unknown;
  purpose?: unknown;
}

/**
 * The manifest icon that looks best in the rail (40px, so 80px or more on a high-density screen): an "any" icon, an SVG
 * first, else the smallest PNG of at least 96px, else the biggest there is. Maskable icons are cut to the platform's
 * shape and have padding, so they're used only when there's nothing else.
 */
export function pickManifestIcon(manifest: unknown, manifestUrl: string): string | null {
  if (!manifest || typeof manifest !== 'object') return null;
  const icons = (manifest as { icons?: unknown }).icons;
  if (!Array.isArray(icons)) return null;
  const usable = icons
    .filter((i): i is ManifestIcon => !!i && typeof i === 'object' && typeof (i as ManifestIcon).src === 'string')
    .map((i) => {
      const purposes = typeof i.purpose === 'string' ? i.purpose.split(/\s+/) : ['any'];
      const sizes = typeof i.sizes === 'string' ? i.sizes : '';
      const svg = sizes === 'any' || i.type === 'image/svg+xml' || /\.svg(\?|$)/i.test(String(i.src));
      const px = Math.max(0, ...sizes.split(/\s+/).map((s) => Number(s.split('x')[0]) || 0));
      return { src: String(i.src), any: purposes.includes('any'), svg, px };
    });
  const pool = usable.some((i) => i.any) ? usable.filter((i) => i.any) : usable;
  if (!pool.length) return null;
  const best =
    pool.find((i) => i.svg) ??
    pool.filter((i) => i.px >= 96).sort((a, b) => a.px - b.px)[0] ??
    pool.sort((a, b) => b.px - a.px)[0]!;
  try {
    return new URL(best.src, manifestUrl).href;
  } catch {
    return null;
  }
}

export function manifestName(manifest: unknown): string | null {
  if (!manifest || typeof manifest !== 'object') return null;
  const m = manifest as { short_name?: unknown; name?: unknown };
  const name = typeof m.short_name === 'string' && m.short_name.trim() ? m.short_name : m.name;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : null;
}

/** A name for an app that hasn't said its own yet: "apogee.syaddy.com" gives "Apogee". */
export function nameFromUrl(url: string): string {
  const host = hostOf(url).replace(/:\d+$/, '');
  const first = host.replace(/^www\./, '').split('.')[0] || host;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

// ---- Ids and the saved config ----

export function newId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'app';
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface Config {
  version: 1;
  apps: AppEntry[];
  activeId: string | null;
  settings: Settings;
  /** Percent per app id. */
  zoom: Record<string, number>;
  window: WindowBounds;
  /** Ids used before, so a removed app's id is never handed to a new one. */
  retired: string[];
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', openAtLogin: false };
export const DEFAULT_WINDOW: WindowBounds = { width: 1360, height: 880, maximized: false };
export const ZOOM_STEPS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200] as const;

export function stepZoom(current: number, by: 'in' | 'out' | 'reset'): number {
  if (by === 'reset') return 100;
  if (by === 'in') return ZOOM_STEPS.find((z) => z > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]!;
  return [...ZOOM_STEPS].reverse().find((z) => z < current) ?? ZOOM_STEPS[0]!;
}

const isThemeChoice = (v: unknown): v is ThemeChoice => v === 'system' || v === 'light' || v === 'dark';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Reads a saved config, keeping what's valid and dropping what isn't, so a hand-edited or half-written file never
 * stops Hangar from opening. `defaults` supplies the apps on a first run (no file, or a file with no apps list).
 */
export function readConfig(raw: unknown, defaults: AppEntry[]): Config {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const apps: AppEntry[] = [];
  const seen = new Set<string>();
  const listed = Array.isArray(o.apps);
  for (const a of listed ? (o.apps as unknown[]) : defaults) {
    if (!a || typeof a !== 'object') continue;
    const e = a as Record<string, unknown>;
    if (typeof e.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(e.id) || seen.has(e.id)) continue;
    if (typeof e.url !== 'string') continue;
    const n = normalizeUrl(e.url);
    if (!n.ok) continue;
    const name = typeof e.name === 'string' && e.name.trim() ? e.name.trim().slice(0, 40) : nameFromUrl(n.url);
    const entry: AppEntry = { id: e.id, name, url: n.url };
    if (typeof e.icon === 'string' && e.icon.startsWith('data:image/') && e.icon.length < 400_000) entry.icon = e.icon;
    if (e.nameFrom === 'manifest' || e.nameFrom === 'owner') entry.nameFrom = e.nameFrom;
    seen.add(e.id);
    apps.push(entry);
  }
  const s = o.settings && typeof o.settings === 'object' ? (o.settings as Record<string, unknown>) : {};
  const settings: Settings = {
    theme: isThemeChoice(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
    openAtLogin: typeof s.openAtLogin === 'boolean' ? s.openAtLogin : DEFAULT_SETTINGS.openAtLogin,
  };
  const zoom: Record<string, number> = {};
  if (o.zoom && typeof o.zoom === 'object') {
    for (const [id, z] of Object.entries(o.zoom as Record<string, unknown>)) {
      if (seen.has(id) && finite(z) && z >= 25 && z <= 500) zoom[id] = z;
    }
  }
  const w = o.window && typeof o.window === 'object' ? (o.window as Record<string, unknown>) : {};
  const win: WindowBounds = {
    width: finite(w.width) && w.width >= 480 ? Math.round(w.width) : DEFAULT_WINDOW.width,
    height: finite(w.height) && w.height >= 360 ? Math.round(w.height) : DEFAULT_WINDOW.height,
    maximized: w.maximized === true,
  };
  if (finite(w.x) && finite(w.y)) {
    win.x = Math.round(w.x);
    win.y = Math.round(w.y);
  }
  const retired = Array.isArray(o.retired)
    ? (o.retired as unknown[]).filter((r): r is string => typeof r === 'string' && !seen.has(r)).slice(-200)
    : [];
  const activeId = typeof o.activeId === 'string' && seen.has(o.activeId) ? o.activeId : (apps[0]?.id ?? null);
  return { version: 1, apps, activeId, settings, zoom, window: win, retired };
}

/** Moves an item to a new place in a list (clamped), returning a new list. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item!);
  return next;
}

/** Electron's user agent names Electron and the app; some sign-in pages (Google's) turn those away. */
export function browserUserAgent(ua: string): string {
  return ua
    .replace(/\s+Electron\/\S+/g, '')
    .replace(/\s+hangar\/\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

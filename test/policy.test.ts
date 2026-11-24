import { describe, expect, it } from 'vitest';
import {
  appForUrl,
  browserUserAgent,
  describeLoadError,
  describeUpdateError,
  isTransient,
  manifestName,
  moveItem,
  nameFromUrl,
  newId,
  normalizeUrl,
  pickManifestIcon,
  readConfig,
  routeNavigation,
  routeNewWindow,
  shortcutFor,
  stepZoom,
  type KeyInput,
} from '../src/main/policy';
import { freeName } from '../src/main/downloads';
import type { AppEntry } from '../src/shared/types';

const apogee: AppEntry = { id: 'apogee', name: 'Apogee', url: 'https://apogee.syaddy.com/' };
const launchpad: AppEntry = { id: 'launchpad', name: 'Launchpad', url: 'https://launchpad.syaddy.com/' };
const apps = [apogee, launchpad];

describe('normalizeUrl', () => {
  it('adds https to a bare host and http to a local one', () => {
    expect(normalizeUrl('apogee.syaddy.com')).toEqual({ ok: true, url: 'https://apogee.syaddy.com/' });
    expect(normalizeUrl('  launchpad.syaddy.com/today ')).toEqual({ ok: true, url: 'https://launchpad.syaddy.com/today' });
    expect(normalizeUrl('localhost:4310')).toEqual({ ok: true, url: 'http://localhost:4310/' });
    expect(normalizeUrl('127.0.0.1:8799/x')).toEqual({ ok: true, url: 'http://127.0.0.1:8799/x' });
    expect(normalizeUrl('nas.local')).toEqual({ ok: true, url: 'http://nas.local/' });
  });

  it('keeps a scheme it was given, and drops a fragment', () => {
    expect(normalizeUrl('http://apogee.syaddy.com/#today')).toEqual({ ok: true, url: 'http://apogee.syaddy.com/' });
  });

  it('turns away what isn’t a web address, saying why', () => {
    for (const bad of ['', '   ', 'not a site', 'ftp://files.example.com', 'javascript:alert(1)', 'file:///C:/x', 'intranet']) {
      const r = normalizeUrl(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(10);
    }
  });

  it('won’t keep a password in the address', () => {
    expect(normalizeUrl('https://me:secret@apogee.syaddy.com').ok).toBe(false);
  });
});

describe('where links go', () => {
  it('matches an app by origin, port and scheme included', () => {
    expect(appForUrl('https://apogee.syaddy.com/topics/3', apps)?.id).toBe('apogee');
    expect(appForUrl('http://apogee.syaddy.com/', apps)).toBeUndefined();
    expect(appForUrl('https://apogee.syaddy.com:8443/', apps)).toBeUndefined();
    expect(appForUrl('not a url', apps)).toBeUndefined();
  });

  it('opens a new-window link in its app, sign-ins in place, and the rest in the browser', () => {
    expect(routeNewWindow('https://launchpad.syaddy.com/#money', apps)).toEqual({
      kind: 'app',
      id: 'launchpad',
      url: 'https://launchpad.syaddy.com/#money',
    });
    expect(routeNewWindow('https://syaddy.cloudflareaccess.com/cdn-cgi/access/login', apps)).toEqual({ kind: 'stay' });
    expect(routeNewWindow('https://mail.google.com/', apps)).toEqual({ kind: 'external', url: 'https://mail.google.com/' });
    expect(routeNewWindow('mailto:me@example.com', apps).kind).toBe('external');
    expect(routeNewWindow('javascript:alert(1)', apps).kind).toBe('block');
    expect(routeNewWindow('file:///C:/Windows/', apps).kind).toBe('block');
  });

  it('keeps an app’s own navigation, and a sign-in’s, in the app', () => {
    const from = 'https://apogee.syaddy.com/today';
    expect(routeNavigation(from, 'https://apogee.syaddy.com/courses', apogee, apps)).toEqual({ kind: 'stay' });
    expect(routeNavigation(from, 'https://syaddy.cloudflareaccess.com/cdn-cgi/access/login', apogee, apps)).toEqual({ kind: 'stay' });
    expect(routeNavigation(from, 'https://accounts.google.com/o/oauth2/v2/auth?x', apogee, apps)).toEqual({ kind: 'stay' });
    // Steps taken from a sign-in page (an identity provider's own pages) stay too, so the sign-in can finish.
    const idp = 'https://syaddy.cloudflareaccess.com/cdn-cgi/access/login';
    expect(routeNavigation(idp, 'https://login.example-idp.com/authorize', apogee, apps)).toEqual({ kind: 'stay' });
    // The first page of all (a fresh view) stays wherever it is.
    expect(routeNavigation('', 'https://apogee.syaddy.com/', apogee, apps)).toEqual({ kind: 'stay' });
  });

  it('sends a link to another app to that app, and anywhere else to the browser', () => {
    const from = 'https://launchpad.syaddy.com/';
    expect(routeNavigation(from, 'https://apogee.syaddy.com/today', launchpad, apps)).toEqual({
      kind: 'app',
      id: 'apogee',
      url: 'https://apogee.syaddy.com/today',
    });
    expect(routeNavigation(from, 'https://www.youtube.com/', launchpad, apps)).toEqual({
      kind: 'external',
      url: 'https://www.youtube.com/',
    });
    expect(routeNavigation(from, 'obsidian://open?vault=Uni', launchpad, apps).kind).toBe('external');
    expect(routeNavigation(from, 'about:blank', launchpad, apps)).toEqual({ kind: 'stay' });
  });
});

describe('shortcutFor', () => {
  const key = (k: Partial<KeyInput>): KeyInput => ({
    type: 'keyDown',
    key: '',
    control: false,
    meta: false,
    shift: false,
    alt: false,
    ...k,
  });

  it('switches apps by number, with 9 for the last', () => {
    expect(shortcutFor(key({ key: '1', code: 'Digit1', control: true }), 'win32')).toEqual({ type: 'switchIndex', index: 0 });
    expect(shortcutFor(key({ key: '3', code: 'Digit3', control: true }), 'win32')).toEqual({ type: 'switchIndex', index: 2 });
    expect(shortcutFor(key({ key: '9', code: 'Digit9', control: true }), 'win32')).toEqual({ type: 'switchLast' });
    // On a Mac it's Cmd, and Ctrl+1 goes to the page.
    expect(shortcutFor(key({ key: '1', code: 'Digit1', meta: true }), 'darwin')).toEqual({ type: 'switchIndex', index: 0 });
    expect(shortcutFor(key({ key: '1', code: 'Digit1', control: true }), 'darwin')).toBeNull();
  });

  it('cycles with Ctrl+Tab and Ctrl+Shift+Tab', () => {
    expect(shortcutFor(key({ key: 'Tab', control: true }), 'win32')).toEqual({ type: 'next' });
    expect(shortcutFor(key({ key: 'Tab', control: true, shift: true }), 'win32')).toEqual({ type: 'previous' });
  });

  it('knows the browser’s usual keys', () => {
    expect(shortcutFor(key({ key: 'r', control: true }), 'win32')).toEqual({ type: 'reload' });
    expect(shortcutFor(key({ key: 'R', control: true, shift: true }), 'win32')).toEqual({ type: 'hardReload' });
    expect(shortcutFor(key({ key: 'F5' }), 'win32')).toEqual({ type: 'reload' });
    expect(shortcutFor(key({ key: 'ArrowLeft', alt: true }), 'win32')).toEqual({ type: 'back' });
    expect(shortcutFor(key({ key: 'f', control: true }), 'win32')).toEqual({ type: 'find' });
    expect(shortcutFor(key({ key: '=', control: true }), 'win32')).toEqual({ type: 'zoom', by: 'in' });
    expect(shortcutFor(key({ key: '-', control: true }), 'win32')).toEqual({ type: 'zoom', by: 'out' });
    expect(shortcutFor(key({ key: '0', control: true }), 'win32')).toEqual({ type: 'zoom', by: 'reset' });
    expect(shortcutFor(key({ key: ',', control: true }), 'win32')).toEqual({ type: 'settings' });
    expect(shortcutFor(key({ key: 'F11' }), 'win32')).toEqual({ type: 'fullscreen' });
  });

  it('leaves everything else, and key-ups, to the page', () => {
    for (const k of [
      key({ key: 'a' }),
      key({ key: 'k', control: true }),
      key({ key: 'Enter', control: true }),
      key({ key: '/', }),
      key({ key: 'Escape' }),
      key({ key: '1', code: 'Digit1', control: true, alt: true }),
      key({ type: 'keyUp', key: 'r', control: true }),
    ]) {
      expect(shortcutFor(k, 'win32'), JSON.stringify(k)).toBeNull();
    }
  });
});

describe('load failures in words', () => {
  it('says what went wrong for the common ones', () => {
    expect(describeLoadError('ERR_NAME_NOT_RESOLVED', 'apogee.syaddy.com').reason).toContain('apogee.syaddy.com');
    expect(describeLoadError('net::ERR_INTERNET_DISCONNECTED', 'x').code).toBe('ERR_INTERNET_DISCONNECTED');
    expect(describeLoadError('ERR_INTERNET_DISCONNECTED', 'x').reason).toMatch(/offline/);
    expect(describeLoadError('ERR_UNSAFE_PORT', '127.0.0.1:9').reason).toContain('Port 9');
  });

  it('still says something for one it doesn’t know, without repeating the code', () => {
    const r = describeLoadError('ERR_SOMETHING_NEW', 'host.example');
    expect(r).toEqual({ code: 'ERR_SOMETHING_NEW', reason: 'host.example couldn’t be opened.' });
    expect(describeLoadError('', 'h').code).toBe('ERR_FAILED');
  });

  it('retries only what time can fix', () => {
    expect(isTransient('ERR_INTERNET_DISCONNECTED')).toBe(true);
    expect(isTransient('ERR_CONNECTION_REFUSED')).toBe(true);
    expect(isTransient('ERR_NAME_NOT_RESOLVED')).toBe(true);
    expect(isTransient('ERR_CERT_AUTHORITY_INVALID')).toBe(false);
    expect(isTransient('ERR_UNSAFE_PORT')).toBe(false);
  });
});

describe('manifest icons and names', () => {
  const base = 'https://launchpad.syaddy.com/manifest.webmanifest';

  it('takes Launchpad’s SVG over its PNGs', () => {
    const manifest = {
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      ],
    };
    expect(pickManifestIcon(manifest, base)).toBe('https://launchpad.syaddy.com/favicon.svg');
  });

  it('takes the smallest PNG that is big enough, and skips maskable ones', () => {
    const manifest = {
      icons: [
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-64.png', sizes: '64x64', type: 'image/png' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
    expect(pickManifestIcon(manifest, 'https://apogee.syaddy.com/manifest.webmanifest')).toBe(
      'https://apogee.syaddy.com/icon-192.png',
    );
  });

  it('falls back to a maskable icon, and to nothing for a broken manifest', () => {
    expect(pickManifestIcon({ icons: [{ src: 'm.png', sizes: '512x512', purpose: 'maskable' }] }, base)).toBe(
      'https://launchpad.syaddy.com/m.png',
    );
    expect(pickManifestIcon({ icons: 'nope' }, base)).toBeNull();
    expect(pickManifestIcon(null, base)).toBeNull();
    expect(pickManifestIcon({ icons: [{ sizes: '1x1' }] }, base)).toBeNull();
  });

  it('prefers the short name', () => {
    expect(manifestName({ name: 'Launchpad dashboard', short_name: 'Launchpad' })).toBe('Launchpad');
    expect(manifestName({ name: 'Apogee' })).toBe('Apogee');
    expect(manifestName({ name: '  ' })).toBeNull();
    expect(nameFromUrl('https://apogee.syaddy.com/')).toBe('Apogee');
    expect(nameFromUrl('http://localhost:4310/')).toBe('Localhost');
  });
});

describe('the saved config', () => {
  it('starts from the defaults when there’s nothing saved', () => {
    const c = readConfig(undefined, apps);
    expect(c.apps.map((a) => a.id)).toEqual(['apogee', 'launchpad']);
    expect(c.activeId).toBe('apogee');
    expect(c.settings).toEqual({ theme: 'system', openAtLogin: false });
  });

  it('keeps a saved empty list rather than bringing the defaults back', () => {
    expect(readConfig({ apps: [] }, apps).apps).toEqual([]);
    expect(readConfig({ apps: [] }, apps).activeId).toBeNull();
  });

  it('drops what’s broken and keeps the rest', () => {
    const c = readConfig(
      {
        apps: [
          apogee,
          { id: 'apogee', name: 'Twice', url: 'https://twice.example.com' },
          { id: 'Bad Id', name: 'x', url: 'https://x.example.com' },
          { id: 'nourl', name: 'x' },
          { id: 'ftp', name: 'x', url: 'ftp://x.example.com' },
          { id: 'icon', name: '', url: 'https://icon.example.com', icon: 'javascript:alert(1)' },
          'junk',
        ],
        activeId: 'gone',
        settings: { theme: 'purple', openAtLogin: 'yes' },
        zoom: { apogee: 125, icon: 9000, gone: 150 },
        window: { width: 100, height: 'tall', x: 10, y: 20, maximized: true },
        retired: ['old', 'apogee', 4],
      },
      [],
    );
    expect(c.apps.map((a) => a.id)).toEqual(['apogee', 'icon']);
    expect(c.apps[1]).toEqual({ id: 'icon', name: 'Icon', url: 'https://icon.example.com/' });
    expect(c.activeId).toBe('apogee');
    expect(c.settings).toEqual({ theme: 'system', openAtLogin: false });
    expect(c.zoom).toEqual({ apogee: 125 });
    expect(c.window).toEqual({ width: 1360, height: 880, x: 10, y: 20, maximized: true });
    expect(c.retired).toEqual(['old']);
  });

  it('reads garbage as a first run', () => {
    expect(readConfig('nonsense', apps).apps).toHaveLength(2);
    expect(readConfig(42, apps).window.width).toBe(1360);
  });
});

describe('small helpers', () => {
  it('never hands out an id that was used before', () => {
    expect(newId('Ground station', [])).toBe('ground-station');
    expect(newId('Apogee', ['apogee'])).toBe('apogee-2');
    expect(newId('Apogee', ['apogee', 'apogee-2'])).toBe('apogee-3');
    expect(newId('!!!', [])).toBe('app');
    expect(newId('Café Ops', [])).toBe('cafe-ops');
  });

  it('moves an item within a list', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 1, 99)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });

  it('steps zoom like a browser', () => {
    expect(stepZoom(100, 'in')).toBe(110);
    expect(stepZoom(100, 'out')).toBe(90);
    expect(stepZoom(200, 'in')).toBe(200);
    expect(stepZoom(50, 'out')).toBe(50);
    expect(stepZoom(133, 'reset')).toBe(100);
  });

  it('takes Electron and Hangar out of the user agent', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) hangar/0.1.0 Chrome/142.0.0.0 Electron/45.4.1 Safari/537.36';
    expect(browserUserAgent(ua)).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    );
  });

  it('names a download so it never overwrites one', () => {
    const taken = new Set(['C:/d/report.pdf', 'C:/d/report (2).pdf']);
    const exists = (p: string) => taken.has(p.replace(/\\/g, '/'));
    expect(freeName('C:/d', 'report.pdf', exists).replace(/\\/g, '/')).toBe('C:/d/report (3).pdf');
    expect(freeName('C:/d', 'notes.txt', exists).replace(/\\/g, '/')).toBe('C:/d/notes.txt');
    expect(freeName('C:/d', '../../evil?.exe', exists).replace(/\\/g, '/')).toBe('C:/d/evil_.exe');
    expect(freeName('C:/d', '', exists).replace(/\\/g, '/')).toBe('C:/d/download');
  });
});

describe('updates', () => {
  it('puts the updater’s errors into a sentence', () => {
    expect(describeUpdateError('HttpError: 404 \n"method: GET url: https://github.com/syaddie/hangar/releases.atom"')).toMatch(/private, or have no releases/);
    expect(describeUpdateError('Error: net::ERR_INTERNET_DISCONNECTED')).toMatch(/couldn’t reach GitHub/);
    expect(describeUpdateError('getaddrinfo ENOTFOUND github.com')).toMatch(/couldn’t reach GitHub/);
    expect(describeUpdateError('sha512 checksum mismatch, expected abc')).toMatch(/damaged/);
    expect(describeUpdateError('HttpError: 403 rate limit exceeded')).toMatch(/turned the request away/);
    expect(describeUpdateError('Error: something odd\n    at stack line')).toBe('something odd');
    expect(describeUpdateError('')).toMatch(/failed/);
    expect(describeUpdateError('x'.repeat(400)).length).toBeLessThanOrEqual(158);
  });

  it('reopens an app only on its own pages after a restart', () => {
    const c = readConfig(
      {
        apps,
        resume: {
          apogee: 'https://apogee.syaddy.com/courses/12',
          launchpad: 'https://syaddy.cloudflareaccess.com/cdn-cgi/access/login',
          gone: 'https://gone.example.com/',
        },
      },
      [],
    );
    expect(c.resume).toEqual({ apogee: 'https://apogee.syaddy.com/courses/12' });
    expect(readConfig({ apps, resume: 'nope' }, []).resume).toEqual({});
  });
});

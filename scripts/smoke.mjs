// Opens the real Hangar, drives it through its screens and saves a picture of the window after each step, in
// .smoke/, then checks its behaviour. Last, it opens Hangar twice more for the screens a normal run rushes past: the
// launch (an app that never answers) and an empty hangar. For seeing a change working, not just passing tests:
//
//   npm run smoke
//
// It uses a data folder of its own (.smoke/data), never Hangar's real one, and these apps unless HANGAR_APPS says
// otherwise: Apogee at http://127.0.0.1:4311 and Launchpad at http://127.0.0.1:8799 (run them first; docs/TESTING.md).

import { _electron as electron } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// No trailing slash: on Windows, "C:\...\hangar\" would escape its own closing quote.
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const out = join(root, '.smoke');
const only = process.argv.slice(2);
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'data'), { recursive: true });

const apps = process.env.HANGAR_APPS ?? JSON.stringify([
  { id: 'apogee', name: 'Apogee', url: 'http://127.0.0.1:4311/', nameFrom: 'manifest' },
  { id: 'launchpad', name: 'Launchpad', url: 'http://127.0.0.1:8799/', nameFrom: 'manifest' },
]);

const width = Number(process.env.SMOKE_WIDTH ?? 1280);
const height = Number(process.env.SMOKE_HEIGHT ?? 800);
const launch = (appList, data) =>
  electron.launch({
    executablePath: createRequire(import.meta.url)('electron'),
    args: [root, `--hangar-bounds=60,40,${width},${height}`],
    env: { ...process.env, HANGAR_DATA: data, HANGAR_APPS: appList },
    cwd: root,
  });
let app = await launch(apps, join(out, 'data'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;

/**
 * A picture of the window, plus any crops asked for ({x, y, width, height} in window pixels), saved at three times
 * the size for a close look at edges and corners.
 */
async function snap(name, crops = {}) {
  n += 1;
  // Built the way the window is: the shell's own picture, with the visible app's picture laid over the app area at
  // its rounded corners. (Windows' window capture misses layers Chromium animates on their own, such as a fading
  // scrim, so it can show what isn't there.) The window's own minimise, maximise and close buttons aren't in it.
  let shots = null;
  // Chromium now and then refuses a capture (UnknownVizError) while a frame is being swapped; a moment later it works.
  for (let attempt = 1; attempt <= 4 && !shots; attempt++) {
    shots = await capture(crops).catch(async (e) => {
      if (attempt === 4) throw e;
      await wait(250);
      return null;
    });
  }
  const base = join(out, `${String(n).padStart(2, "0")}-${name}`);
  if (!shots) return console.log(`couldn't capture ${name}`);
  for (const [k, png] of Object.entries(shots)) writeFileSync(`${base}${k ? `-${k}` : ""}.png`, Buffer.from(png, "base64"));
  console.log(`saved ${base}.png${Object.keys(crops).length ? ` (+ ${Object.keys(crops).join(", ")})` : ""}`);
}

function capture(crops) {
  return app.evaluate(async ({ nativeImage }, crops) => {
    const h = globalThis.hangar;
    // Let anything arriving finish arriving (a sheet rising, a panel fading in), so the picture is of where it ends
    // up. Endless ones (the fan at idle, the contrail) are left running.
    await h.shellView.webContents.executeJavaScript(`Promise.race([
      Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))),
      new Promise((done) => setTimeout(done, 1500)),
    ]).then(() => null)`);
    const shell = await h.shellView.webContents.capturePage();
    const scale = shell.getSize().width / h.shellView.getBounds().width;
    const view = h.win.contentView.children.find((v) => v !== h.shellView && v.getVisible());
    let composite = shell.toDataURL();
    if (view) {
      const still = (await view.webContents.capturePage()).toDataURL();
      const b = view.getBounds();
      composite = await h.shellView.webContents.executeJavaScript(`(async () => {
        const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
        const [a, v] = await Promise.all([load(${JSON.stringify(shell.toDataURL())}), load(${JSON.stringify(still)})]);
        const c = document.createElement('canvas'); c.width = a.width; c.height = a.height;
        const g = c.getContext('2d'); g.drawImage(a, 0, 0);
        const s = ${scale}; g.save(); g.beginPath();
        g.roundRect(${b.x} * s, ${b.y} * s, ${b.width} * s, ${b.height} * s, ${h.win.isFullScreen() ? 0 : 10} * s);
        g.clip(); g.drawImage(v, ${b.x} * s, ${b.y} * s, ${b.width} * s, ${b.height} * s); g.restore();
        return c.toDataURL('image/png');
      })()`);
    }
    const img = nativeImage.createFromDataURL(composite);
    const all = { '': img.toPNG().toString('base64') };
    for (const [k, r] of Object.entries(crops)) {
      const rect = { x: Math.round(r.x * scale), y: Math.round(r.y * scale), width: Math.round(r.width * scale), height: Math.round(r.height * scale) };
      all[k] = img.crop(rect).resize({ width: r.width * 3, quality: 'best' }).toPNG().toString('base64');
    }
    return all;
  }, crops);
}

const inShell = (code) => app.evaluate((_e, c) => globalThis.hangar.shellView.webContents.executeJavaScript(c), code);

const command = (cmd) => app.evaluate((_e, c) => globalThis.hangar.command(c), cmd);
const state = () => app.evaluate(() => globalThis.hangar.state());
async function until(test, label, ms = 15000) {
  const start = Date.now();
  for (;;) {
    const s = await state().catch(() => null);
    if (s && test(s)) return s;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${label}`);
    await wait(150);
  }
}
const step = (name) => !only.length || only.includes(name);

try {
  await until((s) => !!s.activeId, 'the shell');
  await wait(250);
  if (step('launch')) await snap('launch');

  const ready = await until((s) => !s.launching && s.apps[0].status !== 'loading', 'the first app');
  await wait(900);
  console.log('first app:', ready.apps[0].status, ready.apps[0].error?.code ?? '');
  console.log('shell focus:', await inShell('document.activeElement?.outerHTML.slice(0, 120) ?? "none"'));
  await snap('first-app', {
    rail: { x: 0, y: 0, width: 200, height: 160 },
    corner: { x: width - 220, y: 0, width: 220, height: 90 },
    foot: { x: 0, y: height - 100, width: 200, height: 100 },
  });

  await command({ type: 'setTheme', theme: 'dark' });
  await wait(500);
  await snap('first-app-dark');

  await command({ type: 'switch', id: 'launchpad' });
  await until((s) => s.apps.find((a) => a.id === 'launchpad')?.status === 'ready', 'Launchpad', 20000);
  await wait(1200);
  await snap('launchpad-dark');

  await command({ type: 'openSheet', sheet: { kind: 'settings' } });
  await wait(600);
  console.log(
    'over the still:',
    await inShell(`(() => {
      const s = document.querySelector('.scrim');
      const top = document.elementFromPoint(120, 400);
      return JSON.stringify({ scrim: !!s, bg: s && getComputedStyle(s).backgroundColor, opacity: s && getComputedStyle(s).opacity,
        rect: s && s.getBoundingClientRect().toJSON(), top: top && top.className });
    })()`),
  );
  await snap('settings-dark');

  await command({ type: 'setTheme', theme: 'light' });
  await wait(500);
  await snap('settings-light');

  await command({ type: 'openSheet', sheet: { kind: 'add' } });
  await wait(400);
  // Through the sheet itself: type an address that isn't one and press Add app.
  await inShell(`(() => {
    const input = document.querySelector('.sheet input');
    input.value = 'not a site';
    input.dispatchEvent(new Event('input'));
    document.querySelector('.sheet-foot .button.primary').click();
  })()`);
  await wait(500);
  console.log('bad address:', await inShell(`document.querySelector('.sheet .error')?.textContent ?? 'no message'`));
  await snap('add-sheet');

  const clash = await command({ type: 'addApp', url: '127.0.0.1:8799' });
  console.log('clash:', JSON.stringify(clash));

  const added = await command({ type: 'addApp', url: 'http://127.0.0.1:4399/', name: 'Ground station' });
  console.log('added:', JSON.stringify(added));
  await until((s) => s.apps.find((a) => a.id === 'ground-station')?.status === 'error', 'the unreachable app');
  await wait(700);
  await snap('unreachable-light');

  await command({ type: 'setTheme', theme: 'dark' });
  await wait(500);
  await snap('unreachable-dark');

  await command({ type: 'switch', id: 'launchpad' });
  await wait(500);
  await command({ type: 'find', text: 'a' });
  await wait(600);
  await snap('find');
  await command({ type: 'closeFind' });

  await command({ type: 'zoom', by: 'in' });
  await wait(500);
  await snap('zoomed');
  await command({ type: 'zoom', by: 'reset' });

  await command({ type: 'moveApp', id: 'launchpad', to: 0 });
  await wait(500);
  const moved = await state();
  console.log('order:', moved.apps.map((a) => a.id).join(', '));
  await command({ type: 'removeApp', id: 'ground-station' });
  await wait(400);
  console.log('after remove:', (await state()).apps.map((a) => a.id).join(', '));

  // ---- Behaviour: links, popups, downloads, keys and dragging, checked rather than looked at ----
  const checks = [];
  const check = (name, ok, detail = '') => {
    checks.push(ok);
    console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  };
  // Links bound for the browser are caught here instead of opening one.
  await app.evaluate(({ shell, app: electronApp }, dir) => {
    globalThis.opened = [];
    shell.openExternal = async (url) => void globalThis.opened.push(url);
    electronApp.setPath('downloads', dir);
  }, join(out, 'downloads'));
  mkdirSync(join(out, 'downloads'), { recursive: true });
  const inApp = (id, code) =>
    app.evaluate((_e, [id, code]) => {
      const bay = globalThis.hangar.bays.get(id);
      return bay.view.webContents.executeJavaScript(code, true);
    }, [id, code]);
  const urlOf = (id) => app.evaluate((_e, id) => globalThis.hangar.bays.get(id).view.webContents.getURL(), id);
  const opened = () => app.evaluate(() => globalThis.opened.slice());

  await command({ type: 'switch', id: 'launchpad' });
  await wait(400);
  const href = await inApp('launchpad', `(() => { const a = document.querySelector('a[target="_blank"][href^="http"]'); if (!a) return null; a.click(); return a.href; })()`);
  await wait(500);
  check('a bookmark opens in the browser', !!href && (await opened()).includes(href), href ?? 'no bookmark link found');
  check('…and Launchpad stays put', (await urlOf('launchpad')).startsWith('http://127.0.0.1:8799/'));

  await inApp('launchpad', `location.href = 'https://example.com/elsewhere'`);
  await wait(500);
  check('a page leaving for another site goes to the browser', (await opened()).includes('https://example.com/elsewhere'));
  check('…without moving the app', (await urlOf('launchpad')).startsWith('http://127.0.0.1:8799/'));

  await inApp('launchpad', `void window.open('http://127.0.0.1:4311/courses', '_blank')`);
  await until((s) => s.activeId === 'apogee', 'Apogee to open from a link', 5000).catch(() => null);
  await wait(600);
  check('a link to another app opens that app', (await state()).activeId === 'apogee');
  check('…at the linked page', (await urlOf('apogee')).endsWith('/courses'), await urlOf('apogee'));

  await inApp('apogee', `void window.open('/notes', '_blank')`);
  await wait(1200);
  const popups = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.webContents.getURL()));
  check('an app’s link to itself opens a window of its own', popups.some((u) => u.endsWith('/notes')), JSON.stringify(popups));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.close()));

  await inApp('launchpad', `(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['hello from hangar'], { type: 'text/plain' })); a.download = 'hangar-test.txt'; document.body.append(a); a.click(); a.remove(); })()`);
  const dl = await until((s) => s.downloads.some((d) => d.state === 'completed'), 'the download', 8000).catch(() => null);
  check('a download is saved to Downloads', !!dl, dl ? dl.downloads.map((d) => `${d.name} ${d.state}`).join(', ') : 'none');
  await snap('downloaded', { tools: { x: width - 460, y: 0, width: 460, height: 44 } });

  const key = (id, keyCode, modifiers) =>
    app.evaluate((_e, [id, keyCode, modifiers]) => {
      const wc = id === 'shell' ? globalThis.hangar.shellView.webContents : globalThis.hangar.bays.get(id).view.webContents;
      wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    }, [id, keyCode, modifiers]);
  const order = (await state()).apps.map((a) => a.id);
  await key('apogee', String(order.indexOf('launchpad') + 1), ['control']);
  await wait(400);
  check('Ctrl+number switches app, from inside an app', (await state()).activeId === 'launchpad');
  await key('launchpad', 'Tab', ['control']);
  await wait(400);
  check('Ctrl+Tab goes to the next app', (await state()).activeId === order[(order.indexOf('launchpad') + 1) % order.length]);

  // Real mouse clicks, as a person makes them (the commands above go round the shell's buttons).
  const centre = (selector) =>
    inShell(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
      return r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null; })()`);
  const click = (p) =>
    app.evaluate((_e, p) => {
      const wc = globalThis.hangar.shellView.webContents;
      wc.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
      wc.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    }, p);
  for (const id of [...(await state()).apps.map((a) => a.id)].reverse()) {
    const p = await centre(`.bay[data-id="${id}"] .bay-button`);
    if (p) await click(p);
    await wait(500);
    check(`clicking ${id}’s bay opens it`, (await state()).activeId === id);
  }
  await click(await centre('.rail-foot .icon-button[aria-label="Settings"]'));
  await wait(700);
  check('clicking the settings button opens settings', (await state()).sheet?.kind === 'settings');
  // A point on the dimmed app beside the sheet: the scrim's lower-left corner, well clear of the sheet.
  const beside = await inShell(`(() => { const r = document.querySelector('.scrim').getBoundingClientRect();
    return { x: Math.round(r.left + 24), y: Math.round(r.bottom - 24) }; })()`);
  await click(beside);
  await wait(600);
  check('clicking outside the sheet closes it', (await state()).sheet === null);

  // Drag the first bay below the second.
  const before = (await state()).apps.map((a) => a.id);
  await app.evaluate(async () => {
    const wc = globalThis.hangar.shellView.webContents;
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    wc.sendInputEvent({ type: 'mouseDown', x: 32, y: 74, button: 'left', clickCount: 1 });
    for (let y = 76; y <= 136; y += 6) {
      // Held down, as a real drag reports it (the drag code ends one whose button has come up).
      wc.sendInputEvent({ type: 'mouseMove', x: 32, y, button: 'left', modifiers: ['leftButtonDown'] });
      await pause(16);
    }
    wc.sendInputEvent({ type: 'mouseUp', x: 32, y: 136, button: 'left', clickCount: 1 });
  });
  await wait(700);
  const after = (await state()).apps.map((a) => a.id);
  check('dragging a bay down the rail reorders the apps', after[0] === before[1] && after[1] === before[0], `${before} → ${after}`);
  console.log(`${checks.filter(Boolean).length} of ${checks.length} checks passed`);
  if (checks.includes(false)) process.exitCode = 1;

  await app.evaluate(() => globalThis.hangar.win.setSize(600, 640));
  await wait(700);
  await snap('narrow');

  const final = await state();
  console.log('final:', JSON.stringify(final.apps.map((a) => ({ id: a.id, name: a.name, status: a.status, title: a.title, icon: !!a.icon }))));
} catch (e) {
  console.error('smoke failed:', e.message);
  await snap('failure');
  process.exitCode = 1;
} finally {
  await app.close();
}

// ---- The launch and the empty hangar ----
// 10.255.255.1 is an address nothing answers, so the launch plays for as long as the connection takes to give up.
const scenes = [
  ['launch-spooling', [{ id: 'slow', name: 'Apogee', url: 'http://10.255.255.1/' }], 'dark', 900],
  ['launch-idle-dark', [{ id: 'slow', name: 'Apogee', url: 'http://10.255.255.1/' }], 'dark', 2600],
  ['launch-idle-light', [{ id: 'slow', name: 'Apogee', url: 'http://10.255.255.1/' }], 'light', 2600],
  ['empty-dark', [], 'dark', 900],
  ['empty-light', [], 'light', 900],
];
for (const [name, list, theme, after] of scenes) {
  app = await launch(JSON.stringify(list), join(out, `data-${name}`));
  try {
    await until((s) => s.launching || !s.apps.length, 'the shell');
    await command({ type: 'setTheme', theme });
    await wait(after);
    await snap(name);
  } catch (e) {
    console.error(`${name} failed:`, e.message);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

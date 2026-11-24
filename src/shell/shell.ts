// The shell: the rail of bays down the left, the top bar, and the app area's own screens (the launch, an app
// opening, one that can't be reached, an empty hangar, and the sheets). The apps themselves are views the main
// process lays over the app area; this page never sees inside them. It renders whatever state the main process sends
// (src/shared/types.ts) and sends commands back.

import type { AppState, Command, ShellState } from '../shared/types';
import type { HangarApi } from '../preload/shell';
import { EMPTY, ICON, LAUNCH, LOST, swatchFor } from './art';

declare global {
  interface Window {
    hangar: HangarApi;
  }
}

const api = window.hangar;
let state: ShellState | null = null;

// ---------------------------------------------------------------- small helpers

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v as EventListener);
    else if (k in node && typeof v !== 'string') (node as unknown as Record<string, unknown>)[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

const send = (cmd: Command) => api.command(cmd);
const mod = () => (state?.platform === 'darwin' ? '⌘' : 'Ctrl');
const osName = () => (state?.platform === 'darwin' ? 'macOS' : state?.platform === 'win32' ? 'Windows' : 'the system');
const activeApp = (s: ShellState | null = state): AppState | undefined =>
  s?.apps.find((a) => a.id === s.activeId);

function appMark(app: Pick<AppState, 'id' | 'name' | 'icon'>, cls = 'bay-icon'): HTMLElement {
  if (app.icon) return h('img', { class: cls, src: app.icon, alt: '', draggable: 'false' });
  return h('span', { class: `${cls} monogram`, style: `background:${swatchFor(app.id)}` }, app.name.slice(0, 1).toUpperCase());
}

/** "Today – Apogee" in the top bar next to "Apogee" says it twice; this drops the app's name from the page's title. */
function pageTitle(app: AppState): string {
  const t = app.title.trim();
  if (!t || t === app.name) return '';
  const name = app.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return t.replace(new RegExp(`\\s*[-–—|·:]\\s*${name}$`, 'i'), '').replace(new RegExp(`^${name}\\s*[-–—|·:]\\s*`, 'i'), '');
}

function shortcutLabel(index: number, count: number): string {
  if (index < 8) return `${mod()}+${index + 1}`;
  return index === count - 1 ? `${mod()}+9` : '';
}

// ---------------------------------------------------------------- the skeleton

const bays = h('ul', { class: 'bays', role: 'tablist', 'aria-label': 'Apps', 'aria-orientation': 'vertical' });
const selector = h('div', { class: 'selector hidden instant', 'aria-hidden': 'true' });
const addButton = h('button', {
  class: 'icon-button',
  html: ICON.plus,
  title: `Add an app (${'Ctrl'}+Shift+N)`,
  'aria-label': 'Add an app',
  onclick: () => send({ type: 'openSheet', sheet: { kind: 'add' } }),
});
const settingsButton = h('button', {
  class: 'icon-button',
  html: ICON.settings,
  title: 'Settings (Ctrl+,)',
  'aria-label': 'Settings',
  onclick: () => send({ type: 'openSheet', sheet: { kind: 'settings' } }),
});
const rail = h(
  'nav',
  { class: 'rail', 'aria-label': 'Hangar' },
  h('div', { class: 'brand', title: 'Hangar' }, h('img', { src: '../assets/logo.svg', alt: '', draggable: 'false' })),
  bays,
  selector,
  h('div', { class: 'rail-foot' }, addButton, settingsButton),
);

const backButton = h('button', { class: 'icon-button', html: ICON.back, 'aria-label': 'Back', title: 'Back (Alt+Left)', onclick: () => send({ type: 'back' }) });
const forwardButton = h('button', { class: 'icon-button', html: ICON.forward, 'aria-label': 'Forward', title: 'Forward (Alt+Right)', onclick: () => send({ type: 'forward' }) });
const reloadButton = h('button', { class: 'icon-button', html: ICON.reload, 'aria-label': 'Reload', title: 'Reload (Ctrl+R)', onclick: () => send({ type: 'reload' }) });
const titleSlot = h('div', { class: 'top-title' });
const appName = h('span', { class: 'app-name' });
const pageName = h('span', { class: 'page-title' });
titleSlot.append(appName, pageName);
const updateSlot = h('span');
const zoomSlot = h('span');
const downloadSlot = h('span', { class: 'tools' });
const externalButton = h('button', {
  class: 'icon-button',
  html: ICON.external,
  'aria-label': 'Open in browser',
  title: 'Open this page in your browser',
  onclick: () => send({ type: 'openExternal' }),
});
const top = h(
  'header',
  { class: 'top' },
  h('div', { class: 'tools' }, backButton, forwardButton, reloadButton),
  titleSlot,
  h('div', { class: 'tools' }, updateSlot, zoomSlot, downloadSlot, externalButton),
);
const contrail = h('div', { class: 'contrail', 'aria-hidden': 'true' });
const stage = h('main', { class: 'stage' });
const live = h('div', { class: 'sr-only', 'aria-live': 'polite' });

document.body.append(rail, top, contrail, stage, live);

// ---------------------------------------------------------------- the rail

const bayNodes = new Map<string, HTMLLIElement>();
let suppressClick = false;

function bayFor(app: AppState): HTMLLIElement {
  let li = bayNodes.get(app.id);
  if (li) return li;
  const button = h('button', { class: 'bay-button', role: 'tab' });
  li = h('li', { class: 'bay', 'data-id': app.id }, button);
  const id = app.id;
  button.addEventListener('click', () => {
    if (suppressClick) return;
    void send({ type: 'switch', id });
  });
  button.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    void send({ type: 'appMenu', id, x: e.clientX, y: e.clientY });
  });
  button.addEventListener('keydown', (e) => onBayKey(e, id, button));
  button.addEventListener('pointerdown', (e) => startDrag(e, id, li!));
  bayNodes.set(app.id, li);
  return li;
}

function onBayKey(e: KeyboardEvent, id: string, button: HTMLButtonElement): void {
  const ids = state?.apps.map((a) => a.id) ?? [];
  const at = ids.indexOf(id);
  const vertical = e.key === 'ArrowDown' || e.key === 'ArrowUp';
  if (vertical && e.altKey && e.shiftKey) {
    e.preventDefault();
    void send({ type: 'moveApp', id, to: at + (e.key === 'ArrowDown' ? 1 : -1) });
    requestAnimationFrame(() => button.focus());
    return;
  }
  if (vertical || e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : Math.max(0, Math.min(ids.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)));
    bayNodes.get(ids[next]!)?.querySelector('button')?.focus();
    return;
  }
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
    e.preventDefault();
    const r = button.getBoundingClientRect();
    void send({ type: 'appMenu', id, x: r.right - 6, y: r.top + 6 });
  }
}

// Dragging a bay up or down the rail puts it somewhere else; the others make room as it passes.
const STEP = 54; // a bay and the gap after it
let drag: {
  id: string;
  li: HTMLLIElement;
  pointerId: number;
  startY: number;
  from: number;
  to: number;
  moved: boolean;
} | null = null;

// A press is only a click until the pointer has moved a few pixels. The pointer is captured only once it's a drag:
// captured from the press, Chromium sends the click to the bay rather than its button, and the click is lost.
function startDrag(e: PointerEvent, id: string, li: HTMLLIElement): void {
  if (e.button !== 0 || !state) return;
  const from = state.apps.findIndex((a) => a.id === id);
  drag = { id, li, pointerId: e.pointerId, startY: e.clientY, from, to: from, moved: false };
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
}

function moveDrag(e: PointerEvent): void {
  if (!drag || !state) return;
  // The button came up somewhere this page didn't hear it (over an app): whatever this was, it's over.
  if (!(e.buttons & 1)) return endDrag();
  const dy = e.clientY - drag.startY;
  if (!drag.moved && Math.abs(dy) < 5) return;
  const n = state.apps.length;
  const lo = -drag.from * STEP - 8;
  const hi = (n - 1 - drag.from) * STEP + 8;
  const y = Math.max(lo, Math.min(hi, dy));
  if (!drag.moved) {
    drag.moved = true;
    try {
      drag.li.setPointerCapture(drag.pointerId);
    } catch {
      // The pointer has already gone: the window listeners still see it out.
    }
  }
  drag.li.classList.add('dragging');
  drag.li.style.transform = `translateY(${y}px)`;
  drag.to = Math.max(0, Math.min(n - 1, drag.from + Math.round(y / STEP)));
  state.apps.forEach((a, i) => {
    if (a.id === drag!.id) return;
    const li = bayNodes.get(a.id);
    if (!li) return;
    let shift = 0;
    if (i > drag!.from && i <= drag!.to) shift = -STEP;
    if (i < drag!.from && i >= drag!.to) shift = STEP;
    li.style.transform = shift ? `translateY(${shift}px)` : '';
  });
  if (selectorFor === drag.id) placeSelector(true);
}

function endDrag(): void {
  if (!drag) return;
  const d = drag;
  drag = null;
  window.removeEventListener('pointermove', moveDrag);
  window.removeEventListener('pointerup', endDrag);
  window.removeEventListener('pointercancel', endDrag);
  d.li.classList.remove('dragging');
  if (!d.moved) return;
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 0);
  if (d.to !== d.from) void send({ type: 'moveApp', id: d.id, to: d.to });
  else for (const li of bayNodes.values()) li.style.transform = '';
}

let selectorFor: string | null = null;

function placeSelector(instant = false): void {
  const id = state?.activeId;
  const li = id ? bayNodes.get(id) : undefined;
  if (!li || !state || state.fullscreen) {
    selector.classList.add('hidden');
    return;
  }
  const railTop = rail.getBoundingClientRect().top;
  const r = li.getBoundingClientRect();
  const y = r.top - railTop + (r.height - 22) / 2;
  selector.classList.toggle('instant', instant || selectorFor === null);
  selector.style.transform = `translateY(${Math.round(y)}px)`;
  selector.classList.remove('hidden');
  if (selectorFor === null) requestAnimationFrame(() => selector.classList.remove('instant'));
  selectorFor = id ?? null;
}

function renderBays(s: ShellState): void {
  // Where each bay is now, so a reorder can glide them to their new places (FLIP).
  const before = new Map<string, number>();
  for (const [id, li] of bayNodes) before.set(id, li.getBoundingClientRect().top);

  const keep = new Set(s.apps.map((a) => a.id));
  for (const [id, li] of bayNodes) {
    if (!keep.has(id)) {
      li.remove();
      bayNodes.delete(id);
    }
  }
  s.apps.forEach((app, i) => {
    const li = bayFor(app);
    const button = li.querySelector('button')!;
    const current = app.id === s.activeId;
    li.setAttribute('aria-current', String(current));
    button.setAttribute('aria-selected', String(current));
    button.tabIndex = current || (!s.activeId && i === 0) ? 0 : -1;
    const keys = shortcutLabel(i, s.apps.length);
    button.title = keys ? `${app.name}\n${keys}` : app.name;
    button.setAttribute('aria-label', app.error ? `${app.name}, can’t be reached` : app.name);
    const iconKey = `${app.icon ?? ''}|${app.name}`;
    if (button.dataset.icon !== iconKey) {
      button.dataset.icon = iconKey;
      button.replaceChildren(appMark(app));
    }
    const alert = button.querySelector('.bay-alert');
    if (app.error && !alert) button.append(h('span', { class: 'bay-alert', 'aria-hidden': 'true' }));
    if (!app.error && alert) alert.remove();
    if (bays.children[i] !== li) bays.insertBefore(li, bays.children[i] ?? null);
  });

  for (const [id, li] of bayNodes) {
    const was = before.get(id);
    li.style.transition = 'none';
    li.style.transform = '';
    if (was === undefined) continue;
    const delta = was - li.getBoundingClientRect().top;
    if (Math.abs(delta) > 1) li.style.transform = `translateY(${delta}px)`;
  }
  requestAnimationFrame(() => {
    for (const li of bayNodes.values()) {
      li.style.transition = '';
      li.style.transform = '';
    }
    placeSelector();
  });
}

// ---------------------------------------------------------------- the top bar

let findBar: { root: HTMLElement; input: HTMLInputElement; count: HTMLElement } | null = null;
let lastDownloadDone: string | null = null;
let downloadDoneTimer: number | undefined;

function buildFind(): NonNullable<typeof findBar> {
  const input = h('input', {
    type: 'text',
    placeholder: 'Find in page',
    'aria-label': 'Find in page',
    spellcheck: 'false',
  });
  const count = h('span', { class: 'count', 'aria-live': 'polite' });
  const go = (forward: boolean) => send({ type: 'find', text: input.value, forward, next: true });
  input.addEventListener('input', () => send({ type: 'find', text: input.value }));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void go(!e.shiftKey);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      void send({ type: 'closeFind' });
    }
  });
  const root = h(
    'div',
    { class: 'find', role: 'search' },
    input,
    count,
    h('button', { class: 'icon-button', html: ICON.up, 'aria-label': 'Previous match', title: 'Previous (Shift+Enter)', onclick: () => go(false) }),
    h('button', { class: 'icon-button', html: ICON.down, 'aria-label': 'Next match', title: 'Next (Enter)', onclick: () => go(true) }),
    h('button', { class: 'icon-button', html: ICON.close, 'aria-label': 'Close find', title: 'Close (Esc)', onclick: () => send({ type: 'closeFind' }) }),
  );
  return { root, input, count };
}

function renderTop(s: ShellState, prev: ShellState | null): void {
  const app = activeApp(s);
  for (const b of [backButton, forwardButton, reloadButton, externalButton]) b.hidden = !app;
  backButton.disabled = !app?.canGoBack || !!app.error;
  forwardButton.disabled = !app?.canGoForward || !!app.error;

  if (s.find.open && app) {
    if (!findBar) {
      findBar = buildFind();
      findBar.input.value = s.find.text;
      titleSlot.replaceWith(findBar.root);
      requestAnimationFrame(() => {
        findBar?.input.focus();
        findBar?.input.select();
      });
    }
    const { count } = findBar;
    count.textContent = !s.find.text ? '' : s.find.matches ? `${s.find.active} of ${s.find.matches}` : 'No matches';
    count.classList.toggle('none', !!s.find.text && !s.find.matches);
  } else if (findBar) {
    findBar.root.replaceWith(titleSlot);
    findBar = null;
  }

  appName.textContent = app ? app.name : s.apps.length ? '' : 'Hangar';
  const page = app && !app.error ? pageTitle(app) : '';
  if (pageName.textContent !== page) {
    pageName.textContent = page;
    pageName.classList.remove('changed');
    void pageName.offsetWidth;
    pageName.classList.add('changed');
  }

  // Zoom: shown only when it isn't the page's own size, and a click puts it back.
  const zoom = app && app.zoom !== 100 ? app.zoom : null;
  if (String(zoom) !== zoomSlot.dataset.zoom) {
    zoomSlot.dataset.zoom = String(zoom);
    zoomSlot.replaceChildren(
      zoom
        ? h('button', { class: 'zoom-pill', title: `Back to 100% (${mod()}+0)`, onclick: () => send({ type: 'zoom', by: 'reset' }) }, `${zoom}%`)
        : '',
    );
  }

  renderDownloads(s, prev);
  renderUpdate(s);
  contrail.classList.toggle('on', !!app && app.status === 'loading' && !s.sheet);
}

/** A new Hangar, downloaded and waiting: one button says so, and restarting installs it. */
function renderUpdate(s: ShellState): void {
  const ready = s.update.phase === 'ready' ? s.update.version : '';
  if (updateSlot.dataset.ready === ready) return;
  updateSlot.dataset.ready = ready;
  updateSlot.replaceChildren(
    ready
      ? h(
          'button',
          {
            class: 'update-pill',
            title: `Hangar ${ready} is ready. Your apps reopen on the pages they’re on.`,
            onclick: () => send({ type: 'restartToUpdate' }),
          },
          h('span', { html: ICON.update }),
          'Restart to update',
        )
      : '',
  );
  if (ready) live.textContent = `Hangar ${ready} is ready. Restart to update.`;
}

/** What the Updates part of settings says, for each state the updater can be in. */
function updateStatus(s: ShellState): { text: string; detail?: string; action?: { label: string; cmd: Command; primary?: boolean }; percent?: number } {
  const at = (t?: number) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
  const u = s.update;
  switch (u.phase) {
    case 'off':
      return {
        text: `Hangar ${s.version}`,
        detail:
          u.reason === 'source'
            ? 'Updates come with the installed Hangar. This copy runs from its source folder, so it’s already as new as that is.'
            : 'Updating is switched off for this copy (HANGAR_UPDATES=off).',
      };
    case 'idle':
      return {
        text: `Hangar ${s.version} is up to date.`,
        detail: u.checkedAt ? `Checked at ${at(u.checkedAt)}. Hangar looks again every few hours.` : 'Hangar looks for a new version every few hours.',
        action: { label: 'Check now', cmd: { type: 'checkForUpdates' } },
      };
    case 'checking':
      return { text: 'Looking for a new version…', detail: `You have Hangar ${s.version}.` };
    case 'downloading':
      return { text: `Downloading Hangar ${u.version}`, detail: `${u.percent}%. You can keep working; it’s ready in a moment.`, percent: u.percent };
    case 'ready':
      return {
        text: `Hangar ${u.version} is ready.`,
        detail: 'Restart now, or it installs by itself next time you quit Hangar. Your apps reopen on the pages they’re on.',
        action: { label: 'Restart to update', cmd: { type: 'restartToUpdate' }, primary: true },
      };
    case 'error':
      return { text: `Hangar ${s.version}`, detail: u.message, action: { label: 'Check again', cmd: { type: 'checkForUpdates' } } };
  }
}

function renderDownloads(s: ShellState, prev: ShellState | null): void {
  const list = s.downloads;
  const busy = list.find((d) => d.state === 'progressing');
  const justDone = list.find(
    (d) => d.state === 'completed' && prev?.downloads.find((p) => p.id === d.id)?.state === 'progressing',
  );
  if (justDone) {
    lastDownloadDone = justDone.id;
    live.textContent = `Downloaded ${justDone.name}`;
    window.clearTimeout(downloadDoneTimer);
    downloadDoneTimer = window.setTimeout(() => {
      lastDownloadDone = null;
      if (state) renderDownloads(state, state);
    }, 6000);
  }
  if (!list.length) {
    downloadSlot.replaceChildren();
    return;
  }
  const done = lastDownloadDone ? list.find((d) => d.id === lastDownloadDone) : undefined;
  const ring = busy
    ? `<svg class="download-ring" viewBox="0 0 26 26"><circle class="track" cx="13" cy="13" r="11"/><circle class="fill" cx="13" cy="13" r="11" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - (busy.progress ?? 0.15)}"/></svg>`
    : '';
  const button = h('button', {
    class: 'icon-button download-button',
    html: ICON.download + ring,
    'aria-label': busy ? `Downloading ${busy.name}` : 'Downloads',
    title: busy ? `Downloading ${busy.name}` : 'Downloads',
    onclick: (e: MouseEvent) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      void send({ type: 'downloadsMenu', x: r.left, y: r.bottom + 4 });
    },
  });
  downloadSlot.replaceChildren(
    done
      ? h('button', { class: 'button quiet download-done', title: 'Open it', onclick: () => send({ type: 'openDownload', id: done.id }) }, `Saved ${done.name}`)
      : '',
    button,
  );
}

// ---------------------------------------------------------------- the app area

let stageKey = '';
let stageUpdate: ((s: ShellState) => void) | null = null;
/** Where the edit sheet goes back to: settings if it was opened from there. */
let editFromSettings = false;

function stageKeyFor(s: ShellState): string {
  if (s.sheet) return `sheet:${s.sheet.kind}:${'id' in s.sheet ? s.sheet.id : ''}`;
  if (!s.apps.length) return 'empty';
  const app = activeApp(s);
  if (!app) return 'empty';
  if (s.launching) return `launch:${app.id}`;
  if (app.error) return `error:${app.id}:${app.error.code}`;
  return `opening:${app.id}`;
}

function renderStage(s: ShellState, prev: ShellState | null): void {
  const key = stageKeyFor(s);
  if (key !== stageKey) {
    if (prev?.sheet?.kind === 'settings' && s.sheet?.kind === 'edit') editFromSettings = true;
    else if (s.sheet?.kind !== 'edit') editFromSettings = false;
    stageKey = key;
    stageUpdate = null;
    stage.replaceChildren(buildStage(s));
  } else if (s.sheet && s.backdrop !== prev?.backdrop) {
    const still = stage.querySelector<HTMLImageElement>('.still');
    if (still && s.backdrop) still.src = s.backdrop;
  }
  stageUpdate?.(s);
}

function buildStage(s: ShellState): Node {
  const app = activeApp(s);
  if (s.sheet) return buildSheetLayer(s);
  if (!s.apps.length || !app) {
    return h(
      'div',
      { class: 'panel' },
      h('div', { html: EMPTY }),
      h('h1', {}, 'No apps here yet'),
      h('p', {}, 'Add the address of an app you use, and it gets a bay on the left. It stays open there, ready the moment you switch to it.'),
      h('div', { class: 'actions' }, h('button', { class: 'button primary', onclick: () => send({ type: 'openSheet', sheet: { kind: 'add' } }) }, 'Add an app')),
    );
  }
  if (s.launching) {
    return h('div', { class: 'launch', role: 'status' }, h('div', { html: LAUNCH }), h('p', {}, `Opening ${app.name}`));
  }
  if (app.error) {
    const err = app.error;
    const panel = h(
      'div',
      { class: 'panel', role: 'alert' },
      h('div', { html: LOST }),
      h('h1', {}, `Can’t reach ${app.name}`),
      h('p', {}, err.reason),
      h('span', { class: 'readout' }, err.code),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'button primary', onclick: () => send({ type: 'retry', id: app.id }) }, 'Try again'),
        h('button', { class: 'button', onclick: () => send({ type: 'openExternal', id: app.id }) }, 'Open in browser'),
        h('button', { class: 'button quiet', onclick: () => send({ type: 'openSheet', sheet: { kind: 'edit', id: app.id } }) }, 'Edit address'),
      ),
    );
    return panel;
  }
  const panel = h('div', { class: 'panel opening', role: 'status' }, appMark(app, 'app-mark'), h('p', {}, `Opening ${app.name}`));
  return panel;
}

// ---- Sheets ----

function buildSheetLayer(s: ShellState): Node {
  const sheet = s.sheet!;
  const layer = h('div', { class: 'sheet-layer' });
  if (s.backdrop) layer.append(h('img', { class: 'still', src: s.backdrop, alt: '' }));
  layer.append(h('div', { class: 'scrim', onclick: () => closeSheet() }));
  const panel =
    sheet.kind === 'settings' ? settingsSheet() : sheet.kind === 'add' ? addSheet() : editSheet(sheet.id);
  layer.append(panel);
  requestAnimationFrame(() => {
    const first = panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel.querySelector<HTMLElement>('button');
    first?.focus();
  });
  return layer;
}

function closeSheet(): void {
  if (state?.sheet?.kind === 'edit' && editFromSettings) void send({ type: 'openSheet', sheet: { kind: 'settings' } });
  else void send({ type: 'closeSheet' });
}

function sheetFrame(title: string, body: Node[], foot?: Node[]): HTMLElement {
  const id = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
  return h(
    'section',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
    h(
      'div',
      { class: 'sheet-head' },
      h('h2', { id }, title),
      h('button', { class: 'icon-button', html: ICON.close, 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => closeSheet() }),
    ),
    h('div', { class: 'sheet-body' }, ...body),
    foot ? h('div', { class: 'sheet-foot' }, ...foot) : null,
  );
}

function settingsSheet(): HTMLElement {
  const list = h('ul', { class: 'app-list' });
  const themes = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Theme' });
  const atLogin = h('input', { type: 'checkbox', id: 'open-at-login' });
  const loginHint = h('span');
  atLogin.addEventListener('change', async () => {
    const r = await send({ type: 'setOpenAtLogin', on: atLogin.checked });
    if (!r.ok) atLogin.checked = !atLogin.checked;
  });

  const choices: { value: ShellState['settings']['theme']; label: string }[] = [
    { value: 'system', label: `Match ${osName()}` },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  for (const c of choices) {
    themes.append(h('button', { 'data-value': c.value, onclick: () => send({ type: 'setTheme', theme: c.value }) }, c.label));
  }

  const keys: [string, string[]][] = [
    ['Switch to an app', [`${mod()}+1`, 'to', `${mod()}+8`]],
    ['Next or previous app', ['Ctrl+Tab', 'Ctrl+Shift+Tab']],
    ['Back and forward', ['Alt+Left', 'Alt+Right']],
    ['Reload', [`${mod()}+R`]],
    ['Find in page', [`${mod()}+F`]],
    ['Zoom', [`${mod()}+=`, `${mod()}+-`, `${mod()}+0`]],
    ['Full screen', ['F11']],
    ['Add an app', [`${mod()}+Shift+N`]],
    ['Settings', [`${mod()}+,`]],
  ];
  const keyList = h('dl', { class: 'keys' });
  const updates = h('div', { class: 'update-status', 'aria-live': 'polite' });
  for (const [what, combo] of keys) {
    keyList.append(h('dt', {}, what), h('dd', {}, ...combo.map((k) => (k === 'to' ? h('span', {}, 'to') : h('kbd', {}, k)))));
  }

  const panel = sheetFrame('Settings', [
    h(
      'div',
      { class: 'group' },
      h('h3', {}, 'Apps'),
      list,
      h(
        'button',
        { class: 'button quiet add-row', onclick: () => send({ type: 'openSheet', sheet: { kind: 'add' } }) },
        h('span', { html: ICON.plus }),
        'Add an app',
      ),
    ),
    h(
      'div',
      { class: 'group' },
      h('h3', {}, 'Theme'),
      themes,
      h('p', { class: 'hint' }, 'An app set to follow the system’s theme follows this one too.'),
    ),
    h(
      'div',
      { class: 'group' },
      h('h3', {}, 'Start-up'),
      h('div', { class: 'check' }, atLogin, h('label', { for: 'open-at-login' }, `Open Hangar when you sign in to ${osName()}`, loginHint)),
    ),
    h('div', { class: 'group' }, h('h3', {}, 'Updates'), updates),
    h('div', { class: 'group' }, h('h3', {}, 'Keys'), keyList),
  ]);

  stageUpdate = (s) => {
    const rows = s.apps.map((a) =>
      h(
        'li',
        { class: 'app-row' },
        appMark(a),
        h('span', { class: 'who' }, h('strong', {}, a.name), h('span', {}, new URL(a.url).host)),
        h('button', { class: 'button quiet', 'aria-label': `Edit ${a.name}`, onclick: () => send({ type: 'openSheet', sheet: { kind: 'edit', id: a.id } }) }, 'Edit'),
      ),
    );
    const sig = s.apps.map((a) => `${a.id}|${a.name}|${a.url}|${a.icon?.length ?? 0}`).join(';');
    if (list.dataset.sig !== sig) {
      list.dataset.sig = sig;
      list.replaceChildren(...rows);
      list.hidden = !rows.length;
    }
    for (const b of themes.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.value === s.settings.theme));
    atLogin.checked = s.settings.openAtLogin;
    atLogin.disabled = !s.packaged;
    loginHint.textContent = s.packaged ? '' : 'This works in the installed Hangar, not when it runs from its source folder.';
    const u = updateStatus(s);
    const updateSig = JSON.stringify(u);
    if (updates.dataset.sig !== updateSig) {
      updates.dataset.sig = updateSig;
      const action = u.action;
      updates.replaceChildren(
        h(
          'div',
          { class: 'update-text' },
          h('strong', {}, u.text),
          u.detail ? h('span', {}, u.detail) : null,
          u.percent !== undefined
            ? h(
                'span',
                { class: 'meter', role: 'progressbar', 'aria-valuenow': String(u.percent), 'aria-valuemin': '0', 'aria-valuemax': '100' },
                h('span', { style: `width:${u.percent}%` }),
              )
            : null,
        ),
        ...(action
          ? [h('button', { class: `button${action.primary ? ' primary' : ''}`, onclick: () => send(action.cmd) }, action.label)]
          : []),
      );
    }
  };
  return panel;
}

function field(label: string, input: HTMLInputElement, error: HTMLElement): HTMLElement {
  const id = `f-${Math.random().toString(36).slice(2, 8)}`;
  input.id = id;
  error.id = `${id}-error`;
  input.setAttribute('aria-describedby', error.id);
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, error);
}

function showError(input: HTMLInputElement, error: HTMLElement, message: string | null): void {
  error.textContent = message ?? '';
  error.hidden = !message;
  input.setAttribute('aria-invalid', String(!!message));
}

function addSheet(): HTMLElement {
  const url = h('input', { type: 'text', placeholder: 'apogee.syaddy.com', spellcheck: 'false', autocomplete: 'off', 'data-autofocus': true });
  const name = h('input', { type: 'text', placeholder: 'The app’s own name', spellcheck: 'false', autocomplete: 'off' });
  const urlError = h('p', { class: 'error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'button primary', onclick: () => go() }, 'Add app');
  const form = h(
    'form',
    { class: 'group' },
    field('Address', url, urlError),
    field('Name', name, h('p', { class: 'hint' }, 'Leave it empty and Hangar uses the app’s own name and icon once it has opened.')),
  );
  const go = async (e?: Event) => {
    e?.preventDefault();
    submit.disabled = true;
    const r = await send({ type: 'addApp', url: url.value, name: name.value });
    submit.disabled = false;
    if (!r.ok) {
      showError(url, urlError, r.message);
      url.focus();
    }
  };
  form.addEventListener('submit', go);
  url.addEventListener('input', () => showError(url, urlError, null));
  for (const i of [url, name]) i.addEventListener('keydown', (e) => e.key === 'Enter' && void go(e));
  return sheetFrame('Add an app', [form], [
    h('span', { class: 'spacer' }),
    h('button', { class: 'button quiet', onclick: () => closeSheet() }, 'Cancel'),
    submit,
  ]);
}

function editSheet(id: string): HTMLElement {
  const app = state?.apps.find((a) => a.id === id);
  if (!app) return sheetFrame('Edit app', [h('p', { class: 'hint' }, 'That app isn’t in Hangar any more.')]);
  const url = h('input', { type: 'text', value: app.url, spellcheck: 'false', autocomplete: 'off', 'data-autofocus': true });
  const name = h('input', { type: 'text', value: app.nameFrom === 'owner' ? app.name : '', placeholder: app.name, spellcheck: 'false', autocomplete: 'off' });
  const urlError = h('p', { class: 'error', role: 'alert', hidden: true });
  const save = async (e?: Event) => {
    e?.preventDefault();
    const r = await send({ type: 'updateApp', id, url: url.value, name: name.value });
    if (!r.ok) {
      showError(url, urlError, r.message);
      url.focus();
    } else closeSheet();
  };
  url.addEventListener('input', () => showError(url, urlError, null));
  for (const i of [url, name]) i.addEventListener('keydown', (e) => e.key === 'Enter' && void save(e));

  const removeSlot = h('div');
  const askRemove = () =>
    removeSlot.replaceChildren(
      h(
        'div',
        { class: 'confirm' },
        h('span', {}, `Remove ${app.name}? Your sign-in to it is kept.`),
        h('button', { class: 'button danger solid', onclick: () => send({ type: 'removeApp', id }) }, 'Remove'),
        h('button', { class: 'button quiet', onclick: () => removeSlot.replaceChildren(removeButton()) }, 'Keep it'),
      ),
    );
  const removeButton = () => h('button', { class: 'button danger', onclick: askRemove }, 'Remove from Hangar');
  removeSlot.append(removeButton());

  return sheetFrame(
    `Edit ${app.name}`,
    [
      h(
        'form',
        { class: 'group', onsubmit: save },
        field('Address', url, urlError),
        field('Name', name, h('p', { class: 'hint' }, 'Leave it empty to use the app’s own name.')),
      ),
    ],
    [removeSlot, h('span', { class: 'spacer' }), h('button', { class: 'button quiet', onclick: () => closeSheet() }, 'Cancel'), h('button', { class: 'button primary', onclick: () => save() }, 'Save changes')],
  );
}

// ---------------------------------------------------------------- keys the shell itself answers

document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'F6') document.body.classList.add('keyboard');
  if (e.key === 'Escape' && state?.sheet) {
    e.preventDefault();
    closeSheet();
  }
});
document.addEventListener('pointerdown', () => document.body.classList.remove('keyboard'), true);

// Wheel and middle clicks on the chrome do nothing; a stray Ctrl+wheel shouldn't zoom the shell.
document.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });
window.addEventListener('resize', () => placeSelector(true));
bays.addEventListener('scroll', () => placeSelector(true));

// ---------------------------------------------------------------- start

function render(next: ShellState): void {
  const prev = state;
  state = next;
  document.documentElement.dataset.theme = next.theme;
  document.body.classList.toggle('full', next.fullscreen);
  document.body.classList.toggle('mac', next.platform === 'darwin');
  addButton.title = `Add an app (${mod()}+Shift+N)`;
  settingsButton.title = `Settings (${mod()}+,)`;
  renderBays(next);
  renderTop(next, prev);
  renderStage(next, prev);
}

api.onState(render);
void api.state().then((s) => {
  if (!state) render(s);
});

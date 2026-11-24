// Hangar's mark: the mouth of a hangar seen from the apron. Parabolic arch frames (a quadratic Bézier is exactly a
// parabola) recede toward one vanishing point, and the amber lead-in line runs from your feet into the hangar.
// The frames are also the apps, parked one behind another. The shell draws the same geometry inline (src/shell/art.ts).
//
//   node logos/hangar.mjs      writes logos/hangar*.svg; then `npm run icons -- hangar` makes the app's icons from them
//
// hangar.svg is the app icon (night tile), hangar-small.svg the three-frame cut for 32px and below, plus day versions,
// bare glyphs and the wordmark lockups.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const r = (n) => Math.round(n * 100) / 100;

const C = {
  night: '#0a0e16',
  night2: '#1b2231',
  white: '#eef1f6',
  steel: '#8a95ab',
  steelDim: '#4b566c',
  beacon: '#ffb23e',
  ink: '#12161d',
  inkSteel: '#5d6678',
  inkSteelDim: '#a9b1c0',
  beaconDay: '#e08600',
};

// The geometry, in a 256 box.
const VP = { x: 128, y: 162 }; // the vanishing point: eye height of someone standing on the apron, low
const BASE = 188; // the front frame stands on the apron here, on the door rail
const HALF = 94; // half the front frame's span
const APEX = 54; // the front frame's crown: about 0.7 of the span, like an airship hangar
const FRAMES = [1, 0.62, 0.385, 0.24]; // each frame's scale toward VP (a steady 0.62 ratio: evenly spaced frames)

const toward = (p, s) => ({ x: VP.x + s * (p.x - VP.x), y: VP.y + s * (p.y - VP.y) });
function frame(s) {
  const L = toward({ x: 128 - HALF, y: BASE }, s);
  const R = toward({ x: 128 + HALF, y: BASE }, s);
  const Q = toward({ x: 128, y: 2 * APEX - BASE }, s); // a quadratic's control sits twice as far as its crown
  return `M${r(L.x)} ${r(L.y)} Q${r(Q.x)} ${r(Q.y)} ${r(R.x)} ${r(R.y)}`;
}
function leadIn(front = 226, w0 = 6.5) {
  const back = toward({ x: 128, y: BASE }, FRAMES[FRAMES.length - 1]);
  const w1 = w0 * 0.22;
  return `M${r(128 - w0)} ${front} L${r(128 - w1)} ${r(back.y)} L${r(128 + w1)} ${r(back.y)} L${r(128 + w0)} ${front} Z`;
}

function glyph(pal, { frames = FRAMES, stroke = 15, lead = true } = {}) {
  const tones = [pal.white, pal.steel, pal.steel, pal.steelDim];
  const arches = frames
    .map((s, i) => `<path d="${frame(s)}" fill="none" stroke="${tones[i]}" stroke-width="${r(Math.max(stroke * s, 4.2))}" stroke-linecap="round"/>`)
    .reverse()
    .join('\n  ');
  // The door rail across the threshold: what the frames stand on, so the arches read as a building, not a signal.
  const rail = `<path d="M${128 - HALF - 16} ${BASE} H${128 + HALF + 16}" stroke="${pal.steelDim}" stroke-width="${r(stroke * 0.42)}" stroke-linecap="round"/>`;
  return `${rail}
  ${arches}
  ${lead ? `<path d="${leadIn()}" fill="${pal.beacon}"/>` : ''}`;
}

const tile = (top, bottom, edge) => `
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
  <rect width="256" height="256" rx="56" fill="url(#bg)"/>
  <rect x="1.5" y="1.5" width="253" height="253" rx="54.5" fill="none" stroke="${edge}" stroke-width="3"/>`;
const svg = (body, w = 256, h = 256) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}\n</svg>\n`;

const night = { white: C.white, steel: C.steel, steelDim: C.steelDim, beacon: C.beacon };
const day = { white: C.ink, steel: C.inkSteel, steelDim: C.inkSteelDim, beacon: C.beaconDay };

// Wordmark: monoline stencil capitals, like the letters painted over a hangar's doors. The A is the mark's own arch.
const CAP = 100;
const SW = 17;
const letters = {
  H: [60, 'M0 0V100M60 0V100M0 52H60'],
  A: [66, `M0 100Q33 -100 66 100M14 64H52`],
  N: [62, 'M0 100V0L62 100V0'],
  G: [64, 'M56.5 17.9A32 50 0 1 0 63.8 56.1H36'],
  R: [58, 'M0 100V0H30A24 25 0 0 1 30 50H0M28 50L58 100'],
};
function wordmark(color, x0 = 0, y0 = 0, scale = 1, track = 26) {
  let x = 0;
  const parts = [];
  for (const ch of 'HANGAR') {
    const [w, d] = letters[ch];
    parts.push(`<path transform="translate(${r(x)} 0)" d="${d}"/>`);
    x += w + track;
  }
  const width = x - track;
  return {
    width: width * scale,
    body: `<g transform="translate(${x0} ${y0}) scale(${scale})" fill="none" stroke="${color}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round">${parts.join('')}</g>`,
  };
}

const SMALL = { frames: [1, 0.55, 0.3], stroke: 20 };
const files = {
  'hangar.svg': svg(`${tile(C.night2, C.night, 'rgba(255,255,255,.08)')}\n  ${glyph(night)}`),
  'hangar-small.svg': svg(`${tile(C.night2, C.night, 'rgba(255,255,255,.08)')}\n  ${glyph(night, SMALL)}`),
  'hangar-day.svg': svg(`${tile('#ffffff', '#e6e9ee', 'rgba(18,22,29,.10)')}\n  ${glyph(day)}`),
  'hangar-glyph-night.svg': svg(glyph(night)),
  'hangar-glyph-day.svg': svg(glyph(day)),
  'hangar-glyph-small-night.svg': svg(glyph(night, SMALL)),
  'hangar-glyph-small-day.svg': svg(glyph(day, SMALL)),
};
for (const [pal, name, bg] of [
  [night, 'hangar-lockup-night.svg', C.night],
  [day, 'hangar-lockup-day.svg', '#f4f5f8'],
]) {
  const wm = wordmark(pal.white, 0, 0, 0.56);
  const W = 200 + 36 + wm.width + 40;
  files[name] = svg(
    `<rect width="${r(W)}" height="200" fill="${bg}"/>
  <g transform="translate(8 0) scale(0.72) translate(0 12)">${glyph(pal)}</g>
  <g transform="translate(212 72)">${wordmark(pal.white, 0, 0, 0.56).body}</g>`,
    r(W),
    200,
  );
}

for (const [name, text] of Object.entries(files)) writeFileSync(here(`./${name}`), text);
console.log(`wrote logos/${Object.keys(files).join(', logos/')}`);

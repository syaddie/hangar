// Hangar's drawings and icons, inline so they take the theme's colours. The hangar is the logo's (logos/hangar.mjs):
// the mouth of a hangar seen from the apron. Parabolic frames (a quadratic Bézier is exactly a parabola) recede toward
// one vanishing point, low, at the eye height of someone standing outside; the door rail runs across the threshold;
// the amber lead-in line runs from your feet into the hangar. Same numbers here, so the drawings match the icon.

const C = 128;
const VP = { x: 128, y: 162 };
const BASE = 188;
const HALF = 94;
const APEX = 54;
/** Each frame's scale toward the vanishing point: a steady 0.62 ratio, so the frames read as evenly spaced. */
const FRAMES = [1, 0.62, 0.385, 0.24];
/** The cut for 32px and below, where four frames would merge. */
const SMALL = [1, 0.55, 0.3];

const r2 = (n: number) => Math.round(n * 100) / 100;
const toward = (x: number, y: number, s: number) => ({ x: VP.x + s * (x - VP.x), y: VP.y + s * (y - VP.y) });

function frame(s: number): string {
  const L = toward(C - HALF, BASE, s);
  const R = toward(C + HALF, BASE, s);
  const Q = toward(C, 2 * APEX - BASE, s); // a quadratic's control point sits twice as far as its crown
  return `M${r2(L.x)} ${r2(L.y)} Q${r2(Q.x)} ${r2(Q.y)} ${r2(R.x)} ${r2(R.y)}`;
}

function leadIn(scales: number[]): string {
  const back = toward(C, BASE, scales[scales.length - 1]!).y;
  const w0 = 6.5;
  const w1 = w0 * 0.22;
  return `M${C - w0} 226 L${r2(C - w1)} ${r2(back)} L${r2(C + w1)} ${r2(back)} L${C + w0} 226 Z`;
}

/** The frames, farthest first so the nearer ones draw over them. `near`, `mid` and `far` set their colour. */
function frames(scales: number[], stroke: number, extra = ''): string {
  return scales
    .map((s, i) => {
      const tone = i === 0 ? 'near' : i === scales.length - 1 ? 'far' : 'mid';
      return `<path class="frame ${tone}" style="--i:${i}" d="${frame(s)}" stroke-width="${r2(Math.max(stroke * s, 4.2))}"${extra}/>`;
    })
    .reverse()
    .join('');
}

const rail = (stroke: number) => `<path class="rail" d="M${C - HALF - 16} ${BASE} H${C + HALF + 16}" stroke-width="${r2(stroke * 0.42)}"/>`;

/** The mark at the top of the rail: the three-frame cut, drawn inline so it follows the theme. */
export const MARK = `<svg class="art mark" viewBox="0 0 256 256" aria-hidden="true">
  ${rail(20)}${frames(SMALL, 20)}<path class="lead" d="${leadIn(SMALL)}"/>
</svg>`;

/** The lights along the lead-in, front to back, as [y, radius]. */
const LIGHTS = [
  [214, 5.2],
  [199, 4],
  [187, 3],
  [178, 2.3],
];

/**
 * The launch: while the first app loads, the frames light front to back, then the lead-in's lights flash in turn
 * toward the hangar, once a second, like an approach's sequenced flashing lights, until the app is ready.
 */
export const LAUNCH = `<svg class="art launching" viewBox="0 0 256 256" aria-hidden="true">
  ${rail(15)}${frames(FRAMES, 15)}<path class="lead unlit" d="${leadIn(FRAMES)}"/>
  ${LIGHTS.map(([y, rad], i) => `<circle class="light" style="--i:${i}" cx="${C}" cy="${y}" r="${rad}"/>`).join('')}
</svg>`;

/** An app that can't be reached: the hangar is dark. Every frame steel, the lead-in unlit. */
export const LOST = `<svg class="art drawing lost" viewBox="0 0 256 256" aria-hidden="true">
  ${rail(15)}${frames(FRAMES, 15)}<path class="lead unlit" d="${leadIn(FRAMES)}"/>
</svg>`;

/** An empty hangar: the front frame up and the rail laid, the other frames marked out where they'll stand. */
export const EMPTY = `<svg class="art drawing empty" viewBox="0 0 256 256" aria-hidden="true">
  ${rail(15)}${frames(FRAMES.slice(1), 15, ' stroke-dasharray="9 11"').replace('frame near', 'frame mid')}
  <path class="frame near" d="${frame(1)}" stroke-width="15"/>
</svg>`;

const icon = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  back: icon('<path d="M15 5l-7 7 7 7"/>'),
  forward: icon('<path d="M9 5l7 7-7 7"/>'),
  reload: icon('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.8h-4.8"/>'),
  external: icon('<path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>'),
  download: icon('<path d="M12 4v10.5"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>'),
  close: icon('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  up: icon('<path d="M6 15l6-6 6 6"/>'),
  down: icon('<path d="M6 9l6 6 6-6"/>'),
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  update: icon('<path d="M12 15.5V5"/><path d="M7.5 9.5L12 5l4.5 4.5"/><path d="M5 19.5h14"/>'),
  settings: icon('<path d="M4 7h8.5M16.5 7H20M4 17h2.5M10.5 17H20"/><circle cx="14.5" cy="7" r="2"/><circle cx="8.5" cy="17" r="2"/>'),
};

/** A swatch token for an app with no icon, the same one every time for the same app. Each holds a white letter at 4.5:1. */
const SWATCHES = ['--swatch-blue', '--swatch-cyan', '--swatch-violet', '--swatch-pink', '--swatch-brown', '--swatch-slate'];
export function swatchFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `var(${SWATCHES[h % SWATCHES.length]!})`;
}

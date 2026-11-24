// Hangar's drawings and icons, inline so they take the theme's colours. The fan is the logo's (logos/make.mjs,
// "Fan"): a turbofan seen head-on, fourteen swept blades between the hub (r 30) and the tips (r 80), inside a
// nacelle (r 96), with the spiral painted on its spinner. Same numbers here, so the drawings match the icon.

const C = 128;
const HUB = 30;
const TIP = 80;
const NACELLE = 96;
const r2 = (n: number) => Math.round(n * 100) / 100;
const at = (rad: number, a: number) => `${r2(C + rad * Math.cos(a))} ${r2(C + rad * Math.sin(a))}`;

function bladePaths(): string {
  const sweep = (28 * Math.PI) / 180;
  const width = (15 * Math.PI) / 180;
  const mid = (HUB + TIP) / 2;
  let d = '';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    d +=
      `M${at(HUB, a)} Q${at(mid, a + sweep * 0.35)} ${at(TIP, a + sweep)} ` +
      `L${at(TIP, a + sweep + width)} Q${at(mid, a + sweep * 0.35 + width * 0.85)} ${at(HUB, a + width * 0.6)} Z `;
  }
  return d.trim();
}

function spiralPath(): string {
  let d = '';
  for (let s = 0; s <= 40; s++) {
    const t = s / 40;
    d += `${s ? 'L' : 'M'}${at(2 + t * 20, -Math.PI / 2 + t * 1.2 * Math.PI * 2)} `;
  }
  return d.trim();
}

const BLADES = bladePaths();
const SPIRAL = spiralPath();

/** The rotor: blades, spinner and its spiral, which turn together. */
const rotor = `<path class="blades" d="${BLADES}"/>
    <circle class="spinner" cx="${C}" cy="${C}" r="${HUB}"/>
    <path class="spiral" d="${SPIRAL}" fill="none" stroke-width="7" stroke-linecap="round"/>`;

/**
 * The launch: the engine starts. The fan spools up from rest (its angle growing as t², so it's accelerating evenly),
 * then turns at idle for as long as the app takes. Spool-up ends at 225°/s, which is exactly idle's speed, so the hand-
 * over can't be seen. The spiral on the spinner is what shows it turning, as it does for the ground crew.
 */
export const LAUNCH = `<svg viewBox="0 0 256 256" aria-hidden="true">
  <circle class="disc" cx="${C}" cy="${C}" r="${NACELLE}"/>
  <g class="spool"><g class="idle">
    ${rotor}
  </g></g>
  <circle class="nacelle" cx="${C}" cy="${C}" r="${NACELLE}" fill="none" stroke-width="12"/>
</svg>`;

/** An app that can't be reached: the engine is shut down, its blades still and the spinner's spiral unlit. */
export const LOST = `<svg class="drawing off" viewBox="0 0 256 256" aria-hidden="true">
  <circle class="disc" cx="${C}" cy="${C}" r="${NACELLE}"/>
  ${rotor}
  <circle class="nacelle" cx="${C}" cy="${C}" r="${NACELLE}" fill="none" stroke-width="10"/>
</svg>`;

/** An empty hangar: a nacelle with no fan fitted yet, the place for it marked out. */
export const EMPTY = `<svg class="drawing empty" viewBox="0 0 256 256" aria-hidden="true">
  <circle class="nacelle" cx="${C}" cy="${C}" r="${NACELLE}" fill="none" stroke-width="10"/>
  <circle class="marking" cx="${C}" cy="${C}" r="${TIP}" fill="none" stroke-width="5" stroke-dasharray="10 12"/>
  <circle class="marking" cx="${C}" cy="${C}" r="${HUB}" fill="none" stroke-width="5" stroke-dasharray="8 9"/>
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
  settings: icon('<path d="M4 7h8.5M16.5 7H20M4 17h2.5M10.5 17H20"/><circle cx="14.5" cy="7" r="2"/><circle cx="8.5" cy="17" r="2"/>'),
};

/** A swatch for an app with no icon, the same one every time for the same app. */
const SWATCHES = ['#3b6fd4', '#1487a8', '#7a55c7', '#c24f93', '#8a5a3c', '#5b6577'];
export function swatchFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SWATCHES[h % SWATCHES.length]!;
}

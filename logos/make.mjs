// Draws Hangar's logo concepts as SVG, from real geometry: a ballistic arc, a turbofan's face, a NACA 2412 section and
// a Hohmann transfer. `node logos/make.mjs` writes logos/<concept>.svg and logos/preview.html.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const r = (n) => Math.round(n * 100) / 100;

// The family's colours: the night of Apogee's dark theme, sheet-metal steel, and the beacon.
const C = {
  night: '#0b1020',
  night2: '#1a2442',
  steel: '#7d8bab',
  steelDim: '#46557a',
  white: '#f3f5fa',
  beacon: '#ffb23e',
};

const tile = (id, top = C.night2, bottom = C.night) => `
  <defs>
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="url(#${id}-bg)"/>
  <rect x="1.5" y="1.5" width="253" height="253" rx="54.5" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="3"/>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${body}\n</svg>\n`;

// ---- Trajectory: the arc from the pad to apogee, which is also the hangar's roof ----
function trajectory() {
  const floor = 184;
  const left = 36;
  const right = 220;
  const apex = 96;
  const mid = (left + right) / 2;
  const ctrl = floor - 2 * (floor - apex); // a quadratic's control point sits twice as high as its apex
  // Split the parabola at its apex: two quadratics, each with its control point halfway along the tangent.
  const upCtrlX = (left + mid) / 2;
  const upCtrlY = (floor + ctrl) / 2;
  const downCtrlX = (right + mid) / 2;
  return svg(`${tile('tr')}
  <path d="M26 ${floor} H230" stroke="${C.steelDim}" stroke-width="12" stroke-linecap="round"/>
  <path d="M${right} ${floor} Q${downCtrlX} ${upCtrlY} ${mid} ${apex}" fill="none" stroke="${C.steel}" stroke-width="16" stroke-linecap="round"/>
  <path d="M${left} ${floor} Q${upCtrlX} ${upCtrlY} ${mid} ${apex}" fill="none" stroke="${C.white}" stroke-width="16" stroke-linecap="round"/>
  <circle cx="${mid}" cy="${apex}" r="22" fill="${C.night2}"/>
  <circle cx="${mid}" cy="${apex}" r="15" fill="${C.beacon}"/>`);
}

// ---- Fan: a turbofan seen head-on, with the spiral painted on its spinner ----
function fan() {
  const cx = 128;
  const cy = 128;
  const hub = 30;
  const tip = 80;
  const blades = 14;
  const sweep = 28 * (Math.PI / 180);
  const width = 15 * (Math.PI / 180);
  const at = (rad, a) => [r(cx + rad * Math.cos(a)), r(cy + rad * Math.sin(a))];
  let paths = '';
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const [h1x, h1y] = at(hub, a);
    const [h2x, h2y] = at(hub, a + width * 0.6);
    const [t1x, t1y] = at(tip, a + sweep);
    const [t2x, t2y] = at(tip, a + sweep + width);
    const [m1x, m1y] = at((hub + tip) / 2, a + sweep * 0.35);
    const [m2x, m2y] = at((hub + tip) / 2, a + sweep * 0.35 + width * 0.85);
    paths += `<path d="M${h1x} ${h1y} Q${m1x} ${m1y} ${t1x} ${t1y} L${t2x} ${t2y} Q${m2x} ${m2y} ${h2x} ${h2y} Z"/>`;
  }
  // The spinner's spiral: an Archimedean half-turn from the nose outwards.
  let spiral = '';
  const turns = 1.2;
  for (let s = 0; s <= 40; s++) {
    const t = s / 40;
    const a = -Math.PI / 2 + t * turns * Math.PI * 2;
    const [x, y] = at(2 + t * 20, a);
    spiral += `${s === 0 ? 'M' : 'L'}${x} ${y} `;
  }
  return svg(`${tile('fa', '#25304d', '#0e1428')}
  <circle cx="${cx}" cy="${cy}" r="96" fill="${C.night}"/>
  <g fill="#b9c3d8">${paths}</g>
  <circle cx="${cx}" cy="${cy}" r="96" fill="none" stroke="${C.white}" stroke-width="14"/>
  <circle cx="${cx}" cy="${cy}" r="${hub}" fill="${C.white}"/>
  <path d="${spiral.trim()}" fill="none" stroke="${C.beacon}" stroke-width="6" stroke-linecap="round"/>`);
}

// ---- Airfoil: a NACA 2412 section at 8° nose up, with the flow splitting at its stagnation point ----
function naca(m, p, t, n = 60) {
  const upper = [];
  const lower = [];
  for (let i = 0; i <= n; i++) {
    const beta = (i / n) * Math.PI;
    const x = (1 - Math.cos(beta)) / 2; // cosine spacing: finer at the nose and tail
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = x < p ? (m / p ** 2) * (2 * p * x - x ** 2) : (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x ** 2);
    const dyc = x < p ? ((2 * m) / p ** 2) * (p - x) : ((2 * m) / (1 - p) ** 2) * (p - x);
    const th = Math.atan(dyc);
    upper.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)]);
    lower.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)]);
  }
  return { upper, lower };
}

function airfoil() {
  // NACA 4415: a cambered, 15% thick section, so it reads as a wing even at taskbar size.
  const { upper, lower } = naca(0.04, 0.4, 0.15);
  const chord = 168;
  const lead = 128 - chord / 2 + 6;
  const base = 140;
  const tilt = -5; // the whole picture climbs a little
  const P = ([x, y]) => [r(lead + x * chord), r(base - y * chord)];
  const pts = [...upper.slice().reverse(), ...lower.slice(1)].map(P);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ') + ' Z';

  // Height of a surface above the chord line at x (in chords), interpolated; nothing beyond the section.
  const surface = (side, x) => {
    if (x <= 0 || x >= 1) return 0;
    for (let i = 1; i < side.length; i++) {
      const [x1, y1] = side[i];
      const [x0, y0] = side[i - 1];
      if ((x0 - x) * (x1 - x) <= 0) return x1 === x0 ? y0 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
    return 0;
  };
  // A streamline a gap away from a surface: the surface's shape, blurred more the farther away the line runs, as the
  // body's influence on the flow spreads and fades with distance.
  const stream = (side, gap, pull) => {
    const sigma = 0.07 + (Math.abs(gap) / chord) * 0.6;
    let s = '';
    for (let i = 0; i <= 72; i++) {
      const X = 18 + (i / 72) * 220;
      const x = (X - lead) / chord;
      let sum = 0;
      let weight = 0;
      for (let k = -60; k <= 60; k++) {
        const u = x + (k / 60) * 3 * sigma;
        const w = Math.exp(-(((u - x) / sigma) ** 2) / 2);
        sum += w * surface(side, u);
        weight += w;
      }
      const y = base - gap - (sum / weight) * chord * pull;
      s += `${i ? 'L' : 'M'}${r(X)} ${r(y)} `;
    }
    return s.trim();
  };
  const [nx, ny] = P([0, 0]);
  return svg(`${tile('af')}
  <g transform="rotate(${tilt} 128 128)" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
    <path d="${stream(upper, 56, 1.1)}" stroke="${C.steelDim}"/>
    <path d="${stream(upper, 26, 1.2)}" stroke="${C.steel}"/>
    <path d="${stream(lower, -28, 0.8)}" stroke="${C.steelDim}"/>
    <path d="${d}" fill="${C.white}" stroke="none"/>
    <circle cx="${nx}" cy="${ny}" r="19" fill="${C.night2}" stroke="none"/>
    <circle cx="${nx}" cy="${ny}" r="12" fill="${C.beacon}" stroke="none"/>
  </g>`);
}

// ---- Transfer: two orbits and the Hohmann ellipse between them, the craft arriving at apogee ----
function transfer() {
  const cx = 128;
  const cy = 128;
  const r1 = 40;
  const r2 = 92;
  const tilt = -30;
  const a = (r1 + r2) / 2;
  const c = a - r1;
  const b = Math.sqrt(a * a - c * c);
  // Periapsis on the left at r1, apoapsis on the right at r2; draw the upper half, flown from one to the other.
  const px = cx - r1;
  const ax = cx + r2;
  return svg(`${tile('ho')}
  <g transform="rotate(${tilt} ${cx} ${cy})">
    <circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="${C.steelDim}" stroke-width="8"/>
    <circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="${C.steel}" stroke-width="8"/>
    <path d="M${px} ${cy} A ${r(a)} ${r(b)} 0 0 1 ${ax} ${cy}" fill="none" stroke="${C.white}" stroke-width="14" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="15" fill="${C.white}"/>
    <circle cx="${ax}" cy="${cy}" r="24" fill="${C.night2}"/>
    <circle cx="${ax}" cy="${cy}" r="16" fill="${C.beacon}"/>
  </g>`);
}

const concepts = [
  {
    id: 'trajectory',
    name: 'Trajectory',
    story:
      'One ballistic arc: it climbs from the pad (Launchpad) to the beacon at its peak (Apogee), and the same curve is the arched roof of a hangar. The flown half is lit, the half still to fly is steel.',
    draw: trajectory,
  },
  {
    id: 'fan',
    name: 'Fan',
    story:
      'A turbofan seen head-on, with the spiral painted on the spinner so the ground crew can see it turning. It stands for the engines from your work, inside the nacelle that houses them.',
    draw: fan,
  },
  {
    id: 'airfoil',
    name: 'Airfoil',
    story:
      'A true NACA 4415 section, climbing a little, with the flow bending over it. The beacon marks the stagnation point, where the flow splits at the leading edge. It stands for the coursework.',
    draw: airfoil,
  },
  {
    id: 'transfer',
    name: 'Transfer',
    story:
      'A Hohmann transfer: the craft leaves the inner orbit and arrives on the outer one at apogee. Switching apps is a move between orbits. It echoes Apogee’s own orbit mark.',
    draw: transfer,
  },
];

for (const c of concepts) writeFileSync(here(`./${c.id}.svg`), c.draw());

const cards = concepts
  .map((c) => {
    const s = c.draw();
    const uri = `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;
    const sizes = [64, 32, 24, 16]
      .map((z) => `<img src="${uri}" width="${z}" height="${z}" alt="">`)
      .join('');
    return `
  <section class="concept">
    <div class="hero">${s}</div>
    <div class="text">
      <h2>${c.name}</h2>
      <p>${c.story}</p>
      <div class="strip dark">${sizes}</div>
      <div class="strip light">${sizes}</div>
      <div class="rail"><img src="${uri}" width="28" height="28" alt=""><span>Hangar</span></div>
    </div>
  </section>`;
  })
  .join('');

writeFileSync(
  here('./preview.html'),
  `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Hangar logo concepts</title>
<style>
  @font-face { font-family: "Atkinson"; src: url("../node_modules/@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff2"); font-weight: 400; }
  @font-face { font-family: "Atkinson"; src: url("../node_modules/@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-700-normal.woff2"); font-weight: 700; }
  body { margin: 0; background: #f5f6f8; color: #161a22; font: 16px/24px Atkinson, "Segoe UI", sans-serif; }
  main { max-width: 1040px; margin: 0 auto; padding: 48px 32px 64px; }
  h1 { font-size: 28px; line-height: 34px; margin: 0 0 8px; letter-spacing: -0.01em; }
  .lede { margin: 0 0 40px; color: #4a5160; max-width: 62ch; }
  .concept { display: grid; grid-template-columns: 256px 1fr; gap: 40px; align-items: center; padding: 32px 0; border-top: 1px solid #dfe2e8; }
  .hero svg { display: block; width: 256px; height: 256px; filter: drop-shadow(0 12px 28px rgba(11,16,32,.22)); }
  h2 { font-size: 20px; line-height: 26px; margin: 0 0 8px; }
  p { margin: 0 0 20px; color: #4a5160; max-width: 60ch; }
  .strip { display: inline-flex; gap: 20px; align-items: center; padding: 12px 18px; border-radius: 10px; margin: 0 8px 8px 0; }
  .strip.dark { background: #1f1f1f; }
  .strip.light { background: #f3f3f3; border: 1px solid #e3e3e3; }
  .rail { display: flex; align-items: center; gap: 10px; width: 200px; padding: 6px 12px; border-radius: 10px; background: #0e1322; color: #e8ecf5; font-weight: 700; margin-top: 4px; }
  @media (max-width: 700px) { .concept { grid-template-columns: 1fr; } }
</style>
<main>
  <h1>Hangar: four logo ideas</h1>
  <p class="lede">Each is drawn from real geometry and shown big, at taskbar sizes on dark and light, and next to the name as it would sit at the top of the app. They share Apogee's night sky and steel, plus a beacon light for the one bright detail.</p>
  ${cards}
</main>
</html>
`,
);
console.log('wrote', concepts.map((c) => c.id + '.svg').join(', '), 'and preview.html');

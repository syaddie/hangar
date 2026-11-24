# Hangar design

## The feel

The hangar the owner's apps are parked in: a quiet frame of sheet metal around them, so each app looks as it does on
its own. It's from the same family as Apogee (its night sky, its type, its motion) and takes the aerospace character
in the details:

- the logo is a turbofan seen head-on, fourteen swept blades in their nacelle, with the spiral painted on the spinner
  (the owner's choice, 2026-11-24);
- **the beacon**, the one bright thing: the amber bar beside the app you're in, which glides between bays and settles
  like a selector dropping into a detent. The spinner's spiral is the same amber: amber means running;
- the launch: while the first app loads, the engine starts. The fan spools up from rest (its angle growing as t²) and
  hands over to a steady idle at exactly the speed spool-up ended on, so there's no jolt, until the app is ready;
- loading is a contrail along the app's top edge;
- an app that can't be reached shows the engine shut down: blades still, everything steel, the spiral unlit;
- an empty hangar shows a nacelle with no fan fitted yet, the place for it marked out.

## Layout

```
┌──────┬───────────────────────────────────────────────────┬───────────┐
│ logo │ ‹  ›  ⟳   Launchpad   Today                ↓  ↗  │  —  ▢  ✕  │  top bar, 44px, drags the window
├──────┼─────────────────────────────────────────────────────────────────┤
│▌ [A] │ ╭─────────────────────────────────────────────────────────────╮ │
│  [L] │ │                                                             │ │
│      │ │              the app (its own view, radius 10)              │ │
│  ＋  │ │                                                             │ │
│  ⚙  │ ╰─────────────────────────────────────────────────────────────╯ │
└──────┴─────────────────────────────────────────────────────────────────┘
  rail 64px                                              8px to the edges
```

The window's own minimise, maximise and close buttons are Windows' (a title-bar overlay in the chrome's colours), so
snapping and the rest work as they do everywhere. In full screen (F11, or a video asking for it) the rail and top
bar go and the app fills the screen.

The app area behind the views is where the shell's own screens go: the launch, an app opening for the first time,
an app that can't be reached, an empty hangar and the sheets. A sheet covers the app with a still of it, dimmed,
because nothing the shell draws can sit on top of a live view.

## Tokens

CSS variables in `src/shell/shell.css`, named as Apogee's are where they mean the same thing.

| Token | Light (aluminium) | Dark (night) | Use |
|---|---|---|---|
| `chrome` | `#e6e9ef` | `#0d1222` | The rail and top bar; also the window and title-bar overlay (`CHROME` in `src/main/hangar.ts`) |
| `bay` | `#dde1e8` | `#111830` | The app area when no app covers it |
| `plate` | `#ffffff` | `#1a2340` | The current bay |
| `surface` | `#ffffff` | `#151c31` | Sheets, fields |
| `surface-2` | `#eef0f4` | `#1c2540` | Quiet fills: the segmented control, keys |
| `line` / `line-strong` | `#d3d8e1` / `#7f8796` | `#232c47` / `#6a7694` | Hairlines / control borders |
| `ink`, `ink-2`, `ink-3` | `#161a22`, `#4a5160`, `#5f6776` | `#e8ecf5`, `#b4bdd0`, `#8f9ab2` | Text; nothing lighter than `ink-3` carries words |
| `accent` | `#2b4acb` | `#8fa6ff` | Primary buttons, focus rings (Apogee's) |
| `beacon` | `#e28a00` | `#ffb23e` | The selector, the spinner's spiral, the contrail, download progress. Nothing else |
| `blade`, `disc` | `#8a97b2`, `#cdd3de` | `#b9c3d8`, `#0b1020` | The fan drawings' blades and the dark behind them |
| `danger` | `#c0271c` | `#ff8a7a` | Removing, and an app's "can't be reached" light |

Type: Atkinson Hyperlegible Next for words, Atkinson Hyperlegible Mono for figures (zoom, find counts, error codes,
keys), both bundled. Sizes follow Apogee's: 20/26 titles, 16/24 body in sheets, 14/20 in the chrome, 12/16 mono.

Radius: 6 tags and keys, 10 buttons, fields and the app, 12 bays, 16 sheets.

Motion: Apogee's durations and curves (`dur-press` 90 to `dur-draw` 900, `ease-out`, `ease-dock`), plus `ease-spool`
(exactly t²) for the fan spooling up. Everything moving answers something the owner did, except the launch and the contrail, which say
something is loading. With reduced motion, things change in place.

## Words

Sentence case, plain verbs, the app's name rather than "the app" wherever it's known. An action keeps its name: **Add
app** adds an app, **Remove from Hangar** removes it, **Try again** tries again. Errors say what happened and what to
do, never "something went wrong": "127.0.0.1:4399 turned the connection away. The app may not be running."

## Rules for whoever builds a screen

1. Use the tokens; no raw colours or sizes in a component.
2. The beacon marks where you are. Don't use amber for anything else.
3. The shell can't draw over a live app. Anything that must cover one is a sheet (a still behind it) or a native
   menu or dialog.
4. Every bay action is in its right-click menu too, and every right-click menu item is reachable from the keyboard.
5. Focus rings show once the keyboard is in use (`.keyboard` on the body), and always on text fields.
6. Check light and dark, and the smallest window, in `npm run smoke`'s pictures.

# Hangar design

## The feel

The bezel round a flight deck's display: the shell frames the apps and stays out of their way, so each app looks as it
does on its own. The aerospace character comes from how a flight deck is designed, not from pictures of aircraft. The
full system, with live previews of every part, is the **Hangar** design system artifact
(https://claude.ai/artifact/SaJRisVSbrApxTfd32eRGB); this file is its summary for the code.

- **Colour only means something**, as on a glass cockpit: the legends are ink and grey, primary buttons are ink (not
  blue), cyan (`select`) is yours to act on (focus, a ticked box, Restart to update), red (`danger`) is can't or can't
  undo;
- **the beacon**, the one bright thing: the amber lead-in line beside the app you're in, like the yellow line that
  leads an aircraft into its stand. It glides between bays and settles like a selector dropping into a detent. Amber is
  the beacon and things on their way in (the contrail, a download, the launch), nothing else;
- **placards**: each group in a sheet is headed by mono capitals in `ink-3`, like the stencilled labels on a panel;
- **the logo** is the mouth of a hangar seen from the apron: four parabolic frames receding to a low vanishing point,
  the door rail across the threshold, the amber lead-in running inside. The frames are also the apps, parked one behind
  another (the owner's choice, 2026-11-24; `logos/hangar.mjs`);
- the launch: while the first app loads, the hangar's frames light front to back, then four lights along the lead-in
  flash in turn toward the hangar once a second, like an approach's sequenced flashing lights, until the app is ready;
- loading is a contrail along the app's top edge;
- an app that can't be reached shows the hangar dark: every frame steel, the lead-in unlit;
- an empty hangar shows the front frame and the rail, the other frames marked out dashed where they'll stand.

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

CSS variables in `src/shell/shell.css`, the same names and values as the design system's `tokens.json`. Every text
pair is at least 4.5:1, and every control edge, ring and meaningful mark 3:1, in both themes.

| Token | Day (anodised aluminium) | Night (unlit flight deck) | Use |
|---|---|---|---|
| `chrome` | `#eceef2` | `#0a0e16` | The rail and top bar; also the window and title-bar overlay (`CHROME` in `src/main/hangar.ts`) |
| `bay` | `#e2e5ea` | `#0f141e` | The app area when no app covers it; the segmented control's track |
| `plate` | `#ffffff` | `#1a2130` | The current bay (with a `line` edge), the picked segment |
| `surface` | `#ffffff` | `#141a25` | Sheets, fields |
| `surface-2` | `#f2f4f7` | `#1c2331` | Quiet fills: keys, meter tracks |
| `line` / `line-strong` | `#d6dae2` / `#7b8393` | `#262e3d` / `#6b7488` | Hairlines / control borders |
| `ink`, `ink-2`, `ink-3` | `#12161d`, `#454d5c`, `#5b6372` | `#e9edf4`, `#b3bbca`, `#8d96a8` | Text; nothing lighter than `ink-3` carries words |
| `primary` / `on-primary` | `ink` / `#ffffff` | `ink` / `#0a0e16` | The one primary button |
| `select` / `-soft` / `on-` | `#0a6d8c` / `#dff1f6` / `#ffffff` | `#62cbe6` / `#0f2f3a` / `#0a0e16` | Cyan, yours to act on: focus rings, ticks, Restart to update |
| `beacon` / `-glow` | `#c27400` | `#ffb23e` | The lead-in beside your bay, the drawings' lead-in, the contrail, download progress. Nothing else |
| `danger` / `-soft` | `#c0271c` | `#ff8a7a` | Removing, field errors, and an app's "can't be reached" light |
| `steel`, `steel-dim` | `#6f7a90`, `#959eb0` | `#8a95ab`, `#4b566c` | The hangar drawings' farther frames and rail; never text |
| `swatch-*`, `on-swatch` | six colours, white letter | the same | Monograms for apps with no icon, each 4.5:1 or more |

Type: Atkinson Hyperlegible Next for words, Atkinson Hyperlegible Mono for placards and figures (zoom, find counts,
error codes, keys, the version), both bundled. 20/26 titles, 16/24 body in sheets, 14/20 in the chrome, 12/16 mono;
placards are mono capitals tracked 0.08em.

Radius: 4 keys, 8 buttons, icon buttons and fields, 10 bays and the app, 14 sheets and lists. Tighter than a phone
app's, like machined parts. Everything sits flat; the only shadow is `shadow-overlay`, under a sheet or a dragged bay.

Motion: `dur-press` 90, `dur-hover` 160, `dur-state` 240, `dur-screen` 280, `dur-rabbit` 1000 (one run of the launch's
lights); `ease-out`, `ease-in-out`, and `ease-dock`, a damped spring with a 2% overshoot. Everything moving answers
something the owner did, except the launch and the contrail, which say something is loading. With reduced motion,
things change in place and the launch's lights hold still.

## Words

Sentence case, plain verbs, the app's name rather than "the app" wherever it's known. An action keeps its name: **Add
app** adds an app, **Remove from Hangar** removes it, **Try again** tries again. Errors say what happened and what to
do, never "something went wrong": "127.0.0.1:4399 turned the connection away. The app may not be running."

## Rules for whoever builds a screen

1. Use the tokens; no raw colours or sizes in a component.
2. The beacon marks where you are, and amber the way in. Don't use amber for anything else, or blue for buttons.
3. The shell can't draw over a live app. Anything that must cover one is a sheet (a still behind it) or a native
   menu or dialog.
4. Every bay action is in its right-click menu too, and every right-click menu item is reachable from the keyboard.
5. Focus rings show once the keyboard is in use (`.keyboard` on the body), and always on text fields.
6. Check light and dark, and the smallest window, in `npm run smoke`'s pictures.

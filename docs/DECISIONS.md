# Decisions

- **2026-11-24: A shell around the apps' real sites, not a copy of them.** Hangar loads `apogee.syaddy.com` and
  `launchpad.syaddy.com` in views of its own. The apps stay as they are, deploys show up on the next reload, and a new
  app is one address. An iframe page couldn't do it: Apogee only lets itself frame itself (`frame-ancestors 'self'`).
- **2026-11-24: Electron, with one `BaseWindow` and a `WebContentsView` per app.** All TypeScript like the apps, and
  mature support for several live views in one window. Tauri's would be a much smaller download but adds Rust and its
  multi-view support is younger.
- **2026-11-24: Every app stays alive once opened, and the rest load behind the first.** Switching is instant and
  nothing loses its place. Two or three apps are well within what one window can hold.
- **2026-11-24: One shared, saved session (`persist:hangar`) for all apps.** A Cloudflare Access sign-in carries from
  one app's domain to the next, and survives restarts. The user agent leaves out "Electron" and "hangar", which some
  sign-in pages (Google's) turn away.
- **2026-11-24: Link rules are pure functions (`src/main/policy.ts`), tested.** Within an app and its sign-in: stay.
  To another app: switch to it at that page. An app's new window on itself (Launchpad's file previews): a window of
  its own. Anything else: the default browser. Server redirects are never routed, so sign-ins always go through.
- **2026-11-24: Windows' own window controls**, as a title-bar overlay in the chrome's colours, rather than drawn ones,
  so snap layouts and the rest work as everywhere. The overlay is 1px shorter than the top bar, as at 150% scaling it
  otherwise covered the app's top edge.
- **2026-11-24: Sheets cover the app with a dimmed still of it**, since the shell can't draw over a live view. Menus
  and confirmations elsewhere are native.
- **2026-11-24: Focus rings only after the keyboard is used.** Chromium focuses the first button when the window opens,
  which put a ring on the first bay; the app also takes the keyboard as soon as it appears.
- **2026-11-24: Theme follows Windows by default and drives the apps' `prefers-color-scheme`**, so an app set to
  follow the system follows Hangar. Light is brushed aluminium; dark is Apogee's night.
- **2026-11-24: The logo is Fan, the owner's pick** of four ideas in `logos/` (Trajectory, Fan, Airfoil, Transfer),
  for the engines of their work. The shell's drawings were redrawn from the same geometry (`src/shell/art.ts`): the
  launch spools the fan up (t², 180° in 1.6 s, ending at 225°/s) and idles at 225°/s so the hand-over is seamless; a
  failed load shows it shut down; an empty hangar, an empty nacelle. The spinner's spiral takes the beacon's amber.
- **2026-11-24: The smoke test pictures the window from Chromium's own captures** (the shell's, with the visible app's
  laid over it), not Windows' window capture, which missed layers Chromium animates on their own (a fading scrim).

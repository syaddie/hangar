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
- **2026-11-24: Hangar updates itself from GitHub Releases** (electron-updater, bundled into the main process). Every
  push to `main` builds and publishes `0.1.<run number>` from a Windows runner; the repository is public so the app
  can read releases with no token in it. Hangar checks 8 s after opening, every 4 h and on waking, downloads in the
  background (differentially, from the blockmap), and installs on **Restart to update** or, silently, on the next quit.
  A restart to update reopens each app on its page (`Config.resume`: its own origin only, used once).
  `HANGAR_UPDATES=off` switches it off for testing an installed copy.
- **2026-11-24: A bay's pointer is captured only once a drag starts.** Captured on press, Chromium sent the click to the
  bay rather than its button, so clicking an app's icon did nothing. The smoke test now clicks with real mouse events.
- **2026-11-24: Releases are opened as drafts and published last.** Run 1 failed: electron-builder's uploads each raced
  to create the release, and GitHub refused the second ("Published releases must have a valid tag"), leaving v0.1.1
  with only a blockmap. The workflow now creates the draft itself, electron-builder uploads into it
  (`releaseType: draft`), and a last step publishes it only if the installer, its blockmap and `latest.yml` are all on
  it. A half-uploaded release stays a draft, which installed copies never see.
- **2026-11-24: A design system of its own, themed on a flight deck** (the owner asked for a cleaner look in an
  aerospace theme). It lives as the Hangar design system artifact; `docs/DESIGN.md` summarises it. The shell is
  monochrome and colour only means something, as on a glass cockpit: primary buttons are ink rather than Apogee's blue,
  cyan (`select`) is yours to act on, red is can't. Night moved from Apogee's navy to a near-black with a little blue,
  so the bezel reads apart from the apps inside it. Radii tightened (4/8/10/14), and group headings became mono
  placards.
- **2026-11-24: The beacon stays amber, now as the lead-in line** into the bay you're in (airfield lead-in lines are
  yellow), rather than "amber means running". Magenta (the FMS route colour) was considered and not tried: beside
  cyan on near-black it would risk reading as neon, and the owner had already chosen amber.
- **2026-11-24: The logo is the hangar mouth, replacing Fan**, the owner's pick of the new design. Four parabolic frames
  (each a quadratic Bézier, so an exact parabola) recede toward a vanishing point set low, at the eye height of someone
  on the apron, with the door rail and the amber lead-in. The first draft, with the vanishing point high and no rail,
  read as a Wi-Fi signal. `logos/hangar.mjs` draws it; `npm run icons -- hangar` uses its three-frame cut for 32px and
  below, where four frames merge. The rail draws the mark inline (`MARK` in `src/shell/art.ts`) so it follows the
  theme. The launch became the frames lighting up and sequenced lights running along the lead-in; can't-reach, the
  hangar dark; the empty hangar, the frames marked out.
- **2026-11-24: The top bar never shortens the app's name.** At the smallest window "Launchpad" was cut to "Launchp"
  while a saved file's name kept its room. The title keeps at least the app's name (`min-width: min-content`) and the
  right-hand tools (`.tools.end`) give way first.
- **2026-11-25: The release workflow uses `actions/checkout@v7` and `actions/setup-node@v7`**, which run on Node 24.
  The v4s ran on Node 20, which GitHub is retiring (run 3 warned it was forcing them onto Node 24). The breaking
  changes since v4 are to automatic npm caching, and the workflow sets `cache: npm` itself; it signs in to `gh` with
  `GH_TOKEN`, not checkout's stored credentials.

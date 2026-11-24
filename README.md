# Hangar

One desktop window for Apogee, Launchpad and whatever apps come after them. Each app gets a bay in the rail on the
left; click one, or press Ctrl+1, Ctrl+2…, and it's there. Every app stays open in the background, so switching is
instant and nothing reloads or loses its place: a Launchpad terminal keeps running while you're in Apogee.

Hangar doesn't contain the apps. It opens their real sites (`apogee.syaddy.com`, `launchpad.syaddy.com`) in views of
its own, so the apps need no changes and every deploy shows up on the next reload.

## Running it

From this folder, with Node 22 or later on the path:

```powershell
npm install
npm start
```

To install it like any other program, build the installer and run it. It installs for you alone, needing no admin
rights, and puts Hangar in the Start menu:

```powershell
npm run dist
```

```powershell
.\release\Hangar-Setup-0.1.0.exe
```

The installer isn't signed, so Windows SmartScreen asks before running it the first time ("More info", then "Run
anyway"). On a managed work PC, IT policy may stop unsigned programs altogether; `npm start` from this folder still
works then.

## Updates

Hangar keeps itself up to date. Every push to `main` has GitHub Actions check the code, build a new version
(`0.1.<run number>`) and publish it as a release of `syaddie/hangar`, which must be a public repository so Hangar
can read its releases without a password. The installed Hangar looks for a new release soon after it opens, every
four hours and when the computer wakes, and downloads it in the background (only the parts that changed). Then a
**Restart to update** button appears in the top bar: press it, and Hangar installs the new version and reopens with
each app on the page it was on. Or ignore it, and the update installs itself the next time you quit Hangar.

Settings › Updates shows where things stand, with **Check now**. What the updater did is logged in
`%APPDATA%\Hangar\logs\updates.log`. Running from source (`npm start`), there's nothing to update.

## Signing in

The first time each app opens, it shows Cloudflare's sign-in page inside Hangar. Sign in there once. All the apps
share one saved session, so the sign-in is kept across restarts, and one sign-in to Cloudflare Access covers every app
behind it.

Google's own sign-in pages sometimes refuse to run inside an app like this. If Launchpad's "Connect Google" is turned
away, connect it once from your normal browser instead: Launchpad keeps the connection on its server, so Hangar picks
it up.

## Adding an app

Press **+** at the foot of the rail (or Ctrl+Shift+N), type its address and choose **Add app**. Hangar takes the app's
name and icon from its web manifest once it has opened, so nothing else needs filling in. Right-click a bay to reload
it, open it in your browser, move it, edit its address or remove it; or drag bays up and down the rail to reorder them.

## Links

- A link within an app stays in that app.
- A link to another app in Hangar opens that app at the linked page.
- A link an app opens in a new window on itself (a file preview, say) gets a window of its own.
- Anything else opens in your default browser.

Downloads go straight to your Downloads folder, as in a browser; the arrow in the top bar lists them.

## Keys

| | |
|---|---|
| Ctrl+1 to Ctrl+8 | Switch to that app (Ctrl+9 is the last) |
| Ctrl+Tab, Ctrl+Shift+Tab | Next or previous app |
| Alt+Left, Alt+Right (or the mouse's side buttons) | Back and forward |
| Ctrl+R, F5 | Reload (Ctrl+Shift+R skips the cache) |
| Ctrl+F | Find in the page |
| Ctrl+=, Ctrl+-, Ctrl+0 | Zoom, kept per app |
| F11 | Full screen, with the rail and top bar hidden |
| Ctrl+Shift+N | Add an app |
| Ctrl+, | Settings |

## The logo

Hangar's logo is **Fan**: a turbofan seen head-on, with the spiral painted on its spinner. The app's own drawings
use the same fan: it spools up while the first app loads, sits shut down when an app can't be reached, and an empty
hangar shows a nacelle with no fan fitted yet. The other ideas (Trajectory, Airfoil, Transfer) are still in `logos/`,
with `logos/preview.html` to compare them. `npm run icons -- <name>` remakes the icons from one, though the drawings
would then want redrawing to match.

## Where things live

- Hangar's own settings, its apps and their order: `hangar.json` in `%APPDATA%\Hangar`.
- The apps' sign-ins and data: in the same folder, under `Partitions\hangar`, the same way a browser profile keeps
  them. Removing an app from Hangar keeps its sign-in, so adding it back carries on where you were.

## Working on it

`docs/DESIGN.md` is how it looks and why, `docs/DECISIONS.md` the choices made, and `docs/TESTING.md` how to see a
change working. Before calling something done: `npm run typecheck`, `npm test` and `npm run smoke`.

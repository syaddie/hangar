# Seeing a change working

`npm test` covers the rules (addresses, links, keys, the saved config). `npm run smoke` opens the real Hangar, walks
it through its screens and checks its behaviour, saving a picture after each step in `.smoke/` (ignored by git):

- an app, a switch, settings in dark and light, the add sheet, an app that can't be reached, find, zoom, a download
  and the smallest window; then, in Hangars of their own, the launch (spooling up, then at idle, in dark and light,
  using an address nothing answers) and an empty hangar;
- links to the browser, to another app and to a window of their own; a download landing; Ctrl+number and Ctrl+Tab;
  dragging a bay to reorder. It ends with "N of N checks passed", and exits with 1 if any failed.

It uses a data folder of its own (`.smoke/data`) and downloads to `.smoke/downloads`, never Hangar's real ones, and
catches links bound for the browser instead of opening one.

## The stand-in apps

The smoke test expects Apogee on `http://127.0.0.1:4311` and Launchpad on `http://127.0.0.1:8799`, run from their
repos next door. Any two web apps will do; set `HANGAR_APPS` to a JSON list of `{ "id", "name", "url" }` to use others.

- **Launchpad:** its built server (`npm run build` in `../launchpad`), started with `PORT=8799` and a `DATA_DIR` of
  its own.
- **Apogee:** `npm run demo` in `../apogee` (Node 26) serves it on 4310 with made-up data; set `APOGEE_PORT=4311`. On an
  older Node, `node scripts/serve-static.mjs ../apogee/dist/web 4311` serves its built pages, which is enough for
  Hangar's purposes (the pages load; their data doesn't).

## Trying Hangar by hand without touching your real setup

```powershell
$env:HANGAR_DATA = "$PWD\.smoke\try"; npm start
```

`HANGAR_DATA` moves Hangar's saved state and sign-ins to that folder, and `HANGAR_APPS` sets the apps for a folder
with nothing saved yet.

## Testing an update

Updating needs an installed copy, so test it under another name, never the owner's own Hangar. Build two versions
from a copy of `package.json`'s `build` settings that changes `appId`, `productName`, `extraMetadata.name` (the install
folder) and `extraMetadata.version`, and points `publish` at a generic URL on this computer. Serve the newer build's
folder there with `scripts/serve-static.mjs` and run the older one: it finds, downloads and offers the newer within
seconds. It also installs the newer one when it quits (that's what it's for), so remove the test app from Windows'
installed apps afterwards. `HANGAR_UPDATES=off` stops an installed copy updating at all.

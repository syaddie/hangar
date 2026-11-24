# Working on Hangar

Hangar is a desktop app (Electron) that holds the owner's web apps, Apogee and Launchpad first, in one window: a rail
of bays down the left, each app kept alive in a view of its own, switching instantly. It never changes the apps
themselves; it loads their real sites. `README.md` says what it does, `docs/DESIGN.md` how it looks, and
`docs/DECISIONS.md` the choices already made.

## No loose ends

Whatever the change, it isn't finished until there are no loose ends:

- **No bugs.** Try more than the happy path: no apps, many apps, an app that can't be reached, one still signing in.
- **Clean at every window size**, down to the 560 by 420 minimum, in light and dark, and in full screen.
- **Seen working in the app**, not just in tests: `npm run smoke` (`docs/TESTING.md`) opens the real Hangar and saves
  pictures of each screen in `.smoke/`. Look at them. If you couldn't check something, say so.

## Every feature looks like Hangar

- **Follow `docs/DESIGN.md`**: its tokens, its one bright thing (the beacon), its motion and its words. Reuse what's
  there before making something new, and add anything new to `docs/DESIGN.md` and `docs/DECISIONS.md`.
- The shell frames the apps and stays out of their way. Nothing in it competes with them.

## Hangar holds other people's pages

The apps are trusted, but anything they link to might not be:

- App views stay sandboxed, with context isolation and no Node. Never give them a preload or `nodeIntegration`.
- Link routing lives in `src/main/policy.ts`, as tested functions. Change it there, with tests, and keep sign-in
  flows (Cloudflare Access, identity providers) inside the app.
- Permissions go only to the apps' own origins, and only the few in `prepareSession`.
- Saved state goes through `readConfig`, which drops anything malformed rather than failing to start.

## Checks and merging

Work on a branch. Before merging: `npm run typecheck`, `npm test` and `npm run smoke` (with the stand-in apps running).
Stop and ask the owner before merging if a check fails, if a change touches sign-in, permissions, link routing or
anything else security-sensitive, or if you weren't sure what was wanted.

## Keep a decisions log

When a design choice is made, add a short dated line to `docs/DECISIONS.md`, so a later session doesn't re-argue it.

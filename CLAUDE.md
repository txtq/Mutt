# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Handoff rule

The handoff notes are **one shared file: `/Users/edan/Mutt/PROGRESS.md`**, in the main checkout. Most sessions run in a worktree under `.claude/worktrees/`, and the `PROGRESS.md` there is a stale copy from when the worktree was made, which never reaches the other sessions. So:
- Read `/Users/edan/Mutt/PROGRESS.md` at the start of every session, on its own (the Read tool, not chained with other commands, so one bad path can't fail the read).
- After finishing each task, update that same file: what was done, what's next (name your branch if it isn't merged), and any new preferences the user gave. Don't edit the worktree's own `PROGRESS.md`, or merging branches will conflict.
- Preferences that should hold for all future work also go in the **User preferences** section below.
- The shared file is committed on `galaxy` from the main checkout, along with merges and deploys.
- `/handoff` (`.claude/commands/handoff.md`) does this update on demand.

## What Mutt is

A personal, multi-user place to keep files and connect them (like Are.na), dressed as a PS Vita–style galaxy. Login is a username plus a 4-digit code. `README.md` covers features, env vars and hosting.

Vocabulary, because the UI and the code use different words:

| UI | Code / DB |
| --- | --- |
| planet | drawer (`drawers` table, `/api/drawers`) |
| file | block (`blocks` table, `/api/blocks`) |
| star | a block with no connections (not on any planet) |
| putting a file on a planet | a connection (`connections` table) |
| the void (formerly the black hole) | `blackhole.js`, where things are added |
| universe | everyone's galaxies, below your galaxy on the same page |

## Commands

No dependencies, no build step, and no Node in this environment. The browser is the only JS syntax check.

```bash
python3 server.py                                    # http://localhost:8080, data in ./data
MUTT_DATA_DIR=/some/dir PORT=8123 python3 server.py   # separate data folder / port
tests/run.sh                                         # all API suites, each on a fresh server (port 8099)
tests/run.sh galaxy                                  # one suite: smoke | galaxy | preview
```

The suites are curl scripts that **print** what the API returned; nothing asserts. Read the output for wrong values, and `run.sh` dumps any server Traceback. Mutating requests need the `X-Mutt: 1` header (CSRF guard), as the scripts show.

## Architecture

**Server** (`server.py` → `mutt/app.py`): a zero-dependency Python WSGI app on SQLite (WAL).
- Routes live in `mutt/api.py`, declared with `@route(method, regex)`. They return `json_response(...)` and fail with `HttpError(status, message)`.
- Prefs are validated against `PREF_CHOICES`, so a new pref has to be added there and to `DEFAULTS` in `public/assets/js/theme.js`.
- Who can see a planet: `drawer_visible`. `galaxy_of` builds `/api/galaxy[/user]`, including the owner's stars and stats. `list_galaxies` builds `/api/galaxies` (the universe).
- Autosort, adding a file straight onto a planet (`drawer` in `POST /api/blocks` or `?drawer=` on upload) and link previews (`mutt/links.py`) are all server-side.
- Media previews (thumbnails, posters, PDF first pages) are made in the browser during upload; the server never decodes media.

**Front end** (`public/index.html` + `public/assets/js`): vanilla ES modules.
- `util.js` `h()` builds DOM; `style` keys set CSS custom properties.
- `bus` carries app events: `block:*`, `upload:done`, `drawer:changed`, `stats:changed`, `universe`.
- `router.js` maps paths to views (registered in `main.js`). A view is `{ load(params), create(params, data) }`, and `create` returns an instance with:
  - `el`, `title`, `chrome`, `who`
  - `home` (shows the corner back arrow), `goHome`
  - `dropTarget()`, `pasteText()`, `mounted()`, `destroy()`
- `statusbar.js` reads the view instance in `update(inst)`. It also owns the account/settings sheet, search, and the faint back arrow in the corner that takes you home.
- `views/galaxy.js` is the main page: a sticky galaxy section followed by a scroll "runway". Scroll progress drives the zoom out into the universe stage (`track()`), and `/universe` opens already scrolled out.
- `planets.js` builds each planet: its kind (`LOOKS`, with `lookOf()` picking one from the id when the owner hasn't), palette, moons, and a texture of its files. `planetgl.js` paints them: one shared off-screen WebGL2 canvas draws every planet's sphere (ground, weather and light in one shader, branching on the kind) and copies it onto the planet's own canvas, about 30 times a second each. Without WebGL2 (or with `?flat=1`) the older 2D painter takes over.
- Planet positions: `drawers.x`/`y` are offsets from the void in desktop pixels (empty means "scatter it"), saved by `PUT /api/galaxy/layout`. `scatter()` in `views/galaxy.js` places the saved ones first, then scatters the rest; `movable()` in `drag.js` does the dragging.
- `sky.js` is the fixed background. Pages can give it a lens (the void bends stars) and a night amount.
- `fx.js` holds the motion helpers; `drag.js` handles pointer drag onto targets.

**CSS:**
- Stylesheets sit directly in `public/assets/` (there is no `css/` folder). `mutt.css` is the old base; `galaxy.css` loads after it and restyles everything through tokens on `:root`.
- The site is dark only. Light mode (and the Mode setting) was removed on 2026-10-30; don't bring it back.
- Don't put `position` in the shared glass rule (`.glass, .sheet, .dialog, .pop, …`). `.pop` and `.tray` must stay `position: fixed`; overriding it is what made menus open in the wrong place.

## Branches and deploying

- Work happens on `galaxy`, which is fast-forwarded into `main`. Northflank auto-deploys `main` to https://p01--mutt--cxklgp67kgsx.code.run.
  - Deploy: `git checkout main && git merge --ff-only galaxy && git push origin main`, then push `galaxy` too.
  - Check it's live: a new asset URL returns 200, and `/api/health` shows `persistentStorage: true`.
- The pre-galaxy site is kept on the `classic` branch and the `classic-v1` tag. Both read the same database.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## User preferences

- **Look and feel:** keep the PS Vita style, skeuomorphic where it helps (paper, glass, glossy controls) and minimal elsewhere. Not cartoony, and no "AI-looking" glow or effects. Clean, and dark only (no light mode).
- **Pixel touches:** pixel art is welcome as an accent only, like the login's horizon of trees, cottage and mutt, with warm touches. Don't go "too Stardew Valley": no pixel fonts, pixel frames, pixel moon or stars. The Mutt and Vita look (rounded glass, Red Hat type, fluid motion) comes first. The login screen is always night.
- **The void:** a stippled black-and-white print (from the user's reference picture): a bright white light caged by dark, sinewy strands that web together where they cross, turning in 3D; stippled cells, bright at their rims and dim in the middle; faint rays; only a faint mauve tint. No crosshair lines through it. Bright places are dotted more densely, like a print. Sized in proportion to the planets, sitting straight on the sky with no dark halo round it. No orange, no pixel sparks, not realistic or painted light. Add boxes are flat and plain like Are.na's: spacious, no glass, gloss or glow, not paper.
- **Purpose:** the user's work and files are the point. Keep them central and visible (on planet surfaces, peeks, star thumbnails).
- **Deploying:** check changes in the browser (desktop and phone width) before deploying, and keep the `classic` backup intact.
- **Explanations:** write to the user in plain language, without code terms.

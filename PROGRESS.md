# Progress

The handoff note between sessions. Read it first; update it after every task
(or run `/handoff`). Newest entries on top. Lasting preferences also go in
`CLAUDE.md`.

## Where things stand (2026-10-29)

- **Planets update (not deployed yet)**, on branch `claude/mutt-planets-interactions-1d7230`, built from `galaxy`: you can move planets (other people see where), the turning is smooth, and each planet is one of eight kinds of world. Checked in the browser in dark, light and phone width; the API suites pass, and the `classic` site still works against the new database. Committed on that branch; not merged into `galaxy` or deployed.
- The second galaxy redesign is **live**: `galaxy` and `main` are both at 01d78d2 (redesign, handoff files, README update), deployed on Northflank and checked in the browser.
- The project now lives in `/Users/edan/Mutt`.
- Backup of the pre-galaxy site: branch `classic`, tag `classic-v1`.

## Next

1. Merge the planets update into `galaxy`, then deploy. Then try holding and dragging a planet on a real phone (only checked with a mouse so far).
2. Try it on a real phone. In particular, check that typing in the void with the keyboard open doesn't slide the page into the universe.
3. Test suites for users, sharing, saving and community drawers were lost with an earlier scratch folder. Only `smoke`, `galaxy` and `preview` exist in `tests/`; rewrite the others if needed.

## Done

### 2026-10-29: planets you can move, smooth spin, eight kinds of world
- **Glitchy spin fixed.** The old painter moved the surface in whole-texel steps (about 2 screen pixels, every 150–300 ms) with no smoothing, at uneven 33/50 ms intervals, then CSS rotated and stretched the canvas again. Now one shared WebGL canvas paints every planet with smooth, fractional turning, at the screen's real sharpness. Repaints are staggered (each planet about 30 times a second), so ten planets cost no measurable frame time.
- **Kinds of world**: ocean, green, gas giant, lava, ice, desert, moon rock and storm, each with its own animated ground and weather, tinted by the planet's colour. Files stay readable on top, and clouds part round them. Some planets have small moons that pass in front and behind. New `drawers.look` column; empty means "picked from the id". Change it with **Planet type…** in the planet's ••• menu.
- **Arranging**: drag your planets (a mouse drags straight away; on touch, hold first; Shift+arrows on the keyboard). The first move saves every planet's spot, so none of the others wander later. Drops onto the void or another planet settle nearby. Others see the arrangement on their next visit, and the universe's mini galaxies mirror it. Phones squeeze it from the sides, stretch it taller and settle any overlaps. **Tidy planets** in the account sheet resets it. New `drawers.x`/`y` columns and `PUT /api/galaxy/layout`.
- Tests for looks and layouts added to `tests/galaxy.sh`.

### 2026-10-29: deployed
- Merged the redesign into `main`; the live site updated and its storage check is healthy.
- README rewritten for the new design (void, stars, universe, light mode, corner void, Share, fonts).
- Added CLAUDE.md, this handoff file, the `/handoff` command and `tests/`.

### 2026-10-29: second galaxy redesign (from the user's feedback)
- Fixed the planet picker and ••• menu opening in the wrong place.
- The middle is now a large, quiet void. Clicking it opens it wide and a paper sheet with a folded corner rises out. You pick where the new thing goes, including straight onto a brand-new planet.
- Planets: bigger, scattered rather than in rings, and painted as turning globes with your files on the surface. Hovering shows thumbnails.
- Stars: shown as thumbnails clustered round the void. The bottom stars section and dock are removed.
- Universe: scrolling down zooms out into a dark universe of everyone's galaxies, and clicking one opens it (locked ones ask for a code). `/universe` opens there directly and `/community` redirects to it.
- Light mode, plus Auto/Light/Dark in settings. The star count moved from the top bar into the account sheet.
- A corner void replaces the page peel as the way home. Planet pages have a slim header with a Share popover.
- Toned down effects; new fonts.

## Preferences the user has given

- PS Vita style, skeuomorphic where it helps and minimal elsewhere. Not cartoony, no AI-style graphics, clean, with light and dark modes.
- Work and files stay at the centre of the site.
- Keep a backup of the previous design before big redesigns.
- Use a PROGRESS.md handoff, updated after each task.

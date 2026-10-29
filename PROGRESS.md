# Progress

The handoff note between sessions. Read it first; update it after every task
(or run `/handoff`). Newest entries on top. Lasting preferences also go in
`CLAUDE.md`.

## Where things stand (2026-10-29)

- Branch `galaxy` has the second galaxy redesign (commit 1574ef0), plus `CLAUDE.md`, this file, `/handoff` and `tests/`.
- **Not yet merged to `main` or deployed.** The live site still runs the first galaxy version (93a18a7).
- Backup of the pre-galaxy site: branch `classic`, tag `classic-v1`.

## Next

1. Merge `galaxy` into `main`, push, and check the live site (dark, light, phone).
2. Rewrite `README.md` for the new design:
   - the void and paper add box, with its Star / Autosort / Planet / New planet choices
   - stars around the void
   - scrolling down into the universe, replacing the old swipe and Community
   - light mode
   - the corner void as the way home
   - the Share button on planet pages
   - fonts are now Red Hat Text / Red Hat Mono
3. Try it on a real phone. In particular, check that typing in the void with the keyboard open doesn't slide the page into the universe.
4. Test suites for users, sharing, saving and community drawers were lost with an earlier scratch folder. Only `smoke`, `galaxy` and `preview` exist in `tests/`; rewrite the others if needed.

## Done

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

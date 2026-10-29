# Progress

The handoff note between sessions. Read it first; update it after every task
(or run `/handoff`). Newest entries on top. Lasting preferences also go in
`CLAUDE.md`.

## Where things stand (2026-10-29)

- The second galaxy redesign is **live**: `galaxy` and `main` are both at 01d78d2, deployed on Northflank and checked in the browser.
- **New, not committed or deployed yet:** the black hole void, on the worktree branch `claude/black-hole-center-visual-0dae27`. The user hasn't seen it yet.
- The project now lives in `/Users/edan/Mutt`.
- Backup of the pre-galaxy site: branch `classic`, tag `classic-v1`.

## Next

1. The user reviews the black hole, then commit it, bring it onto `galaxy` and deploy.
2. Try it on a real phone. In particular, check that typing in the void with the keyboard open doesn't slide the page into the universe. The open box is about 420px tall on a phone.
3. Recheck the second version at phone width (only desktop dark and light were looked at after the redo). The textures take a moment to build on first load and on each light/dark switch.
4. Test suites for users, sharing, saving and community drawers were lost with an earlier scratch folder. Only `smoke`, `galaxy` and `preview` exist in `tests/`; rewrite the others if needed.

## Done

### 2026-10-29: the void, second version (user feedback)
- The user didn't like the first version: too realistic and painted, "ribbons of light", and an add box that looked fake. They asked for something artsy and textured, like their second and third pictures (a smoky dust swirl, and a grainy ink print), not the first (Interstellar's Gargantua).
- `voidart.js` now paints folds of smoky mauve dust with a ragged inner edge, fine film grain laid over at screen resolution, a faint tilted smudge running through it, one thin dotted stray arc, two tiny embers circling in the dark, and the few square sparks. No glowing band or arcs. Light mode is a stippled ink print with a pale middle.
- The add box is flat and plain like Are.na's: a bordered square to type in, "Goes to" choices as plain underlined text, Upload as a text link, and a flat Add button that fills in once there's text. No glass, gloss or glow.

### 2026-10-29: the void becomes a real black hole (first version, since replaced)
- `voidart.js` paints the black hole on a canvas, in its own layer under the planets: a tall cloud of indigo and plum dust turning slowly, a thin lantern-amber band across it, arcs of bent light over the top and under the bottom, a thin edge line, and about a dozen small square pixel sparks drifting in (the only pixel touch). Light mode draws the same shapes as grainy ink on paper with a pale middle, like the user's third reference picture.
- It's sized from the screen (the dark is about 13% of the screen's height across), so the whole thing stands most of the screen tall. Stars float in its dust; planets keep clear of an oval round it.
- Clicking it sweeps it open: the dark widens just enough to hold the add box, and the light is pushed out into a thinner ring. Planets dim but stay visible. It stops moving once you scroll into the universe.
- The paper sheet is gone. The add box is a spacious dark glass box (pale glass in light mode) like the planet page's add box: a big text area, Upload, a glossy Add that lights up once there's text, the Star/Autosort/Planet/New planet choices, and a drop state for files dragged over it.
- Other people's galaxies show the same hole with their name in it. The background stars' bend round the void now fades out smoothly instead of covering the whole screen.
- Checked in the browser in dark, light and phone width: adding a note, making a new planet, Esc to close, dragging a star in (autosorted), someone else's galaxy, and the pause in the universe. Smoke tests pass.
- Testing tip: another Mutt server on this machine shares `localhost` cookies and signs the preview out, so test on `127.0.0.1` instead.

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
- The void: a big, tall black hole that's artsy and textured (smoky, grainy dust like the user's second and third reference pictures), not realistic or painted light. Only small pixel touches. The add box is flat and plain like Are.na's, never glassy, glossy or paper-like.

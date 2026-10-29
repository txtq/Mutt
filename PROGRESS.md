# Progress

The handoff note between sessions. Read it first; update it after every task
(or run `/handoff`). Newest entries on top. Lasting preferences also go in
`CLAUDE.md`.

This is the one shared copy, at `/Users/edan/Mutt/PROGRESS.md`. Sessions in a
worktree read and edit this path, not the stale `PROGRESS.md` in their worktree.

## Where things stand (2026-10-29)

- **New login screen is live**: `claude/mutt-login-screen-d7c6db` is merged into `galaxy` and `main` and deployed. It has the "Are you new to Mutt?" question, a low pixel horizon, a warm light from the top right, and is always night.
- **Planets update is live**: `galaxy` and `main` include the planets branch `claude/mutt-planets-interactions-1d7230` (merged at 2894ba6), deployed on Northflank. The new files are served and `/api/health` shows persistent storage. Planets can be moved, turn smoothly, and are each one of eight kinds of world.
- The database gained `drawers.look`, `drawers.x` and `drawers.y` (added by itself on start). The `classic` site was checked against a copy with them and still works.
- The project now lives in `/Users/edan/Mutt`.
- Backup of the pre-galaxy site: branch `classic`, tag `classic-v1`.

## Next

- In progress in another session, not merged: the black hole look (`claude/black-hole-center-visual-0dae27`). It touches the galaxy page too, so merge `galaxy` into it before shipping.
- Worktrees made before the 2026-10-29 handoff fix still have the old rule (their own `PROGRESS.md` copy) in their `CLAUDE.md` until they merge `galaxy`.

1. Try it on a real phone. In particular:
   - hold and drag a planet (only checked with a mouse so far);
   - check that typing in the void with the keyboard open doesn't slide the page into the universe.
2. Test suites for users, sharing, saving and community drawers were lost with an earlier scratch folder. Only `smoke`, `galaxy` and `preview` exist in `tests/`; rewrite the others if needed.

## Done

### 2026-10-29: login screen, "Are you new to Mutt?" (deployed)
- Login opens on a question, "Are you new to Mutt?", with "Yes, I'm new" (make an account) and "No, log in". Y and N keys work too.
- After choosing, the username → code steps are as before, with a "Welcome back" / "Make your account" heading and a Vita-style ‹ Back button.
- Skipping the question: `?new=1` goes straight to making an account. With sign-ups off, it goes straight to log in.
- If this browser has signed in before, focus starts on "No, log in".
- A low pixel horizon runs along the bottom, under the usual Vita sky (`nightscene.js`):
  - hills with pines and autumn trees;
  - a cottage with a flickering lit window and chimney smoke;
  - a lamp post, and a little mutt that blinks and wags.
- The box, fonts, rounded code boxes and soft blur-rise animations are the original Mutt ones.
- Tried Vita glass bubbles drifting behind the box. The user didn't want them, so they're removed. The trees were also thinned to about half.
- A warm light glows from just past the top-right corner, like a low sun. The box catches it with a bright line along its top edge (strongest toward the right) and a warm wash from that corner. The buttons and the round Back key have warm top highlights, and the code boxes a faint warm lower edge.
- Fixed: a blue outline drew round the username field while typing. It came from the site-wide focus outline; the field's blue underline already shows focus.
- Login is always night, even when the saved mode is light (`holdNight` in `theme.js`). The saved mode comes back after signing in.
- First try was too Stardew Valley: a pixel moon, pixel stars, fireflies, a pixel-framed box and a pixel font. The user asked to keep only the scene's cottage, trees and so on, and keep Mutt's and the Vita's look elsewhere.
- Checked in the browser:
  - making an account, logging in, a wrong code, Back, the Y/N keys;
  - sign-ups off, `?new=1`;
  - the saved light mode staying night on login and coming back after;
  - desktop and phone width.
- The smoke suite reads the same as before.
- Note: the in-app browser pane freezes page animations while it's in the background, so screenshots can show an empty box. It's the pane, not the page.

### 2026-10-29: planets you can move, smooth spin, eight kinds of world (deployed)
- **Glitchy spin fixed.** The old painter moved the surface in whole steps of about 2 screen pixels, every 150–300 ms, with no smoothing. Now one shared WebGL canvas (`planetgl.js`) paints every planet with a smooth turn at full sharpness, about 30 times a second each. Ten planets cost no measurable frame time. Without WebGL the old painter takes over (`?flat=1` forces it).
- **Kinds of world:**
  - eight of them: ocean, green, gas giant, lava, ice, desert, moon rock, storm;
  - each has animated ground and weather, tinted by the planet's colour;
  - files stay readable on the surface, and some planets have small moons;
  - a new planet gets a kind picked for it; **Planet type…** in the ••• menu changes it.
- **Arranging:**
  - drag your planets; on touch, hold first; Shift+arrows on the keyboard;
  - the first move saves every planet's spot, so the others never wander later;
  - others see the arrangement on their next visit, and so do the mini galaxies in the universe;
  - phones squeeze and stretch it to fit without overlaps;
  - **Tidy planets** in the account sheet resets it.
- Checked in the browser (dark, light, phone width, a second user's view). `tests/galaxy.sh` covers looks and layouts.

### 2026-10-29: handoff notes fixed
- Sessions were reading the notes but bundling the read with a guess at a `public/assets/css/` folder that doesn't exist, so the step showed as failed. `CLAUDE.md` now says where the stylesheets are and to read the notes on their own.
- Each worktree had its own copy of the notes, so sessions never saw each other's. The notes now live only here, and `CLAUDE.md` and `/handoff` point at this path. The login session's notes were copied in from its worktree.

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
- Pixel art only as an accent (the login horizon: trees, cottage, mutt), with warm touches. Not "too Stardew": no pixel fonts, pixel frames, pixel moon or stars. Mutt and Vita looks (rounded glass, Red Hat type, fluid motion) come first. Login is always night.
- Keep a backup of the previous design before big redesigns.
- Use a PROGRESS.md handoff, updated after each task.

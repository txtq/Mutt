# Progress

The handoff note between sessions. Read it first; update it after every task
(or run `/handoff`). Newest entries on top. Lasting preferences also go in
`CLAUDE.md`.

This is the one shared copy, at `/Users/edan/Mutt/PROGRESS.md`. Sessions in a
worktree read and edit this path, not the stale `PROGRESS.md` in their worktree.

## Where things stand (2026-10-29)

- The second galaxy redesign is **live**: `galaxy` and `main` are both at 01d78d2 (redesign, handoff files, README update), deployed on Northflank and checked in the browser.
- The project now lives in `/Users/edan/Mutt`.
- Backup of the pre-galaxy site: branch `classic`, tag `classic-v1`.

## Next

- In progress in other sessions, not merged: new login screen (`claude/mutt-login-screen-d7c6db`, waiting for the user to look), planets you can move with unique looks (`claude/mutt-planets-interactions-1d7230`), and the black hole look (`claude/black-hole-center-visual-0dae27`).
- Worktrees made before the 2026-10-29 handoff fix still have the old rule (their own `PROGRESS.md` copy) in their `CLAUDE.md` until they merge `galaxy`.

1. Try it on a real phone. In particular, check that typing in the void with the keyboard open doesn't slide the page into the universe.
2. Test suites for users, sharing, saving and community drawers were lost with an earlier scratch folder. Only `smoke`, `galaxy` and `preview` exist in `tests/`; rewrite the others if needed.

## Done

### 2026-10-29: handoff notes fixed
- Sessions were reading the notes but bundling the read with a guess at a `public/assets/css/` folder that doesn't exist, so the step showed as failed. `CLAUDE.md` now says where the stylesheets are and to read the notes on their own.
- Each worktree had its own copy of the notes, so sessions never saw each other's. The notes now live only here, and `CLAUDE.md` and `/handoff` point at this path. The login session's notes were copied in from its worktree.

### 2026-10-29: login screen, "Are you new to Mutt?"
- Login opens on a question, "Are you new to Mutt?", with "Yes, I'm new" (make an account) and "No, log in". Y and N keys work too.
- After choosing, the username → code steps are as before, with a "Welcome back" / "Make your account" heading and a Vita-style ‹ Back button.
- Skipping the question: `?new=1` goes straight to making an account. With sign-ups off, it goes straight to log in.
- If this browser has signed in before, focus starts on "No, log in".
- A pixel night scene is drawn over the usual Vita sky (`nightscene.js`): a moon, stepped twinkling stars, hills, pines with autumn trees as the warm touch, a cottage with a lit window and chimney smoke, a lamp post, fireflies and a little mutt. It's drawn small and scaled up so the pixels stay crisp, and it shows a still frame with reduced motion.
- The box is Vita glass in a notched pixel frame, with a hard pixel shadow and a line of lamplight. The question and headings use Pixelify Sans, and the blur-in effects are gone.
- Login is always night, even when the saved mode is light (`holdNight` in `theme.js`). The saved mode comes back after signing in.
- Checked in the browser:
  - making an account, logging in, a wrong code, Back, the Y/N keys;
  - sign-ups off, `?new=1`;
  - the saved light mode staying night on login and coming back after;
  - desktop and phone width.
- The smoke suite reads the same as before.
- Note: the in-app browser pane freezes page animations while it's in the background, so screenshots can show an empty box. It's the pane, not the page.

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
- Pixel details like Stardew Valley at night (moon, stars, trees, cottage) over the Vita sky, with warm accents. Login is always night.
- Keep a backup of the previous design before big redesigns.
- Use a PROGRESS.md handoff, updated after each task.

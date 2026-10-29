# Progress

The handoff note between sessions. Read it first; update it after every task
(or run `/handoff`). Newest entries on top. Lasting preferences also go in
`CLAUDE.md`.

This is the one shared copy, at `/Users/edan/Mutt/PROGRESS.md`. Sessions in a
worktree read and edit this path, not the stale `PROGRESS.md` in their worktree.

## Where things stand (2026-10-29)

- **The spaceship home is live**: `claude/black-hole-go-home-alt-43cebc` is merged into `galaxy` and `main` (bcfeda6) and deployed. Away from your galaxy, a little ship in the top-left corner flies you home; it replaced the corner black hole.
- **The black hole void is live**: `claude/black-hole-center-visual-0dae27` is merged into `galaxy` and `main` and deployed. The middle of the galaxy is a big, grainy, smoky black hole, and clicking it opens a flat, Are.na-style add box inside the dark.
- **New login screen is live**: `claude/mutt-login-screen-d7c6db` is merged into `galaxy` and `main` and deployed. It has the "Are you new to Mutt?" question, a low pixel horizon, a warm light from the top right, and is always night.
- **Critters are gone and planets are more colourful (live)**: `claude/remove-critters-brighten-planets-122880` is merged into `galaxy` and `main` and deployed.
- **Planets update is live**: `galaxy` and `main` include the planets branch `claude/mutt-planets-interactions-1d7230` (merged at 2894ba6), deployed on Northflank. The new files are served and `/api/health` shows persistent storage. Planets can be moved, turn smoothly, and are each one of eight kinds of world.
- The database gained `drawers.look`, `drawers.x` and `drawers.y` (added by itself on start). The `classic` site was checked against a copy with them and still works.
- The project now lives in `/Users/edan/Mutt`.
- Backup of the pre-galaxy site: branch `classic`, tag `classic-v1`.

## Next

- Worktrees made before the 2026-10-29 handoff fix still have the old rule (their own `PROGRESS.md` copy) in their `CLAUDE.md` until they merge `galaxy`.

1. Try it on a real phone. In particular:
   - hold and drag a planet (only checked with a mouse so far);
   - check that typing in the void with the keyboard open doesn't slide the page into the universe (the open add box is about 320px tall on a phone).
   - tap the corner spaceship and watch the flight (only checked in the desktop browser and its phone-size view);
   - see how smoothly the black hole turns on an older phone; it builds its textures on first load and on each light/dark switch, which takes a moment.
2. Test suites for users, sharing, saving and community drawers were lost with an earlier scratch folder. Only `smoke`, `galaxy` and `preview` exist in `tests/`; rewrite the others if needed.

## Done

### 2026-10-29: the void becomes a grainy, smoky black hole (deployed)
- The user wanted the middle to look like a real void, big and tall, opening with a sweep into an add box. A first version (a realistic glowing disk and arcs, like Interstellar) was rejected as "too realistic and painted, ribbons of light", with an add box that "looked super AI and fake". They asked for something artsy and textured like their other two reference pictures: a smoky dust swirl, and a grainy ink print.
- `voidart.js` paints it on a canvas in its own layer under the planets:
  - folds of smoky mauve dust turning slowly round a dark middle with a ragged edge, slightly taller than wide;
  - fine film grain laid over the dust at screen resolution, so it stays fine at any size;
  - a faint tilted smudge, one thin dotted stray arc, two tiny embers circling in the dark, and about ten small square sparks (the only pixel touch);
  - in light mode, a stippled ink print with a pale middle.
- It's sized from the screen (the dark is about 13% of the screen's height across). Stars float in its dust, and planets (including ones you've moved) keep clear of an oval round it.
- Clicking it widens the dark just enough to hold the add box, and the dust thins into a ring. Planets dim but stay visible. It stops moving once you scroll into the universe.
- The add box is flat and plain like Are.na's: a bordered square to type in, the Star / Autosort / Planet / New planet choices as plain underlined text, Upload as a text link, and a flat Add button that fills in once there's text. No glass, gloss or glow.
- Other people's galaxies show the same hole with their name in it. The background stars' bend round the void fades out smoothly.
- Merged `galaxy` (login screen, critters removal, moveable planets) into the branch before shipping. Checked in the browser after the merge: desktop dark and light, phone width dark and light, opening, adding a note. Test suites read normally.
- Testing tips: another Mutt server on this machine shares `localhost` cookies and signs the preview out, so test on `127.0.0.1`. When the preview pane is hidden, the page lays out at zero width; set a size with the pane's viewport first.

### 2026-10-29: critters removed, planets more colourful (deployed)
- The user asked to get rid of critters. Gone: the pixel creature by each planet's name, the critter editor, "New critter", and the blinking. `pixel.js` is deleted and `PALETTE` moved to `util.js`. Lists of planets (putting a file on a planet, the viewer) show a small colour dot instead (`planetDot()` in `planets.js`).
- The planet's colour still lives in `drawers.icon.c`, next to the old pixels, because the `classic` site still draws them. **Planet colour…** in the ••• menu changes only the colour. New planets get the server's default icon. Clicking the big planet on its page now opens **Planet type**.
- Planets were "too dark". Their colours now go through `richer()` in `planets.js` (more saturation, a little lighter, with the planet's own colour greyed less). The shader's shadow side and edge are lighter too. Lava gets a smaller boost so it stays hot.
- Checked in the browser: desktop dark, phone width in light mode, the colour picker saving, the dots, `?flat=1`, and the merge with the new login screen. Test suites print as before.
- Note: the in-app browser pane doesn't show planet canvases in screenshots while it's hidden. Copying each canvas into an `<img>` overlay works.

### 2026-10-29: a spaceship replaces the corner black hole (deployed)
- The user didn't like the little black hole in the top-left corner as the way home. A mini map of your galaxy was tried first; the user preferred a spaceship.
- Away from your galaxy (on a planet, or in someone else's galaxy) a small silver ship with blue fins and window sits in the corner, nose turned toward the "mutt" wordmark, bobbing gently.
- Tap it: it shudders as its flame lights, lifts off, swings out across the page growing larger, then climbs off the top, leaving a thin trail while the page falls away. Then your galaxy opens. With reduced motion it just goes home.
- It doesn't show in the universe; the user said scrolling back up is enough there.
- All in `statusbar.js` (`SHIP`, `launch()`) and the "ship in the corner" section of `galaxy.css`.
- Checked in the browser: dark, light, phone width, the flight paused at several points, landing home. Merged `galaxy` (black hole void, login, critters removal) in first; the only clash was one line of the reduce-motion list. Checked again after the merge, then deployed: new files served, `/api/health` shows persistent storage. Not checked on a real phone.

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

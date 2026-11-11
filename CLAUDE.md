# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Handoff rule

The handoff notes are **one shared file: `/Users/edan/Mutt-notes/PROGRESS.md`**, in a folder beside the project, not inside it. Most sessions run in a worktree under `.claude/worktrees/`, and the app blocks a worktree session from editing files in the main checkout (`/Users/edan/Mutt/...`), so the notes live outside the repo where every session can edit them. So:
- Read `/Users/edan/Mutt-notes/PROGRESS.md` at the start of every session, on its own (the Read tool, not chained with other commands, so one bad path can't fail the read).
- After finishing each task, update that same file with the Edit tool: what was done, what's next (name your branch if it isn't merged), and any new preferences the user gave.
- The repo's own `PROGRESS.md` is only a pointer to it. Don't write notes there.
- Preferences that should hold for all future work also go in the **User preferences** section below.
- The notes aren't in git, so there's nothing to commit for them.
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
| moon | a drawer with `parent_id` set (its planet); one level only, up to 4, never picked by autosort, hidden from planet lists; a list planet's moons start as lists |

## Direction: features that appear when you need them (2026-11-05)

Mutt is a file storage app at heart. On top of that it will grow many features, but each one stays hidden until what you're doing calls for it. At its base the app is extremely simple, and it only ever shows you what helps you do what you're already doing.

Decided by the user:
- **Features are earned by use, not chosen.** There's no feature list, store, settings switch or "try this" teaser. You don't know a feature exists until you need it.
- **Most features belong to a planet** and depend on how that planet operates and what it's for. Some respond to what you're doing right now in a file.
- **They switch on by themselves.** Examples the user gave:
  - an art planet gets a **portfolio generator**;
  - writing long paragraphs brings up a **writing mode**;
  - making a list turns it into a **list mode**.
- Future work will add features through this one mechanism. Build each new feature as a mode that waits for its trigger, never as an always-visible button.

What already exists to read a planet's purpose (reuse it, don't start a second classifier):
- `sorting.purpose(conn, drawer_id)` (and `GET /api/drawers/<id>/purpose`, owner only) reads a whole planet: `topics` and finer `concepts` with shares, `role` (collecting, making, planning, tasks, logging, learning, keeping, wanting, or None when unclear), `kinds`, `forms`, `keywords`, `places`, `sure` and a plain `summary`, plus what its files are in every format: `contains` (photo, print, map, receipt, song, recording, invoice…), `shows` (what its pictures show: climbing, dog, pottery…), `documents`, `music` (artists, genres) and `cameras`. This is the reading a mode's test should use (an art planet = `contains` prints/paintings/drawings). Autosort scores with the same `Planet` object.
- `sorting.form()` reads how one note is written (checklist, list, tasks, poem, prose, story, chapter, quote, recipe, code, tab, table, dated, diary, measured, idea, contact, priced, appointment), for modes that respond to what you're writing.
- The words live in `mutt/lexicon.py`: `TOPICS`, `CONCEPTS` (finer subjects inside a topic), `ROLES`, `EMOJI`, places, sites. Add vocabulary there, not in the scoring code.

How the modes are wired today (front end, 2026-11-09):
- `views/planet.js` has one table, `MODES` (list, reading, cookbook, documents). An entry says what the mode is called, whether a moon can be one, how to build its view, how to turn it on at the server, and what its offer and ••• menu hold. Turning on and off, Undo, the menu and the offer are shared (`turnOn`, `turnOff`, `swapTo`, `lookForModes`). **A new mode is one more entry in that table** plus its view and its signs from `GET /api/drawers/<id>/modes`; don't hand-wire another.
- Every offer is the one box in `offers.js` (`modeOffer`): a mode only supplies its words. It glides what's below it down when it arrives and back up when waved away (transforms only).
- One thing at a time on a planet page: the sharing tip waits while a mode is being offered.

Suggested shape for the rest of the mechanism (not yet agreed with the user; ask before building):
- One registry of modes. Each has a test against a planet (or a file being edited) and what it adds when it's on.
- Work out a planet's purpose from the share of its files with each kind, topic and shape, so one odd file doesn't switch a mode on. Use a higher bar to turn on than to stay on, so modes don't flicker.
- When a mode first appears, say so once, quietly, in place. Let the owner turn it off for that planet, and remember that.

## Commands

No dependencies, no build step, and no Node in this environment. The browser is the only JS syntax check.

```bash
python3 server.py                                    # http://localhost:8080, data in ./data
MUTT_DATA_DIR=/some/dir PORT=8123 python3 server.py   # separate data folder / port
tests/run.sh                                         # all API suites, each on a fresh server (port 8099)
tests/run.sh galaxy                                  # one suite: smoke | galaxy | preview | lockout | search | autosort | moons | books | docs | cookbook | comments
```

The suites are curl scripts that **print** what the API returned; nothing asserts. Read the output for wrong values, and `run.sh` dumps any server Traceback. Mutating requests need the `X-Mutt: 1` header (CSRF guard), as the scripts show.

## Architecture

**Server** (`server.py` → `mutt/app.py`): a zero-dependency Python WSGI app on SQLite (WAL).
- Routes live in `mutt/api.py`, declared with `@route(method, regex)`. They return `json_response(...)` and fail with `HttpError(status, message)`.
- Prefs are validated against `PREF_CHOICES`, so a new pref has to be added there and to `DEFAULTS` in `public/assets/js/theme.js`.
- Who can see a planet: `drawer_visible`. A Code planet opens with its own code (`drawers.share_hash`, set at `PUT /api/drawers/<id>/code`, never the owner's sign-in code), checked by `auth.try_share_code` with its own lockout (`share_failures`); opened planets are kept per session in `drawer_unlocks`. A moon is visible only if its planet is too (`moons_of` lists a planet's moons). Queries that list planets need `parent_id IS NULL`. `galaxy_of` builds `/api/galaxy[/user]`, including the owner's stars and stats. `list_galaxies` builds `/api/galaxies` (the universe). Every user is in the universe; planets someone can't see at all (private, or People they're not on) come as `private_planet` stand-ins (no name or files) and show blurred. New planets start Public with "Others can add files" off, and carry `modes.shareTip` until their owner first opens them (the one-time sharing tip in `views/planet.js`).
- Autosort (`mutt/sorting.py`, scores every planet on name, topics and concepts, files already there, kinds, sites, how notes are written and what the planet is for; words in `mutt/lexicon.py`), adding a file straight onto a planet (`drawer` in `POST /api/blocks` or `?drawer=` on upload) and link previews (`mutt/links.py`) are all server-side.
- Reading mode (`drawers.modes.reading`, offered by `books.shelf_signs`, the second mode after list mode): `mutt/books.py` says which files are books and opens EPUBs (zip + OPF) for the reader; routes are under `/api/books/<id>` (book info, `part/<path>` for one chapter or picture, `progress`, `marks`, `text` for a PDF in reading format). Per-reader tables: `book_progress`, `book_marks`; `book_texts` holds converted PDFs (gzipped JSON). An EPUB's cover is saved as its thumbnail at upload. Front end: `reading.js` (the shelf and the offer), `reader.js` (the reader; places are `<chapter>:<character>`, PDF pages `p:<n>`), `pdfbook.js` (PDF → chapters with pdf.js). Reader settings (page colour, type, size) are kept per device in localStorage.
- Cookbook mode (`drawers.modes.cookbook` {on, dismissed, chapters}, offered by `recipes.signs`, which reads the planet's name (`RECIPE_NAMES`, food emoji) and `sorting.purpose`, and on a food planet counts casually written recipes; the third mode): `mutt/recipes.py` reads recipe notes (and recipe links, whose page's JSON-LD `links.inspect` saves as `meta.recipe`) into cards kept in the file's `meta.recipe` (title, serves/makes, prep, cook, ingredient lines, steps, notes, chapter, photo = a picture file's id, `sig` of the note text it was read from). Saving a card (`PUT /api/blocks/<id>/recipe`) rewrites the note's text from it; a note edited elsewhere is read again. Routes: `POST /api/drawers/<id>/cookify`, `GET/POST /api/drawers/<id>/recipes`, `POST .../chapters` (rename). Chapter words and recipe sites are in `lexicon.py` (`RECIPE_CHAPTERS`, `RECIPE_SITES`). Front end: `cookbook.js` (just the glass cards with chapter tabs; other files hidden; the card that opens in the page above it, editor, cooking mode with a screen wake lock, the offer), `amounts.js` (scaling, metric/US, oven temperatures and tin sizes). Measures choice is per device in localStorage (`mutt:cookbook`).
- Documents mode (`drawers.modes.documents`, offered by `documents.doc_signs` when a planet is mostly longer writing; the "Long for a note" hint appears at 1000 characters): a document is still a note. Its Markdown stays in `blocks.content`, and the editor's fuller HTML sits in `docs` (cleaned against an allowlist in `mutt/documents.py`; ignored if the note was edited since). Also `doc_versions`, `doc_images` and `doc_comments` (anchored by quote, prefix and suffix), with routes under `/api/docs/<id>`. Front end: `docs.js` (the desk of pages and the offer), `doceditor.js` (the editor; each document stands alone, with no list of the others beside it; an open document's address is `/p/<id>?doc=<blockId>`; the page flies between its card on the desk and the sheet (`arrive`/`depart`), the planet page fades away under `html.is-writing` leaving the sky; a slim toolbar with one Aa panel (`typePanel`), a formatting bubble beside selected words (`selectionBar`), `/` on an empty line to insert (`slashCheck`), smart punctuation (`smarten`), and quiet writing (`typing`/`wake`: the bars fade after steady typing)), `docformat.js` (Markdown↔HTML, the cleaner), `docexport.js` (PDF via pdf-lib, a hand-built .docx, Markdown, text, print) and `docs.css`.
  - Kinds of writing (`settings.layout`: auto, prose, poem, script, journal, letter; `documents.KINDS`): the first toolbar button ("Writing as") picks one, Auto reads it from the words (`docwriting.js` `readsAs`, the server's `documents.reads_as`; it takes clearer signs to switch than to stay, `stillReads`), and the rest of the toolbar follows the kind (`kindTools`). Poem: syllables, rhyme letters with the rhyming words underlined, every fifth line numbered (per device, `mutt:docs-poem`), the form's name in the word count. Script: lines are `p.sc-scene|action|char|paren|dial|trans`, Enter/Tab move between parts, names finished from the cast, scenes in the outline, typewriter type. Journal: `h2.dated` entries, "New entry"/"Today". Letter: date and sign-off. Lists are one button with six kinds (`ul`, `ul.dash`, `ol`, `ol.alpha`, `ol.roman`, `ul.check`). New classes must be added to both cleaners (`CLASSES` in `documents.py` and `docformat.js`); don't call one `entry` (mutt.css has a global `.entry`).
- Comments on files (`file_comments`, routes `GET/POST /api/blocks/<id>/comments`, `DELETE .../comments/<cid>`): anyone who can see a file (`readable_block`) can comment, its owner too; the owner can remove any comment, a writer can take theirs back. `commentCount` comes with every block (`BLOCK_COLUMNS`) and shows under a tile. Front end: `comments.js`, the bottom of the file view's side panel; on your own file it stays hidden until someone has commented. Separate from a document's margin comments (`doc_comments`).
- Media previews (thumbnails, posters, PDF first pages) are made in the browser during upload; the server never decodes media. It reads file headers only (`mutt/media.py`: camera, when and where, song tags, document kind) into `meta.media` / `meta.doctype`.
- What a picture shows is read on the device: `see.js` runs CLIP ViT-B/32 (picture half, q4) in `see-worker.js` with onnxruntime-web from cdnjs, and saves 512 int8 numbers as `meta.see` (`PATCH /api/blocks/<id>` with `see`). `mutt/sight.py` scores them against `mutt/sights.json` (kinds of picture and subjects; changing it re-labels on next read) and serves the model at `/api/see/model` (downloaded once into `DATA_DIR/models`, sha-checked; `MUTT_SEE=0` turns it off, `MUTT_SEE_MODEL` points at a local copy; tests run with it off). Autosort uploads of pictures/videos upload first, read, then call `POST /api/blocks/<id>/autosort`. `public_meta` hides `see` from everyone and place, time and camera from non-owners.

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
- `drift.js` leans a planet's file boxes toward the pointer. It writes `--mx`/`--my` on each box that's on screen (registered in `galaxy.css` so they don't inherit), never on the page around them.
- Motion: Still (`data-motion="off"`) and the system's reduced-motion setting run every CSS animation once in no time, so entrances land on their last frame. Never pause animations to stop them: a paused entrance stays on its first, invisible frame (that once left planet pages blank under Still).

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
- **Boxes are frosted glass (2026-11-06):** every box that holds the owner's things or a feature (file boxes, the add box, lists, the list offer, and every new feature's panel) uses the shared glass in `galaxy.css` ("frosted glass: the house style for boxes"): a flat, light, see-through fill (never a gradient), a deep frost, and the planet's colour only on the edge glow. For a new feature's panel, add the `.fglass` class rather than writing its own fill. Headers (the planet's header, menus, sheets) may look a little different. Fades and blurs on entrance go on the box's parts, never on a parent of the glass (that stops the frost). Boxes slide + blur in, float gently and lean toward the pointer.
- **Pixel touches:** pixel art is welcome as an accent only, with warm touches. Don't go "too Stardew Valley": no pixel fonts, pixel frames, pixel moon or stars. The Mutt and Vita look (rounded glass, Red Hat type, fluid motion) comes first.
- **Login (2026-11-09):** only the dark sky and the void, no box and no pixel horizon (the user chose to drop it). The void is huge and looming (it fills the screen; on a phone its cage runs off the sides). It opens, and every word (logo, name, code) sits in dark ink on its clean white light: never put text over the void's speckled cage, the user disliked that. Round it: dust spiralling in and stars streaking toward it along the same swirl; it reacts to every key (gulps, spins up), ripples on a wrong code, and on the right code everything rushes in and the light takes the screen. It should feel ominous, like an experience. One step to start: type a name (known → its code, new → pick a code); never a "are you new?" question. Always night.
- **The void:** a stippled black-and-white print (from the user's reference picture): a bright white light caged by dark, sinewy strands that web together where they cross, turning in 3D; stippled cells, bright at their rims and dim in the middle; faint rays; only a faint mauve tint. No crosshair lines through it. Bright places are dotted more densely, like a print. Sized in proportion to the planets, sitting straight on the sky with no dark halo round it. No orange, no pixel sparks, not realistic or painted light. Add boxes are flat and plain like Are.na's: spacious, no glass, gloss or glow, not paper.
- **Simple until needed:** the base app stays extremely simple. New features show up only when a planet's use (or what you're writing) calls for them; see Direction above. Don't add always-visible buttons, menus or settings for them.
- **Purpose:** the user's work and files are the point. Keep them central and visible (on planet surfaces, peeks, star thumbnails).
- **Deploying:** check changes in the browser (desktop and phone width) before deploying, and keep the `classic` backup intact.
- **Explanations:** write to the user in plain language, without code terms.

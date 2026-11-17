# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Handoff rule

The handoff notes are **one shared file: `/Users/edan/Mutt-notes/PROGRESS.md`**, in a folder beside the project, not inside it. Most sessions run in a worktree under `.claude/worktrees/`, and the app blocks a worktree session from editing files in the main checkout (`/Users/edan/Mutt/...`), so the notes live outside the repo where every session can edit them. So:
- Read `/Users/edan/Mutt-notes/PROGRESS.md` at the start of every session, on its own (the Read tool, not chained with other commands, so one bad path can't fail the read).
- After finishing each task, update that same file with the Edit tool: what was done, what's next (name your branch if it isn't merged), and any new preferences the user gave.
- **It holds only what is still open**, so it stays small enough to read (a session reads at most 256 KB at once; at 424 KB it couldn't be opened, 2026-11-16). When work goes live or is dropped, move its entry to the top of the newest file in `/Users/edan/Mutt-notes/history/` (a few lines) in the same edit; `/Users/edan/Mutt-notes/HISTORY.md` lists those files. Each stays under 200 KB; to look something up, `grep -rn 'word' /Users/edan/Mutt-notes/history/` and read those lines. Keep `PROGRESS.md` under 100 KB (`wc -c`).
- The repo's own `PROGRESS.md` is only a pointer to it. Don't write notes there.
- Preferences that should hold for all future work also go in the **User preferences** section below.
- The notes aren't in git, so there's nothing to commit for them.
- `/handoff` (`.claude/commands/handoff.md`) does this update on demand.
- A Stop hook (`.claude/hooks/handoff-nudge.sh`) asks once, before a turn ends, when this checkout has work newer than the notes or the notes never name its branch.

## Claude setup (2026-11-16)

Everything is in the repo, so every worktree has it:
- **Each edit is checked** (`.claude/hooks/check-edit.sh`, in `.claude/settings.json`): a Python file is parsed, a script under `public/` is parsed by the Mac's own Safari engine (`jsc` + `.claude/hooks/js-syntax.js`, since there is no Node), and a stylesheet or script runs the drift count. A problem comes back at once; fix it before going on.
- **Skills:** `mutt-map` (how each feature is built, one file per feature; see Architecture), `add-mode` (the recipe for a new mode) and `/deploy` (going live; only the user starts it).
- **Agent:** `design-checker` checks a visible change against `DESIGN.md` and reports what breaks it. Run it before calling anything visible done.
- **context7** (`.mcp.json`) looks up current docs for the libraries Mutt fetches (pdf-lib, pdf.js, onnxruntime-web, ffmpeg.wasm).

## Design rule

`DESIGN.md` at the repo root is the one standard for how Mutt looks and moves. Read it before touching anything a person can see.
- Every value, material and part is named there with its number. A value, part or rule that isn't in it doesn't exist: add it there first (show the user), then build it.
- Styling anything new follows its "How to style a new feature" recipe, step by step, and ends on its checklist.
- A session that settles anything visible updates `DESIGN.md` before it ends. Design sentences live there, not here.
- `design/` holds the drawn references: `look-board.html` and `sky-board.html`.
- Buttons, text boxes, menus, switches, sheets, dialogs, toasts and the rest are **shared parts**: one set of classes in the section of `public/assets/galaxy.css` headed SHARED PARTS, with the builders in `public/assets/js/ui.js` (`segmented`, `stepper`, `sectionHead`, `toast`, `openDialog`, `confirmDialog`, `openPopover`, `openMenu`, `openContextMenu`, `sheetPages` (a sheet's doors and pages), and `enterRoom` / `leaveRoom` for a full-screen place) and `tooltip.js`. A file is always shown in the file box (`renderCell` in `cells.js`) and a group of files under a section heading (`sectionHead`). `DESIGN.md` section 4 has the table of class names. A feature uses them and never draws its own; a missing part is drawn first on the hidden sample page, `/parts` (`js/views/parts.js` + `parts.css`, fetched only when opened), then added to `DESIGN.md`, then built.
- A full-screen place (the file view, the editor, cooking, the reader) is a **room**: `.room` on its own element, `enterRoom()` / `leaveRoom()`, and it arrives through `transition(fn, { type: 'room' })`. The page steps away and the sky stays behind it; it never paints its own background. `DESIGN.md` "Room" has the rules, and "The modes" says how list, cookbook, documents, reading and the file view are each built: a new mode follows the nearest.
- **Icons** come from one file, `public/assets/js/icons.js`: `icon(name)` (16; `icon(name, 12)` in a chip or a tag; `icon(name, 20)` in the editor's and reader's bars). Never a keyboard character (× + ••• ✓ →) and never an SVG or a CSS mark of a feature's own. A menu of things to do gives every row `icon: 'name'`; a menu of choices gives `on: true/false`. An offer's small drawing is `drawing(name)` from the same file. `DESIGN.md` "Icons" has the names and how to draw a new one (shown to the user first).
- What Mutt gives you to work with inside a room (a toolbar, a bubble, a find box) takes the class `.bar-glass`; paper is `--paper`, flat, and its two typefaces are fetched by `paperFaces()` in `util.js`.
- Every named value (colour, text size, space, corner, shadow, layer, speed, curve) is written once, in `public/assets/tokens.css`. No other stylesheet or script types a raw one; `tests/run.sh drift` counts them and fails if the count goes up.
- **Anything that moves** follows `DESIGN.md` section 2, "Motion": six lengths, four curves, one step between things arriving in turn, three beats for what never stops. Leaving is always `--dur-change` on `--ease-leave`. A script takes them from `util.js` (`DUR`, `EASE`, `EASE_GLIDE`, `EASE_SPRING`, `EASE_LEAVE`, `STAGGER`, `BEAT`), timers included. The count of hand-typed lengths and curves is 0 and stays 0. That section also lists everything that moves (add a new thing beside the one it is most like), says what Mutt may cost, and how to measure it with the real graphics chip in the hidden browser (the tools in `/Users/edan/Mutt-notes/design/session8/`).
- **Anything that sounds** follows `DESIGN.md` "Sound": `sound(name)` from `sound.js` with a name from `SOUNDS` in `soundbank.js`, never a sound, recording or sound clock of a feature's own. A new moment uses the sound it is most like; a truly new one is made from the parts there and played to the user first.
- **The keyboard**: Tab stays inside whatever is open on top (`topLayer` in `ui.js`: a dialog, a menu or panel, a room, a sheet); something closed but still on the page is `inert`. **Touch**: 40 to tap; a control that keeps a small look joins the list under "Room for a fingertip" in `galaxy.css`.

## What Mutt is

A personal, multi-user place to keep files and connect them (like Are.na), dressed as a PS Vita–style galaxy. Login is a username plus a 6-digit code (`auth.pin_problem` turns away easy ones: repeats, runs, patterns, years; accounts from before 2026-11-11 keep signing in with 4 digits until they change it; `users.short_code` marks an account that last signed in with 4, `oldCode` on `/api/me` and the login answer, and `askForLongerCode` in `account.js` asks it once a day to pick 6; 4-digit guesses, at sign-in and at planet codes, stop at `auth.SHORT_LIMIT` (10) misses a day instead of 40). A planet's own code (Code sharing) stays 4 digits (`auth.CODE_RE`). `README.md` covers features, env vars and hosting.

Vocabulary, because the UI and the code use different words:

| UI | Code / DB |
| --- | --- |
| planet | drawer (`drawers` table, `/api/drawers`) |
| file | block (`blocks` table, `/api/blocks`) |
| star | a block with no connections (not on any planet) |
| putting a file on a planet | a connection (`connections` table) |
| the void (formerly the black hole) | `blackhole.js`, where things are added |
| universe | everyone's galaxies, below your galaxy on the same page |
| constellation | a few stars (2 to 12) joined in your sky with a name (`constellations` + `constellation_stars` tables, `/api/constellations`); the files stay stars, with no connections, until it becomes a planet |
| a shared planet ("kept together" in older notes) | a drawer with a `drawer_keepers` row (its second keeper); still owned by `drawers.user_id` |
| beaming out / beaming in (never "transmissions") | a `beams` row: a file sent to one person, waiting for their answer |
| moon | a drawer with `parent_id` set (its planet); one level only, up to 8, never picked by autosort, hidden from planet lists; a list planet's moons start as lists; it follows its planet's sharing until its owner sets the moon's own (`drawers.own_sharing`) |

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

How the mechanism works (agreed with the user and built, 2026-11-11):
- **One registry, two halves with the same keys.** `mutt/modes.py` holds each mode's trigger, its two bars, whether moons can have it, how it arrives and its saved settings. `public/assets/js/modes.js` holds its view, offer words, ••• menu and how its code is fetched. Everything else is shared: `modes.clean` checks and stores every mode's settings, `modes.signs` reads every planet mode in one pass (`GET /api/drawers/<id>/modes`), `modes.moment` answers the moment modes (`POST /api/moment`), and `views/planet.js` does turning on and off, Undo, the offer, the menu and stepping back.
- **Two kinds.** *Planet* modes belong to a whole planet (list, reading, cookbook, documents, commonplace book). *Moment* modes answer what's being written right now in one note (writing: "This reads like a piece of writing · Write it as a document", in `moments.js`).
- **Two bars, judged by the share of the planet's files.** A mode switches on at the higher bar (`on`) and keeps fitting down to the lower one (`stay`), so one odd file never switches it on and it never flickers. The lower bar applies once the owner has answered (the mode is on, or its offer was waved away). The four older modes keep their own rules for switching on (their `read` gives `fits`); new modes use the plain share rule.
- **How a mode arrives** is one word in its server entry: `offer` (suggested once, in place; the owner accepts), `undo` (switches on by itself and says so with an Undo) or `quiet` (appears and leaves by itself). Decided with the user: **whole-planet modes are offered** (they take over the page, and some rewrite notes); **moment modes arrive by themselves**. Changing one later is changing that word.
- **A mode the owner accepted never leaves by itself.** If the planet falls under the lower bar, the same quiet box says so once ("Most of this planet isn't a list any more": "Show as files again" / "Keep it"); either answer is remembered (`kept`).
- **Speed.** Signs are asked for after the page is up, never before, and again `DUR.scene` after the planet's files stop changing while it's open (`lookAgain` in `views/planet.js`: added, taken off, deleted, edited), so an offer comes while the owner is filling the planet, not only on the next visit (the user, 2026-11-16: "it's better to guess wrong occasionally than not correctly guess what a planet is"; the bars were lowered then too). `sorting.form` keeps its answer per text (`_form`, cached), since every mode reads the same notes. The planet's files and its purpose are read once per request and only if a mode asks (`modes.Reading`). A mode's code is fetched only when a planet uses it (`load` in `modes.js`, a dynamic `import()`; `mutt/assets.py` versions those but doesn't preload them). A plain planet loads no mode code at all.
- Every offer is the one box in `offers.js` (`modeOffer`): a mode only supplies its words.
- **A mode that acts once** (split into moons) is an entry with `shows=False` on the server and `act(page)` instead of `load`/`view`/`start` on the page: it is offered and kept in the ••• menu like the rest, its button does the thing with an Undo, and it is never "on". One thing at a time on a planet page: the sharing tip waits while a mode is being offered.

### How to add a mode

Follow the `add-mode` skill (`.claude/skills/add-mode/SKILL.md`): twelve steps, from the trigger in `mutt/modes.py` to the browser checks and the notes.

## Commands

No dependencies, no build step, and no Node in this environment. The browser is the only JS syntax check (the browser paths below load every page, so they catch a script that won't parse).

```bash
python3 server.py                                    # http://localhost:8080, data in ./data
MUTT_DATA_DIR=/some/dir PORT=8123 python3 server.py   # separate data folder / port
tests/run.sh                                         # every check; prints ~3 lines, details only for failures
```

## Checks (run before going live)

`tests/run.sh` is the one command: the drift count (instant), 13 API suites (~28 s), then 16 browser paths in a hidden browser (~65 s). It prints a pass/fail line for each and `ALL PASSED` or `FAILED`; only failures get detail. **Every session runs it before going live and doesn't deploy on a failure.** While working, run only what you touched: `tests/run.sh docs`, `tests/run.sh api`, `tests/run.sh browser undo`.

- **API suites** (`tests/<name>.sh`: smoke, galaxy, preview, lockout, search, autosort, moons, books, docs, cookbook, comments, modes, together) are curl scripts that print one `label: answer` line per check. The right answers are in `tests/expected/<name>.txt`; a different line fails. Ids and times are masked. Mutating requests need the `X-Mutt: 1` header.
- **Browser paths** (`tests/browser.py`, the `PATHS` list) walk the site in a hidden browser against a made-up account (`seed`); nothing shows on screen. Each saves pictures to `tests/shots/latest` (not in git). Don't open the pictures unless the user asks about looks; `tests/run.sh browser --keep` saves a "before" set to compare by eye. The hidden browser is **Safari's engine** (WebKit as Playwright builds it, `SafariEngine` in `browser.py`), fetched once by `python3 tests/get_browser.py --webkit` into `~/.cache/mutt-tests` (a private Python folder, nothing system-wide). Decided with the user (2026-11-15): **one browser, never two runs**; Safari's engine because the owner uses Safari and plain web code breaks there first (it found Tab leaving the account sheet, which Chrome hid). Without it the paths use Chrome's headless shell (`python3 tests/get_browser.py`), else Safari itself, whose window must be left alone. `MUTT_BROWSER=chrome` picks Chrome on purpose (the motion measurements in `DESIGN.md` still use Chrome); `MUTT_BROWSER=safari tests/run.sh browser` checks real Safari (only when the user asks: it takes over a window). Each run asks the system for its own free ports (`tests/ports.py`; the suites read `MUTT_TEST_PORT`), so sessions testing at once never meet; before 2026-11-16 every worktree shared 8098/8099 and a second run could quietly test the first one's server.
- **Adding a check for a new feature** (one or two, not more):
  - Server: add an `echo "label: $(curl ...)"` line to the fitting suite, run `tests/run.sh -v <suite>`, read the new line, then `tests/run.sh --accept <suite>`. For a promise that must never break (privacy, sign-in) use `rule "what went wrong" "$got" "$should_be"` from `tests/lib.sh`.
  - Browser: only if the feature adds a path people walk. Write `def my_path(s, seeded)` in `tests/browser.py` (get there, do the one thing, check one result, `s.shot('name')`), add it to `PATHS`; seed what it needs in `seed()` so it doesn't depend on another path.
- **Drift** (`tests/drift.py`, `tests/run.sh drift`, one line): counts the colours, text sizes, corners, shadows and speeds typed by hand in the stylesheets (all but `tokens.css`) and the scripts, and fails when any of the ten counts is higher than the one in `tests/expected/drift.txt`. It runs first in a plain `tests/run.sh`.
  - **It failed:** something new typed a raw value. Use the name from `tokens.css` (`DESIGN.md` section 2 says which); in a script, `DUR` / `EASE` / `BLUE` from `util.js`. `tests/run.sh -v drift` lists the counts file by file, and the failure names the file that grew.
  - **A session removed some** (it says "lower than recorded"): `tests/run.sh --accept drift` records the lower counts, so they can't creep back. Do this at the end of every design session and put the new numbers in the notes.
  - **A raw value is truly needed** (a new planet kind's palette, a picture's own colours): `--accept` refuses to record a higher count. Tell the user, then raise that one line in `tests/expected/drift.txt` by hand in the same change.
- **When a check fails**: the app is wrong unless you changed that behaviour on purpose. Only then `--accept`, after reading every changed line. Never accept to make a failure go away.

## Architecture

This section is the part every session needs. **How each feature is built lives in its own file** in `.claude/skills/mutt-map/` (moved out of here on 2026-11-16 so sessions don't read all of it every time): before changing a feature, read its file below; when a feature changes, update its file; a new feature gets a new file and a line in this list.

**Server** (`server.py` → `mutt/app.py`): a zero-dependency Python WSGI app on SQLite (WAL).
- Routes live in `mutt/api.py`, declared with `@route(method, regex)`. They return `json_response(...)` and fail with `HttpError(status, message)`.
- Prefs are validated against `PREF_CHOICES`, so a new pref has to be added there and to `DEFAULTS` in `public/assets/js/theme.js`.
- "Others can add files" (`drawers.community`) only goes with Public: the server refuses it with any other setting, leaving Public turns it off (other people's files leave), and every check (`drawer_visible`, `writable_drawer`, `in_community_drawer`, the community list) also asks for `visibility = 'public'`.
- Behind the host's proxy the visitor's address is read from the end of `X-Forwarded-For` (`MUTT_PROXY_HOPS`, default 1; `web.Request.client_ip`), never from what the visitor wrote at its front. `/api/health` reports `forwarded`, how many addresses came in, to check it.
- Planets on the galaxy have no hover preview of their files; hovering lifts the globe a little and brightens its rim.

Rules that reach across features (each is explained in its feature's file):
- Queries that list planets need `parent_id IS NULL` (moons are hidden from planet lists).
- Any new query that lists a user's files without going through `connections` needs `deleted_at IS NULL` (recently deleted files are kept a week).
- A new table that holds something about a person belongs in `Your data.json` too (`mutt/export.py`).
- Anything new that stores someone's picture or video calls `privacy.forget_place` / `forget_place_bytes` first.
- Something about a file that only its owner should see is hidden from everyone else in `public_meta`.
- Mutt must run as one process: live updates hold their streams in memory.

**The feature files:**
- **Who sees what, names and getting back in** ([sharing-and-accounts.md](.claude/skills/mutt-map/sharing-and-accounts.md)): who can see a planet (`drawer_visible`), Code planets, the universe's stand-ins, display names, recovery key, forgot code, reset links (`views/login.js`, `account.js`, `resets.js`, the account and person sheets in `statusbar.js`).
- **Autosort** ([autosort.md](.claude/skills/mutt-map/autosort.md)): how a new file finds its planet: `sorting.py`, likeness to each file, `pick`, close calls, learning from moves.
- **Reading mode** ([reading.md](.claude/skills/mutt-map/reading.md)): books, the shelf, the reader, EPUB/PDF (`books.py`, `reading.js`, `reader.js`, `pdfbook.js`).
- **Cookbook mode** ([cookbook.md](.claude/skills/mutt-map/cookbook.md)): recipe cards, cooking mode, scaling (`recipes.py`, `cookbook.js`, `amounts.js`).
- **Documents mode** ([documents.md](.claude/skills/mutt-map/documents.md)): the desk, the editor, kinds of writing, export, making a document from Word/ODT/RTF/PDF (`documents.py`, `convert.py`, `docs.js`, `doceditor.js`, `docformat.js`, `docexport.js`, `docwriting.js`).
- **Split into moons** ([split-into-moons.md](.claude/skills/mutt-map/split-into-moons.md)): the mode that acts once (`split.py`, `splitIntoMoons` in `views/planet.js`).
- **Commonplace book** ([commonplace.md](.claude/skills/mutt-map/commonplace.md)): the quote wall (`quotes.py`, `quotes.js`).
- **Board mode** ([board.md](.claude/skills/mutt-map/board.md)): earned by arranging; the collage, lines, words (`board.js`, `board_items`, `hand_moves`).
- **Pictures** ([pictures.md](.claude/skills/mutt-map/pictures.md)): place stripped from photos (`privacy.py`), the photo editor (`photoedit.js`), previews made in the browser, what a picture shows (`see.js`, `sight.py`, CLIP).
- **Send to Mutt (Share menu)** ([send-to-mutt.md](.claude/skills/mutt-map/send-to-mutt.md)): the Apple shortcut, `POST /api/send`, send keys.
- **Merging planets** ([merging-planets.md](.claude/skills/mutt-map/merging-planets.md)): `Merge into…`, `planet_merges`, Undo.
- **Recently deleted, note history, download everything** ([deleted-history-export.md](.claude/skills/mutt-map/deleted-history-export.md)): `deleted_at`, `doc_versions` / `history.js`, `export.py` and `Your data.json`.
- **Files on several planets, saved copies** ([files-on-planets-and-copies.md](.claude/skills/mutt-map/files-on-planets-and-copies.md)): `alsoOn`, threads and links between planets and galaxies, `savedFrom` / `madeBy`, `file_story`.
- **Constellations** ([constellations.md](.claude/skills/mutt-map/constellations.md)): stars joined with a name (`constellations.js`, `/api/constellations`).
- **Shared planets and beaming** ([shared-planets-and-beams.md](.claude/skills/mutt-map/shared-planets-and-beams.md)): a planet kept by two people (`drawer_keepers`, `keeping.js`, `part_ways`) and files beamed to one person (`beams`, `beams.js`).
- **Comments on files** ([comments.md](.claude/skills/mutt-map/comments.md)): `file_comments`, `comments.js`, the notes under the clock (`commentnotes.js`).
- **PDF markup** ([pdf-markup.md](.claude/skills/mutt-map/pdf-markup.md)): highlights, ink, changed words written into the PDF (`pdfedit.js`, pdf-lib).
- **Spelling** ([spelling.md](.claude/skills/mutt-map/spelling.md)): `spell.js`, `docspell.js`, `spellfield.js`.
- **Phones** ([phones.md](.claude/skills/mutt-map/phones.md)): phone sizes, menus as sheets, the galaxy ring, memory in Safari on a phone.
- **Comets** ([comets.md](.claude/skills/mutt-map/comets.md)): reminders you can see, push notifications, the service worker (`remind.js`, `comets.js`, `when.py`, `webpush.py`, `reminders`).
- **Live updates** ([live-updates.md](.claude/skills/mutt-map/live-updates.md)): pages following changes made elsewhere (`live.py`, `live.js`, `syncPage`).
- **Downloading as another kind, too-big files** ([downloads-and-shrink.md](.claude/skills/mutt-map/downloads-and-shrink.md)): `downloads.js`, `convert.js`, ffmpeg, `shrink.js`, `makeSmaller`.
- **Search as gravity** ([search.md](.claude/skills/mutt-map/search.md)): `gravity.js`, `search.js`, `/api/search`.
- **Throw to Sort** ([throwing.md](.claude/skills/mutt-map/throwing.md)): `fling.js`, throwing stars and boxes, carrying a file to the corner to make it a star.
- **Speak to the Void** ([voice.md](.claude/skills/mutt-map/voice.md)): holding the void to record, words read on the device (`voice.js`, `hear-worker.js`, `hear.py`).
- **The galaxy, planets and the sky** ([galaxy-and-sky.md](.claude/skills/mutt-map/galaxy-and-sky.md)): `views/galaxy.js` (stars, the runway, the universe), `planets.js` and `planetgl.js`, planet positions, the void (`voidmake.js`, `voidart.js`), `sky.js`, `uvweb.js`, the drop ring.
- **Sound** ([sound.md](.claude/skills/mutt-map/sound.md)): `sound.js`, `soundbank.js`, who calls `sound(name)`.

**Front end** (`public/index.html` + `public/assets/js`): vanilla ES modules.
- `util.js` `h()` builds DOM; `style` keys set CSS custom properties.
- `index.html` loads a plain script, `js/wait.js`, between the stylesheets and the app. It does nothing but make the browser wait for `tokens.css` before the app starts: without it Safari starts first on an uncached visit, every named value reads as nothing and scripted motion takes no time. Keep it there, as it is.
- **The owner uses Safari.** Anything that paints (a canvas, a painter, a big animated layer) is measured in Safari as well as in the hidden browser (`DESIGN.md` "How to measure"; it opens a Safari window, so ask first). Safari pays for the whole of a canvas each time it is copied from: a canvas that is drawn from is only as big as what is on it.
- `bus` carries app events: `block:*`, `upload:done`, `drawer:changed`, `stats:changed`, `universe`.
- `router.js` maps paths to views (registered in `main.js`). A view is `{ load(params), create(params, data) }`, and `create` returns an instance with:
  - `el`, `title`, `chrome`, `who`
  - `home` (shows the corner back arrow), `goHome`
  - `dropTarget()`, `pasteText()`, `mounted()`, `destroy()`
- There is one logo, the Wonky (`logo.js`; its face, Fraunces, is the only one `index.html` links). The typefaces its letters flick through are fetched by `loadFaces` the first time the flicker runs, never up front.
- Shared parts: `ui.js` builds the segmented bar and tabs (`segmented`), the stepper, toasts, dialogs, small panels and menus (every menu opens one way: `glideLight` gives any `.menu` its rows arriving in turn and the one gliding highlight, and keeps Tab inside what is open); `tooltip.js` shows the one tooltip for anything with a `title` (it takes the `title` away the first time the thing is pointed at, and leaves people's own writing alone); uploads show as a toast (`uploads.js`); the drop hint is in `main.js` (a view's `dropTarget()` may give `label`, `el` to light up, `lit(on)`, and a string from `over(e)`). The sample page is `views/parts.js` at `/parts`.
- `statusbar.js` reads the view instance in `update(inst)`. It also owns the account/settings sheet, search, and the faint back arrow in the corner that takes you home.
- `fx.js` holds the motion helpers; `drag.js` handles pointer drag onto targets. Speeds and curves for `.animate()` and for timers come from `util.js` (`DUR.quick/change/move/arrive/scene/grand`, `EASE`, `EASE_GLIDE`, `EASE_SPRING`, `EASE_LEAVE`, `STAGGER`, `BEAT`), which reads them from `tokens.css`.
- `cells.js` draws the file box, the one frame every kind of file is shown in (`renderCell`; `DESIGN.md` "File box" says how to add a kind); its look is the section of `galaxy.css` headed THE FILE BOX. `entry.js` is the add box, the first box on a planet. `grid.js` fills a big planet in two steps (the first 24 boxes, then the rest a dozen at a time once they have arrived); anything that needs every box calls `finishRest()` first (`cellFor`, `keys`, `set`, drags, uploads, Tab and scrolling already do).
- `drift.js` leans the one file box being pointed at toward the pointer and settles it back when the pointer leaves; no other box moves. It writes `--mx`/`--my` on that box alone (registered in `galaxy.css` so they don't inherit), never on the page around it.
- Motion: Still (`data-motion="off"`) and the system's reduced-motion setting run every CSS animation once in no time, so entrances land on their last frame. Never pause animations to stop them: a paused entrance stays on its first, invisible frame (that once left planet pages blank under Still).

**CSS:**
- How things look is set in `DESIGN.md` (values, materials, parts). The bullets here are only where the files are.
- Stylesheets sit directly in `public/assets/` (there is no `css/` folder). Three, in this order (plus `parts.css`, the sample page's layout, fetched only at `/parts`):
  - `tokens.css`: every named value, on `:root` (plus the three other skies' colours). Loaded first, on every page. A line ending `WANTS … (session N)` still holds the old value until that design session switches it.
  - `galaxy.css`: the one stylesheet every page loads. Its section headed SHARED PARTS holds every shared part (see `DESIGN.md` section 4); a planet's colour is set just below it, on the planet's own page content (`#view`) and never on `body`, so menus, sheets, dialogs, toasts and the top bar stay Mutt blue. It opens with "the older base" (what still paints from the old white site's `mutt.css`, which was folded in on 2026-11-11 with its overridden rules removed); nothing new goes in that section, and a part's rules there move down beside its other rules when the part is rebuilt. Each mode's rules are one marked section of it (LIST MODE, READING: THE SHELF, READING: THE READER, THE FILE BOX, THE FILE VIEW, THE COOKBOOK); a rule for a mode goes in its section and nowhere else.
  - `docs.css`: documents only, fetched when a planet is a desk or a document opens: whatever imports `docs.js` or `doceditor.js` waits for `styles('docs.css')` alongside the import (`load` in `modes.js`, `loadEditor` in `views/planet.js`, `viewer.js`); `styles()` is in `util.js`. A new mode's stylesheet loads the same way.
- The site is dark only. Light mode (and the Mode setting) was removed on 2026-10-30; don't bring it back.
- Don't put `position` in the bar glass rule (`.sheet, .dialog, .pop, .toast, .tip, .tooltip, …`). `.pop` must stay `position: fixed`; overriding it is what made menus open in the wrong place.

## Branches and deploying

- Work happens on `galaxy`, which is fast-forwarded into `main`. Northflank auto-deploys `main` to https://p01--mutt--cxklgp67kgsx.code.run.
  - Deploy: `git checkout main && git merge --ff-only galaxy && git push origin main`, then push `galaxy` too.
  - Check it's live: a new asset URL returns 200, and `/api/health` shows `persistentStorage: true`.
- The pre-galaxy site is kept on the `classic` branch and the `classic-v1` tag. Both read the same database.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## User preferences

- **Look and feel:** in `DESIGN.md`, which is binding: PS Vita in character, dark only, frosted glass, the void as a stippled print, pixel art only as a small accent, not AI-looking. The earlier preferences on the look, frosted glass, pixel touches, sign-in and the void were moved there whole.
- **Design system (decided 2026-11-11):** one standard, `DESIGN.md`. A planet's colour belongs only to that planet's own things (its boxes, header, own buttons); the account sheet, search and other shared controls stay Mutt blue on every page. Boxes are calm at rest: the slow float stays, and glow and lean belong only to the box being pointed at or typed in. Planets and the files on them, one icon set, the sky, and the logo and its loading all matter. Foundations come before visible changes; show the user what is proposed (with options) before building it; leave nothing less smooth or more broken than you found it.
- **Simple until needed:** the base app stays extremely simple. New features show up only when a planet's use (or what you're writing) calls for them; see Direction above. Don't add always-visible buttons, menus or settings for them.
- **Offers guess readily (2026-11-16):** "it's better to guess wrong occasionally than not correctly guess what a planet is." A mode's offer should come soon, while the owner is using the planet, and set its bars low rather than high (a waved-away offer costs one tap).
- **Purpose:** the user's work and files are the point. Keep them central and visible (on planet surfaces, peeks, star thumbnails).
- **Deploying:** check changes in the browser (desktop and phone width) before deploying, and keep the `classic` backup intact.
- **Explanations:** write to the user in plain language, without code terms.
- **Don't waste usage (2026-11-11):** while working run only the checks a change touches (`tests/run.sh <suite>`; the whole `tests/run.sh` once, before going live), keep command output short, and keep browser checks to what the change could have broken. When the user narrows the job mid-task, drop the rest rather than finishing it.

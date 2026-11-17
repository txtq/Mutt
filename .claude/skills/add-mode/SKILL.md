---
name: add-mode
description: The twelve steps for adding a mode to Mutt, a feature that switches on by itself when a planet (or the note being written) calls for it, through the one registry in mutt/modes.py and public/assets/js/modes.js. Use when building a new planet mode or moment mode, or changing how an existing one is triggered, offered or turned off.
---

# How to add a mode

Read "Direction: features that appear when you need them" in `CLAUDE.md` first: it says what a mode is and how the registry works.

Follow these steps in order. The worked example is the portfolio (an art planet's pictures shown as a monograph): it was built this way on 2026-11-11 and then set aside at the user's word, so it is **not in the app**. Its whole build is kept as a patch at `/Users/edan/Mutt-notes/parked/portfolio-with-registry-2026-11-11.patch` (search it for `portfolio`); for a mode that is in the app, read `reading` in both registries.

1. **Decide the kind.** A feature for a whole planet is a planet mode. A feature for the note being typed is a moment mode (skip to step 9).
2. **Write the trigger** in `mutt/modes.py`: a function `read_<key>(ctx)` that returns `{'signs': [...], 'count': n, 'share': n / files}`.
   - `ctx.purpose` is `sorting.purpose` for the planet (`contains`, `counts`, `shows`, `topics`, `role`, `forms`…); `ctx.files` and `ctx.with_meta` are its files; `ctx.title` its name. Never start a second classifier, and put new vocabulary in `lexicon.py`.
   - `count` is how many files are the mode's kind, `share` is that over all files (use `_share`).
   - `signs` are one or two plain sentences that say what was noticed, with numbers ("5 of its 7 files are artwork: prints."). They show in the offer.
   - Example (portfolio): count the files whose kind in `purpose['contains']` is artwork (`sorting.ART_MEDIUMS`); on a planet whose top topic is Art, pictures not yet read count too. `contains` holds only the top few kinds as shares, so add whole counts to `sorting.purpose` if a mode needs them exact.
3. **Add the entry** to `PLANET_MODES` in `mutt/modes.py`: `Mode('<key>', read_<key>, on=…, stay=…, least=…, moons=…, arrives='offer', settings={…})`.
   - `on`: start at 0.6 (most of the planet). Go lower only if the mode's files normally share a planet with others (a cookbook's recipes sit among photos: 0.3).
   - `stay`: a little over half of `on` (0.6 → 0.35). Never equal to `on`.
   - `least`: the fewest files of its kind that make the mode worth having (portfolio: 4).
   - `moons`: `True` only if the mode makes sense on a moon and its view was checked on one.
   - `arrives`: `'offer'` for any mode that takes over the planet's page. Ask the user before using `'undo'` or `'quiet'` for a planet mode.
   - `settings`: every value the mode saves on the planet, each with a check from the top of the file (`flag`, `one_of(...)`, `names(...)`, `ids(...)`). `on`, `dismissed` and `kept` come free. Nothing else can be saved.
4. **Add the page entry** to `MODES` in `public/assets/js/modes.js` under the same key, and put the key in `SHOW_ORDER`, `OFFER_ORDER` and `MENU_ORDER`. Copy the `reading` entry and change: `label` ("Make it a …"), `icon` and `drawing` (names from `icons.js`), `name` ("a …", used mid-sentence), `moons` (same as the server), `load` (`() => import('./<file>.js')`), `view`, `start`, `blocks`, `offer`, `menu`.
   - **Offer wording:** title "This planet looks like …"; `note` says in one or two sentences what will change and that nothing is lost; `accept` is the same words as `label`; `busy` is three words ending in "…". Its small drawing is one of the panes in `icons.js` (`drawing: 'shelf'` in the entry; `DESIGN.md` "Offer" says how to draw a new one, which is shown to the user first), and `icon` is the icon its "Make it a …" row carries in the ••• menu.
   - **Undo and turning off come free** if `blocks(view)` returns every file the view holds and `start` changes nothing that can't be shown as files again. The ••• menu needs `showAsFiles(page, '<key>')` last.
5. **Write the view** in its own file (`public/assets/js/<key>.js`), a class with `el`, `list()`, `dropTarget()`, `pasteText()`, `destroy()` and a `drawer` field. Copy the shape of `ShelfView` in `reading.js`: files that aren't the mode's kind stay in a `makeCollection(...)` below, and the `bus` events (`upload:done`, `block:deleted`, `block:connected`, `block:disconnected`, `block:changed`) keep it current. Nothing else may import this file statically, or it loads on every page.
6. **The look.** Follow "How to style a new feature" in `DESIGN.md`, every step, and tick its checklist. Only this is particular to a mode: its styles go in their own stylesheet, fetched with its code: in `modes.js`, `load: () => Promise.all([import('./<key>.js'), styles('<key>.css')]).then(([m]) => m)` (copy `documents`), so the view never shows before its look; or in `galaxy.css` if small.
7. **Server routes** for anything the mode stores beyond its settings go in `mutt/api.py` (cookbook: `/cookify`, `/recipes`). Tables go in `db.migrate`.
8. **Tests:** add lines to `tests/modes.sh` that print `fits`, `share` and `left` just under and just over both bars (copy the list block), a bad setting, and a moon. Run `tests/run.sh -v modes`, read the new lines, then `tests/run.sh --accept modes`. Run only the suites whose code you touched while working; the user asked not to spend usage re-running everything.
9. **A moment mode** is `Mode('<key>', read_<key>, kind='moment', arrives='quiet', on=…, stay=…)` in `MOMENT_MODES`, where `read_<key>(text, form)` returns `{'strength': 0 to 1, 'say': 'one short line'}` from `sorting.form`'s strengths. Each place it can appear passes what its button does: `momentLine(area, { acts: { <key>: { label, run } } })` (the add box in `views/planet.js` `attachHint`, the note in `viewer.js`). It needs no page entry.
10. **Check in the browser**, at 1280 wide and at 375 wide:
    - a planet just under the `on` bar shows no offer; just over, the offer shows once with the right signs; "Not now" keeps it away after a reload but leaves it in the ••• menu;
    - accepting turns it on; "Show as files again" brings every file back; Undo returns to the mode; a reload opens straight in the mode;
    - under the `stay` bar the step-back box shows once; "Keep it" is remembered;
    - a plain planet fetches none of the mode's files (Network tab), and a planet in another mode doesn't either;
    - no sideways scroll at 375, no console errors, and Motion: Still shows everything.
    The test browser draws animations slowly when its pane is hidden; set `document.documentElement.dataset.motion = 'off'` to check behaviour, and judge motion separately.
11. **Sound.** A mode's view sounds by itself where it uses the shared parts and `transition`. Anything it adds that a person moves or finishes (carrying, rearranging, opening its own thing) calls `sound(name)` with the nearest name from `DESIGN.md` "Sound" (rearranging: `lift`, `shift`, `drop`, copy `listmode.js`); never a sound of its own. It is step 9 of "How to style a new feature".
12. **Write it down:** a file for the mode in `.claude/skills/mutt-map/` and its line in the list under Architecture in `CLAUDE.md`, anything visible it added or changed in `DESIGN.md`, and the notes in `/Users/edan/Mutt-notes/PROGRESS.md`.
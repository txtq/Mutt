# DESIGN.md

The one standard for how Mutt looks and moves. Read it before touching anything a person can see.

- **A value, part or rule that isn't in this file doesn't exist.** Don't invent one inside a feature. If a feature needs something new, add it here first (show the user), then build it.
- **Every session that settles something visible updates this file before it ends**, so the file is never behind the app.
- It is written as instructions. Where it says "is", build it that way.
- Decided with the user on 2026-11-11 (design session 1 of 8). The drawn references are in `design/`: `look-board.html` (every value, material and part, drawn) and `sky-board.html` (the live sky). Open them in a browser when a number here isn't enough.

## Where the app stands against this file

The app does not match this file yet. Sessions 3 to 8 of the plan in `/Users/edan/Mutt-notes/PROGRESS.md` bring it into line, in this order. Update this table as each lands.

| Area | In the app today | Lands in |
| --- | --- | --- |
| Named values (section 2) | **Done (session 2).** Every name below is in `public/assets/tokens.css`, the one place raw values are written. `mutt.css` is gone (folded into `galaxy.css`). `tests/run.sh drift` fails if a hand-typed value is added. | Session 2 ✓ |
| Shared parts (section 4) | **Done (session 3).** One button, text box, switch, segmented bar, tabs, tick box, chip, stepper, menu, small panel, sheet, dialog, toast, tip, tooltip and drop hint, in one marked section of `galaxy.css`, each drawn in every state at `/parts`. What the modes still draw themselves is listed under "What session 3 left for later". | Session 3 ✓ |
| Planet page, file boxes, planet colour rule | The planet's colour now reaches only its own page content (session 3), so account, search, menus, dialogs and toasts are Mutt blue everywhere. Still to do: glow on every box at rest, the header on its old glass, readable greys | Session 4 |
| Modes on the shared look | Private palettes `--lm-*`, `--de-*`, `--rd-*`, `--vf-*` | Session 5 |
| Icons | Four sets and about 35 keyboard characters | Session 6 |
| The sky, planets, logo | Old gradient sky; five logo styles in Settings | Session 7 |
| Motion | The five lengths and three curves are named and used where they matched; 386 other lengths and curves are still typed by hand (279 in stylesheets, 107 in scripts) | Session 8 |

### Values that still hold yesterday's number

Session 2 changed nothing a person can see. So where this file asks for a different value than the app had, the name exists but still holds the old value. Each line in `tokens.css` that does this ends with `WANTS <value> (session N)`. This is the to-do list; when a session switches one, it deletes the `WANTS` note and the row here.

| Name | Holds today | This file asks for | Switched in |
| --- | --- | --- | --- |
| `--ink` `--ink-2` `--ink-3` `--ink-4` | `#eef2fb` `#bcc6de` `#8592b0` `#56627f` | `#f2f5fc` `#cbd3e8` `#a4b0cd` `#7f8cab` | Session 4 |
| `--sky-shadow` | `0 1px 2px rgba(0,0,16,.85), 0 0 10px rgba(0,0,24,.5)` | `0 1px 2px rgba(0,0,18,.8), 0 0 10px rgba(0,0,18,.5)` | Session 4 |
| The planet header and the file boxes | their old glass, kept under `--head-fill`, `--head-edge`, `--head-shadow` and `--card-*`, re-tinted by the planet's page | box glass (section 3), and those names go | Session 4 |
| `--paper` `--paper-ink` | a cream gradient; `#262a34` | `#f8f5ee` flat; `#1d1b18` | Session 5 |
| Box glass (`--fg-fill`, `--fg-fill-hover`, `--fg-frost`, and the edge, glow and shadow in the `.fglass` rule) | fill `.085`, frost `blur(20px) saturate(0.95) brightness(1.08)`, a glow at rest | the recipe in section 3 | Session 4 |
| The sky | the old gradient, clouds and ribbons (`--neb-*`, `--ribbon*`) | the sky in section 3 | Session 7 |

Names kept from before that are not in this file (`--head-*`, `--card-*`, `--bg`, `--ease-in`, `--ease-io`, the old page grid, documents' `--de-*`) sit in a marked block at the foot of `tokens.css` with the session that removes each. Don't use them in new work.

### What sessions 2 and 3 left for later, on purpose

- **Values off the scales stay hand-typed** until their part is rebuilt: 12.5 and 11.5 text, 14 and 10 corners, 0.3 and 0.25 second motion, 6, 10 and 14 spacing. They are what `tests/run.sh drift` counts. In the stylesheets, after session 2 and after session 3: colours 501 → 448, text sizes 204 → 176, corners 168 → 141, shadows 97 → 94, speeds 279 → 254.
- **`galaxy.css` still opens with "the older base"**: what is left of the old white site's stylesheet. The shared parts' rules have left it; the rest moves when sessions 4 and 5 rebuild each part. Nothing new goes in that section.
- **Three rooms sit on numbers of their own** (see Depth).
- **Session 3 left these half-way.** Each is on the shared parts as far as it could go without redrawing a mode's own panel:
  - *For session 4 (planet page and file boxes):* the planet header and the flying chip keep their old glass (`--head-*`); the badge on a tile and list mode's box and offer read it too. The buttons on a file box (`.pill`) are shared small buttons with a solid back (`--bg`) because they sit on pictures. A planet's and a file's name and note (`.liv-title`, `.liv-desc`, `.vw-title`, `.vw-desc`) and a list's rows (`.lm-input`) are not on `.field-bare` yet. The add box's own "Drop" veil (`.entry-drop`) and the people list's round ticks (`.pp-tick`) are as they were. Small words in `--ink-4` inside menus (`.cx-count`, `.cx-owner`) wait for the greys.
  - *For session 5 (the modes):* the reader keeps its own panels, its selection menu and its row choices for typeface, spacing, pages and edges (`.rd-panel`, `.rd-pop`, `.rd-pop-btn`, `.rd-choice`), reading the reader's four page colours; its buttons, tabs and text-size stepper are shared, through the colour names mapped on `.rd`. The editor keeps its Aa panel's groups of toggles (`.de-aa-seg`, `.de-aa-opt`), its swatches, the selection bubble's buttons (`.de-bub`), the slash menu's rows (`.de-slash-item`) and its word-buttons (`.de-word`); its toolbar buttons stay 32 on touch screens. The cookbook's editor fields are shared text boxes on the card's own type and padding (`.cbe-field`); cooking's big buttons and ingredient ticks (`.cbk-*`) are its own sizes. The file view's buttons are shared; its panel and note box are not. Search's row of filters (`.search-opt`) are shared small quiet buttons; its colour dots and the planet picker's rows (`.cx-row`) are their own.
  - *For session 6 (icons):* menu rows have no icons yet; round buttons still hold `•••`, `×`, `←` and `→` as characters.
  - *For session 8 (motion):* the lengths typed by hand in the shared parts (a menu's 0.42 s, a sheet's 0.45 s, a dialog's and a toast's 0.6 s, the bead's 0.45 s) are the app's old ones, kept so nothing moves differently yet.

## 1. Principles

1. **The sky is the page.** Nothing paints its own page background. Everything sits on the one sky.
2. **Five materials, no sixth.** Sky, glass (two kinds), gloss, paper, print. Section 3 says what each is for.
3. **Your files are the brightest thing.** Chrome is dim and thin. Pictures, pages and covers carry the colour.
4. **A planet lends its colour to its own things only.** If it sits on box glass on that planet's page, it may take the planet's colour. If it sits on bar glass, it is Mutt's and stays Mutt blue on every page.
5. **Two typefaces, two jobs.** Red Hat Text for words, Red Hat Mono for small facts and small labels. A serif only on paper.
6. **Things arrive, they don't appear.** Opening and closing are the same motion in two directions, on the shared lengths and curves.
7. **Simple until needed.** A feature has no button until what you're doing calls for it (see "Direction" in `CLAUDE.md`).
8. **Calm at rest.** At rest a box only floats, slowly. Glow and lean belong to the one box being pointed at or typed in.

What Mutt must not look like (the user's words: "not AI-looking"): glow on everything at once; two-colour gradients on controls; everything moving at rest; the same rounded, edged, shadowed box for every job; gloss drawn several ways. It is dark only: there is no light mode and none may be added. PS Vita in character: rounded glass, glossy controls, fluid motion; skeuomorphic where it helps and minimal elsewhere; never cartoony. Pixel art is welcome as a small warm accent only: no pixel typefaces, pixel frames, pixel moon or pixel stars.

## 2. Values

Every name in this section is written once, in `public/assets/tokens.css`, which every page loads first. Stylesheets and scripts read the names; a raw number anywhere else is a mistake that `tests/run.sh drift` counts. To add a value: add it here (show the user), then to `tokens.css` with exactly this name, then use it.

### Colour

| Name | Value | Use |
| --- | --- | --- |
| `--sky-top` `--sky-deep` `--sky-mid` `--sky-low` | Vita: `#020721` `#041038` `#0a1f6c` `#1a56d0` | The sky's four steps, dark to bright. Nebula, Aurora and Dusk have their own four (in `galaxy.css`); session 7 tunes them so each step is as light as Vita's. |
| `--ink` | `#f2f5fc` | Titles and the owner's own words. |
| `--ink-2` | `#cbd3e8` | Body, labels on controls, captions. |
| `--ink-3` | `#a4b0cd` | Facts (dates, counts, sizes), hints, placeholders, small labels. |
| `--ink-4` | `#7f8cab` | Marks only: dots, grips, empty tick rings, switched-off things. **Never words.** |
| `--sky-shadow` | `0 1px 2px rgba(0,0,18,.8), 0 0 10px rgba(0,0,18,.5)` | Text shadow on every word that sits straight on the sky (not on glass). No grey can stay readable on the brightest sky without it. |
| `--blue` | `#3f7cf0` | Mutt blue, for fills: main button, switch on, chosen segment, progress. |
| `--blue-ink` | `#8cc0ff` | Blue words, links, `@name`, the keyboard outline, a toast's action. |
| `--good` | `#86d9ad` | Saved, done. |
| `--caution` | `#eec372` | Someone else's, be careful. |
| `--danger` | `#ff8a84` words, `--danger-fill` `#e24a4a` fill | Deleting. Only inside an "are you sure" dialog or a menu's last row. |
| `--line` `--line-2` | `rgba(190,205,240,.12)` `.22` | Hairlines; `--line-2` for the edge of a text box. |
| `--tint` `--tint-2` | `rgba(150,175,240,.07)` `.13` | Washes: pointed-at rows and quiet buttons. |
| `--line-3` | `rgba(190,205,240,.36)` | The edge of a text box or tick box that is pointed at. |
| `--well` `--well-shadow` | `rgba(0,4,24,.38)`; `inset 0 1px 3px rgba(0,0,0,.45), 0 1px 0 rgba(255,255,255,.06)` | The sunken track (section 3). |
| `--edge` `--edge-on` | `rgba(255,255,255,.2)` `.32` | A plain button's edge, at rest and pointed at. |
| `--shade` `--shade-danger` | `#00001e` `#1e0000` | Mixed 38% into a filled button's colour to make its edge. |
| `--scrim` | `rgba(2,6,24,.5)` | Behind a dialog. |
| `--edge-faint` | `rgba(255,255,255,.1)` | What a planet's own plain button mixes a third of its paled colour into, for its edge. |
| `--white` | `#fff` | Words and the tick on a filled control; the light in an uploading toast. |
| `--void` `--void-ring` | `#000`; `rgba(200,215,255,.7)` | The small void that leads a toast. |
| `--focus` | `var(--blue-ink)`; inside a planet's own things the planet's paled colour | The edge of a text box being typed in. |
| `--mutt-line` `--mutt-line-2` `--mutt-tint` `--mutt-tint-2` `--mutt-edge` | the values of `--line`, `--line-2`, `--tint`, `--tint-2`, `--edge` | Those five as Mutt has them. A planet's page re-tints the five; bar glass sets them back from these, so nothing on it can take a planet's colour. Never used directly anywhere else. |
| shadow colour | `rgb(0,0,18)` | The only shadow colour. |
| `--pc` | the planet's colour | Set by the router on a planet's page. Elsewhere `#6c9cff`. |
| `--pa` | the planet's deep colour | From `planetTone` in `planets.js`: same hue, dark enough for white words. Fills the planet's own main button. |
| `--accent` | `var(--blue)`; inside a planet's own things `var(--pa)` | What a pressed thing is filled with. Never set it on a whole page (today a planet's page still does; session 4). |

Signals mean something or they aren't used. No other colour may be typed anywhere; a picture's own colours are the exception.

### Type

Families: `--sans` Red Hat Text (400, 500, 700 only), `--mono` Red Hat Mono (400, 500), `--serif` `"Newsreader", "Iowan Old Style", Georgia, serif` (paper only, documents and the book reader alike).

| Role | Name | Size / line | Weight | Use |
| --- | --- | --- | --- | --- |
| Display | `--type-display` | 34 / 38, `-0.02em` | 700 | Sign-in, a welcome, an empty galaxy. |
| Page | `--type-page` | 26 / 32, `-0.01em` | 700 | A planet's name. |
| Title | `--type-title` | 20 / 26 | 700 | A panel's or offer's title, a sheet's name. |
| Lead | `--type-lead` | 16 / 24 (22 in a file box) | 500 (700 as a dialog's title) | A link's title, a dialog's title. |
| Body | `--type-body` | 14 / 22 | 400 | Notes, descriptions, running words. |
| Label | `--type-label` | 13 / 16 | 500 | Buttons, menu rows, tabs, a section heading's name. |
| Caption | `--type-caption` | 12 / 16 | 400 | Names under file boxes, hints, small help. |
| Fact | `--type-fact` | 11 / 16, mono | 400 | Anything you could count or date: `12 files · 3 Nov · 4.2 MB`. |
| Small label | `--type-small` | 10.5 / 1, mono, `0.14em`, capitals | 500, `--ink-3` | The label above a control or group (`WHO CAN SEE IT`), and `ADD` / `UNIVERSE` on the galaxy (`0.18em`, `--ink-2`). |

Set a line of text with the whole role: `font: var(--type-label)`. It carries weight, size, line height and family; letter-spacing and capitals are added beside it where the table gives them. When only the size is wanted (inside a `calc`, or beside the owner's text-size setting), each role's size is also `--text-display`, `--text-page`, `--text-title`, `--text-lead`, `--text-body`, `--text-label`, `--text-caption`, `--text-fact`, `--text-small`. The old stylesheets use the sizes; new work uses the roles.

The user kept the spaced capitals for small labels on purpose; don't turn them into plain words. They are for labels only: never a sentence, a button or a heading. The owner's text-size setting (S 0.93, M 1, L 1.1) multiplies the sizes of their own words; keep it.

### Space, heights, corners

- **Space** (`--space-2` … `--space-48`): 2, 4, 8, 12, 16, 24, 32, 48. 4 inside a control, 8 between related things, 16 inside a box, 24 between boxes, 48 between parts of a page.
- **Control heights** (`--h-small` 24, `--h-regular` 32, `--h-large` 40): small on tiles and in rows; regular everywhere; large for the one main action. On touch screens regular controls become 40 high; a small control keeps its 24 look and gets an unseen 40-high area to tap (decided in session 3: a 40-high button on a file box is a third of the box). The top bar is 36 (`--bar`; 44 on a phone). Inside a well that holds choices (segmented bar, stepper) the padding is `--inset` 3 and a choice or round button is `--h-inner` 26. The ring round a text box being typed in, and round a place files can be dropped, is `--ring` 3 wide.
- **Corners** (`--r-mark` 4, `--r-row` 8, `--r-box` 12, `--r-panel` 20, `--r-full` 999px): 4 tick boxes, tags, paper; 8 rows and text boxes; 12 file boxes and menus; 20 sheets, dialogs, a planet's header; full for buttons, switches, segmented bars, toasts. A thing inside a rounded thing has the outer corner minus the padding (menu 12, padding 4, rows 8).

### Depth

Four shadows, named by height:

| Name | Value | Use |
| --- | --- | --- |
| `--shadow-rest` | `0 12px 28px -20px rgba(0,0,18,.7)` | File boxes at rest. |
| `--shadow-raised` | `0 20px 40px -22px rgba(0,0,18,.8)` | A box pointed at or dragged; paper. |
| `--shadow-float` | `0 18px 44px -16px rgba(0,0,18,.8)` | Menus, toasts. |
| `--shadow-overlay` | `0 30px 80px -20px rgba(0,0,18,.85)` | Sheets, dialogs. |

Ten layers, lowest first. They were checked against the app in session 2 (the seven first proposed did not fit: a dialog must sit above the editor, a menu above a dialog, a toast above both) and hold the numbers the app already used.

| Name | Value | What sits there |
| --- | --- | --- |
| `--z-sky` | -1 | The sky, behind the page. |
| `--z-page` | 1 | The page (`#app`). The top bar and the drop hint are inside it, so nothing in the page can rise above the layers below. |
| `--z-bar` | 40 | The top bar, within the page. |
| `--z-room` | 50 | A place that covers the page and its bar: the file view. |
| `--z-sheet` | 60 | Sheets (account, search), the phone note, a box while it is being dragged. |
| `--z-dialog` | 80 | The scrim and its dialog. |
| `--z-pop` | 85 | Menus (••• and right-click). |
| `--z-toast` | 95 | Toasts. |
| `--z-fx` | 150 | Sparks and rings drawn over everything. |
| `--z-curtain` | 900 | The light that takes the screen at sign-in. |

- **Inside one part, order its own pieces with 1 to 9.** Those are not layers and stay as plain numbers (a planet's ring in front of its globe, a tab above its card). Never use a number above 9 without a name from this table.
- **A new full-screen place is a room**; a new thing that opens over the page is a sheet, a dialog or a menu. If it fits none of the ten, stop and add a layer here first.
- **Still on numbers of their own** (the app's order is kept exactly; tidying it would be a change, so it waits): the editor 77, cooking 78 and the reader 93 are rooms that sit above sheets, and the reader above menus too, because it draws its own (session 5 brings the three onto one room layer above sheets and checks a dialog opened from the reader still shows); the uploads tray and a zoomed recipe picture 90, the progress line 99, the drop hint 75 inside the page, the corner back arrow 38 (41 on a phone), the dusk veil between scenes 950 (session 8).

### Motion

To be confirmed at real speed in session 8; use these until then.

| Name | Value | Use |
| --- | --- | --- |
| `--dur-quick` | 120 ms | Pressing, pointing. |
| `--dur-change` | 200 ms | Colour, a switch, a tick. |
| `--dur-move` | 320 ms | Menus, rows, the lean. |
| `--dur-arrive` | 500 ms | Boxes, sheets, dialogs arriving. |
| `--dur-scene` | 800 ms | Planet to galaxy, the sky changing. |
| `--ease-settle` | `cubic-bezier(0.16, 1, 0.3, 1)` | Things arriving. |
| `--ease-glide` | `cubic-bezier(0.4, 0, 0.2, 1)` | Things moving from one place to another. |
| `--ease-spring` | `cubic-bezier(0.34, 1.3, 0.64, 1)` | Things you press. |

Scripts use the same numbers, read from one place, never their own: `util.js` reads them from `tokens.css` and gives them out as `DUR.quick`, `DUR.change`, `DUR.move`, `DUR.arrive`, `DUR.scene` (milliseconds) and `EASE` (settle), `EASE_GLIDE`, `EASE_SPRING`. An `.animate()` call takes its `duration` and `easing` from those.

## 3. Materials

Pick by what the thing is, not by how it should look.

| Material | For | Never for |
| --- | --- | --- |
| **Sky** | The page. | Anything that isn't the page. |
| **Box glass** | The owner's things and anything a feature shows them on a planet: file boxes, the add box, lists, offers, a planet's header, a mode's panels. | Menus, sheets, the top bar. |
| **Bar glass** | Mutt's own: the top bar, menus, sheets, dialogs, toasts, tips. | The owner's files. |
| **Gloss** | Things you press: main and plain buttons, a switch that is on, the chosen segment. | Anything you don't press. |
| **Well** | Sunken tracks you type in or slide along: text boxes, the switch's track, the segmented bar's channel. | Decoration. |
| **Paper** | Writing: documents, book pages, the small pages on planets. | Panels and controls. |
| **Print** | The void, and the sky's dust. | Anything else. |

Glass on glass can't frost and goes muddy: never put box glass inside a sheet or menu. Inside bar glass, rows are washes (`--tint`), not boxes.

### Box glass

Use the `.fglass` class (don't write a fill). Its recipe:

- Fill: `rgba(190,202,240,.09)`, flat. Never a gradient. Pointed at or typed in: `rgba(200,210,245,.13)`.
- Frost: `blur(28px) saturate(1.15) brightness(0.9)`. It softens the sky and deepens it a touch, so words hold anywhere on the page.
- Edge: 1px. With `tone = color-mix(in oklab, var(--pc), #e4e8f2 34%)`, at rest `color-mix(in srgb, tone 22%, rgba(225,232,255,.18))`; pointed at `color-mix(in srgb, tone 56%, rgba(225,232,255,.24))`.
- Light: `inset 0 1px 0 rgba(255,255,255,.14)` on the top edge (`.18` pointed at).
- Glow: **none at rest.** Pointed at or typed in: `0 0 30px -4px color-mix(in srgb, tone 30%, transparent)`.
- Shadow: `--shadow-rest`; `--shadow-raised` pointed at.
- Changes take `--dur-move` (edge, fill) and `--dur-arrive` (glow, shadow) on `--ease-settle`.
- The colours are worked out on the box itself, so it takes `--pc` from the page it sits on.
- Fades and blurs on entrance go on the box's parts, never on a parent of the glass: either one on a parent stops the frost.

### Bar glass

- Fill `--glass-fill`: `rgba(13,19,48,.74)`, flat. Frost `--glass-frost`: `blur(28px) saturate(1.4) brightness(0.6)`. Edge `--glass-edge`: 1px `rgba(205,218,255,.16)`. Light `--glass-light`: `inset 0 1px 0 rgba(255,255,255,.1)`.
- The frost dims what is behind it (decided in session 3). Without that, a menu over a white page or a bright picture turns grey.
- Shadow: `--shadow-float` for menus, toasts, tips and tooltips, `--shadow-overlay` for sheets and dialogs.
- The top bar is the same glass with fill `--bar-fill` `rgba(6,10,30,.58)`, no edge but a 1px `--line` along the bottom, no shadow.
- Bar glass never takes a planet's colour. The planet's colour is set on the planet's own page content (`#view`), never on `body`, so anything that opens over the page (menus, sheets, dialogs, toasts, the top bar) is outside it.
- In the stylesheet it is the one rule headed "bar glass" in the shared parts section; a new thing on bar glass is added to that rule's list.
- Don't put `position` in the bar glass rule: `.pop` must stay `position: fixed`, and each part places itself.

### Gloss

One light, from above, laid over whatever colour the control is. A pressed thing's background is `var(--gloss-on), var(--accent)`; never a two-colour gradient.

- `--gloss-on` (on a colour): `linear-gradient(180deg, rgba(255,255,255,.30) 0%, rgba(255,255,255,.11) 46%, rgba(255,255,255,0) 54%, rgba(255,255,255,.05) 100%)`.
- `--gloss-clear` (on a see-through control): the same shape at `.13`, `.05`, `0`, `.025`, over a fill of `--clear-fill` `rgba(255,255,255,.05)`.
- Light on the top edge of every glossy thing, `--gloss-light`: `inset 0 1px 0 rgba(255,255,255,.32)`. Under a glossy button, `--gloss-drop`: `0 1px 3px rgba(0,0,18,.25)`. Under the chosen bead, `--bead-drop`: `0 1px 4px rgba(0,10,60,.4)`.
- Pressed, the top light is replaced by `--press`: `inset 0 1px 3px rgba(0,0,18,.4)`.
- White words on gloss carry `--on-gloss`: `0 1px 1px rgba(0,0,30,.35)`.
- The switch's knob is a pearl, `--pearl`: `radial-gradient(circle at 40% 30%, #fff 0%, #eef2fa 50%, #c3cde2 100%)` with `--pearl-drop` `0 1px 3px rgba(0,0,30,.45)`.

### Well

`background: var(--well); box-shadow: var(--well-shadow)`. Corners 8 for a text box, full for a track.

### Paper

One cream, flat: `--paper` `#f8f5ee`, edge `--paper-edge` `#e9e4d8`, words `--paper-ink` `#1d1b18`, `--paper-ink-2` `#5c5852`, `--paper-ink-3` `#8f897f`. Corners 4, so it never reads as glass. Shadow `0 0 0 1px rgba(0,0,18,.2), var(--shadow-raised)`. Type on paper is `--serif`: titles 600, text 400, at the reader's or document's own size (17/26 on the board).

### Print: the void

The best-realised piece in Mutt, and the bar for everything else. Don't restyle it. What it is: a stippled black-and-white print: a bright white light caged by dark, sinewy strands that web together where they cross, turning in 3D; stippled cells, bright at their rims and dim in the middle; faint rays; only a faint mauve tint. Bright places are dotted more densely, like a print. Sized in proportion to the planets, sitting straight on the sky with no dark halo. No crosshair lines, no orange, no pixel sparks, no realistic or painted light. Add boxes that open from it are flat and plain like Are.na's: spacious, no glass, gloss or glow, not paper.

Sign-in: only the dark sky and the void, no box and no horizon. The void is huge and looming (it fills the screen; on a phone its cage runs off the sides). Every word (logo, name, code) sits in dark ink on its clean white light: never put text over the speckled cage. Dust spirals in and stars streak toward it along the same swirl; it reacts to every key, ripples on a wrong code, and on the right code everything rushes in and the light takes the screen. Ominous, an experience. One step to start: type a name (a known name asks for its code, a new one picks a code); never an "are you new?" question. Always night.

### The sky

Decided look; built in session 7 (until then the app keeps its old sky). The full recipe is the small painter in `design/sky-board.html`; copy its look, not its cost. In words and numbers:

- **Ground.** A vertical fade: `--sky-top` at the top, `--sky-deep` at 34%, half `--sky-mid` half `--sky-deep` at 78%, a little brighter at the foot. The bright floor is `--sky-low` at about half its old strength (46%), glowing from the bottom-left corner. It stays blue; it no longer washes out words.
- **Print dust.** Light made of fine dots (0.4 to 1px, pale blue-white, 22 to 80% strong), in two dot screens of different size and angle so thick dust never looks like a grid. The dust gathers in **one river** that crosses the sky from low left to high right, with dark winding lanes through it like the void's cage, and thins to almost nothing elsewhere. Each dot fades in and out as the dust drifts past it.
- **Stars: many, mixed.** Most are small soft points that gather where the dust is. Only a handful flare, and no two match: each has its own size, tilt (about a third are turned to an ×) and arm lengths, a soft halo, and red and blue pulled apart a little like an old lens. Colours: about a third white, the rest amber, blue, pink and mint. They twinkle by a seventh, over 5 to 30 seconds.
- **Liquid light: a hint.** The sky is treated as the surface of a dark liquid lit from above. A pale grainy sheen sits on the folds that face the light, and colour appears only as a thin line (2 to 14px) where each highlight ends, in the order red, amber, pale core, green, blue, violet, breaking up along its length. One or two of these on screen at a time, never bands or floods of rainbow.
- **Old film.** Grain over everything, a slightly warm and faded tone, blacks lifted a touch.
- **Movement: slow.** One slow liquid field drives the river, the lanes and the light together, so the parts move as one. A fold travels a few pixels a second. Evolving, never distracting.
- **The universe.** Black, no stars. Every galaxy sits in its own small knot of dots. **Threads** join neighbouring galaxies: a hairline with dots gathered on it and small beads of light travelling slowly along it.
- **Four skies, tuned alike.** Vita, Nebula, Aurora, Dusk stay. A sky is only its four colours; every other part of the recipe is shared.
- When it is built: it must cost almost nothing (the slow field at low resolution, stars as a still layer, drawn a few times a second, stopped when the tab is hidden). Motion: Still and the system's reduced-motion setting show one still frame. Without the graphics it needs, show a still picture of the same sky.

### The logo

One logo, the Wonky: Fraunces italic 500, `"SOFT" 100, "WONK" 1, "opsz" 144`, `-0.02em`. The other four styles and their row in Settings go (session 7, with when the letter-flicker plays and what it costs to load).

## 4. Parts

Build from these. Sizes are in pixels. "Pointed at" means hover on a computer; on touch screens the pressed state shows instead. Every part shows the keyboard outline: `2px solid var(--blue-ink)`, offset 2. Never `outline: none` without a replacement.

### Button

Four kinds, three sizes, one shape (corners full, 1px edge, label in `--sans` 500).

| Size | Height | Side padding | Text | Gap to an icon |
| --- | --- | --- | --- | --- |
| Small | 24 | 10 | 12 | 4 |
| Regular | 32 | 16 | 13 | 8 |
| Large | 40 | 20 | 14 | 8 |

| Kind | Looks like | Use |
| --- | --- | --- |
| **Main** | `--gloss-on` over `--accent`; edge `--accent` mixed 38% toward `#00001e`; white words with `0 1px 1px rgba(0,0,30,.35)`. | One per view: the thing you most likely want. |
| **Plain** | `--gloss-clear` over `rgba(255,255,255,.05)`; edge `rgba(255,255,255,.2)`; words `--ink`. On a planet's own things the edge takes a third of the planet's paled colour. | Everything else. |
| **Quiet** | No fill, no edge; words `--ink-2`. | Turning something down ("Not now", "Keep it"). |
| **Danger** | As main, over `--danger-fill`. | Only the confirming button of an "are you sure" dialog. |

States, the same for every kind: pointed at, 10% brighter (plain: edge to `.32`; quiet: `--tint-2` behind, words `--ink`); pressed, down 1px, 98% size, 6% darker, the top light replaced by `inset 0 1px 3px rgba(0,0,18,.4)` (quiet: `--well` behind); keyboard, the outline; switched off, 42% see-through, 60% colour, can't be pressed; busy, the label becomes three words ending in "…" and it can't be pressed. Pressing moves on `--ease-spring` over `--dur-change`.

A round icon button is a regular plain or quiet button 32 wide with no padding (24 when small). A quiet button that stays on (Bold in a toolbar, an open panel's button) shows `--tint-2` behind and words in `--ink`. The top bar's buttons are small quiet round ones with the bar's whole height to tap.

Underlined words are not buttons: "Upload", "Retry", "Take off", "Delete", "Delete account" are small quiet buttons. A word that deletes is grey like any quiet button; red waits for the "are you sure" dialog and a menu's last row (decided in session 3).

### Text box

- **Boxed**: a well, 32 high (40 on touch), corners 8, 12 side padding, 1px `--line-2` edge, 13px words in `--ink`, placeholder `--ink-3`. Pointed at: edge `rgba(190,205,240,.36)`. Typing: edge `--blue-ink` at 80% and a 3px ring of `--blue` at 32% (inside a planet's own things, the planet's colour).
- **Search**: the same, 40 high, corners full, 16 side padding, 14px words.
- **Bare**: for a planet's or file's own name and note. No box; 2/8 padding, corners 8. Pointed at: `--tint` behind. Typing: a well.

### Switch, segmented bar, tick box, chip, stepper, tabs

- **Switch**: track 40 × 24, a well. Knob 20, the pearl, 2 from the edge, travels 16 on `--ease-spring` over `--dur-move`. On: `--gloss-on` over `--accent`, the top light, and `inset 0 0 0 1px rgba(0,0,30,.25)`. Its label is 13px `--ink-2`, 8 to the right.
- **Segmented bar**: a well with corners full and 3 padding, 32 high in all. Each choice is 26 high, 12 side padding, 13px 500, `--ink-3` (`--ink` pointed at). The chosen one: `--gloss-on` over `--accent`, white words, the top light, `--bead-drop`. It picks one value of a setting; at most four short choices.
- **Tick box**: for "include this when I confirm" (a switch means "this happens now"). A 16 square, corners 4, a well with a 1px `--line-2` edge (`--line-3` pointed at). Ticked: `--gloss-on` over `--accent`, the top light, and a white tick drawn with a 1.8 line that springs in over `--dur-change`. Its label is 13px `--ink-2`, 8 to the right. Never the browser's own tick box.
- **Chip**: one for people in Share and filters in search. A small plain button's look (24 high, 12px 500, padding 0 4 0 10) holding a name, an 8px dot of colour when it stands for a person or planet, and a 16 round × that takes it away (`--tint-2` behind when pointed at).
- **Stepper**: a well with corners full and 3 padding, 32 high, like the segmented bar. A quiet round button 26 at each end (minus and plus, `--ink-2`; pointed at `--tint-2` and `--ink`; pressed 92% size) and the value between them, at least 36 wide, 13px 500 `--ink`, digits of equal width. A button at its limit is switched off.
- **Tabs**: for switching what a panel shows (a segmented bar picks a setting). A row of words 32 high, 16 apart, 13px 500, `--ink-3` (`--ink` pointed at and chosen), over a 1px `--line`. A 2px line of `--blue-ink` with a soft glow of itself sits on that hairline under the chosen word and slides to the next over `--dur-move` on `--ease-glide`. Any number of tabs; the row scrolls sideways when it must.

### Menu

One menu for the ••• button, right-click, the editor and the reader. Bar glass, corners 12, padding 4, at least 220 wide, `--shadow-float`. Rows 32 high, corners 8, 8 side padding, 8 gap, 13px `--ink`; icon 16 in `--ink-3`; a fact on the right in mono 11 `--ink-3`. Pointed at: `--tint-2`. A dangerous row is `--danger` (words and icon), washed 15% `--danger` when pointed at, and is last, below a divider (1px `--line`, margin 4/8). A group's heading is a small label with 8/8/4 padding. A row's keyboard outline is drawn 2 inside the row so the menu's edge doesn't cut it. On touch screens rows are 40 high with 14px words.

**Small panel**: a menu that holds controls instead of rows (Share, a list's settings, the editor's Aa). The same glass and shadow, corners 20, padding 16, 12 between its parts. It opens and closes like a menu.

### Sheet, dialog, toast

- **Sheet** (account, search): bar glass, corners 20, padding 20, 16 between groups, `--shadow-overlay`, `min(440px, 100vw - 20px)` wide. Name in Title; under it a Fact line. A settings row is a 96-wide label (13px `--ink-2`) and its control, at least 32 high. A foot row of buttons sits above a 1px `--line` with 16 above them.
- **Dialog**: bar glass, corners 20, padding 20, 340 wide (560 when it must be), `--shadow-overlay`, over `--scrim`, which also blurs the page behind by 10px. Title in Lead 700, words in Body `--ink-2`, buttons right-aligned 8 apart with 12 above. The quiet or plain button comes first, the main or danger one last.
- **Toast**: bar glass, corners 20 (full at one line), at least 40 high, padding 8 16 8 14, 12 gap, 13px/16. A long message wraps to a second line and the toast grows; it is never cut short. A black 8px dot with a pale ring leads it (the void, small). Its one action is `--blue-ink` 500, not underlined: `Sent to Recipes · Move`.
- **Uploads** are a toast, not a tray: `Uploading 3 of 7`, then `Added 7 files`, or `2 uploads failed · Retry` with a red ring. Its void is 16 and fills with white light from the middle as the files go in (black at none, bright with a soft glow at all); when the last file lands the same toast says what was added. Under Motion: Still the light steps without easing.
- **Tip** (the sharing tip, the phone note): Mutt speaking once. Bar glass, corners 20, padding 16, 300 wide at most, `--shadow-float`: a line in Label `--ink`, one or two sentences in 13/18 `--ink-2`, then small buttons (main first when there is something to do, quiet "Got it").
- **Tooltip**: what an icon button or a cut-off name is called. Bar glass, corners 8, 24 high, padding 0 8, Caption in `--ink`; a key beside it as a Fact in `--ink-3`, 8 apart. It appears 8 below the thing (above when there is no room), centred and kept inside the window, half a second after pointing (at once when moving from one to the next) and on keyboard focus; it fades over `--dur-quick`. Never on touch screens. The browser's own labels are not used: anything with a `title` gets this instead.
- **Drop hint**: while files are dragged over the window nothing frames the page. The thing that will take them lights up: on a planet the add box (edge `--blue-ink`, a ring of `--accent` at 32% and a soft glow), on the galaxy a ring opens round the void, just outside its cage (1.5px `--blue-ink` with the same ring and glow; the void itself is not redrawn). One label sits where toasts sit, shaped like a main button: `Drop to add to Postcards`, `Drop into the void`, and over a planet on the galaxy `Drop onto Postcards`. Where nothing can take files the label is clear glass and says why. A page says what takes files through its view's `dropTarget()`: `label`, `el` (the thing to light), `lit(on)` and what `over(e)` returns (main.js).

### File box

One frame for every kind of file: a square box with corners 12, and under it, 12 below, a one-line caption (Caption, `--ink-2`, centred, `--sky-shadow`, cut with "…"; `--ink` when the box is pointed at).

- **Note**: box glass, padding 16, the words in Body `--ink`, fading out over the last 40px through a mask (never a painted fade: it shows as a dark band on glass).
- **Picture**: no glass, the picture itself with corners 12, a 1px edge of `rgba(225,232,255,.18)` and `--shadow-rest`. Pointed at: 1.5% larger, edge `rgba(225,232,255,.4)`, `--shadow-raised`.
- **Link**: box glass, padding 16, set to the bottom: a site line at the top (a 16px site icon with corners 4, then the address as a Fact), the title in Lead (16/22, three lines), a two-line description in Caption `--ink-2`.
- **Book, paper page, recipe card, list row, other files**: the same frame with their own face. Not drawn yet; session 4 draws them on the sample page before building.
- **At rest** a box floats: 2.5px up and down, 8 to 12 seconds, each on its own beat. Nothing else.
- **Pointed at or typed in**: the edge, glow and fill of box glass, plus a lean toward the pointer (up to 3° and 2.4°) over `--dur-arrive` on `--ease-settle`.
- **The add box** is a box-glass square with 16 padding: the placeholder "Type, paste or drop" (`--ink-3`), "Upload" as a small quiet button at the foot, and a small main button "Add" in the planet's colour once there are words.

### Planet header, section heading, small text

- **Planet header**: box glass, corners 20, padding 16/20, with a wash of the planet's colour from the globe's side (`radial-gradient(70% 160% at 0% 50%, color-mix(in srgb, var(--pc) 14%, transparent), transparent 60%)`). The globe, then the name in Page (a bare text box), the note (bare, Body), and a Fact line. Its buttons are plain.
- **Section heading**: one for every mode. The name in Label `--ink-2` and a Fact beside it (`Files 12`, `Documents 4 · 518 words`), 8 apart on one baseline, straight on the sky with `--sky-shadow`.
- **Small text**: one Caption and one Fact. Anything you could count or date is a Fact (mono); everything else small is a Caption.

### Offer, tip, and parts not drawn yet

An offer (a mode's "This planet looks like …") is box glass: Title, one or two sentences of Body, a main button in the planet's colour whose words match the menu's, and a quiet "Not now". It is the one box in `offers.js`; a mode only supplies words and a 40px drawing. ### The parts as built, and the sample page

Every part above is one set of classes in the section of `galaxy.css` headed **SHARED PARTS**, written only with names from `tokens.css`. A feature's own styles hold layout and these class names; they never restyle a part.

| Part | Classes | Built by |
| --- | --- | --- |
| Button | `.btn` (plain) with `.btn-main`, `.btn-quiet` or `.btn-danger`; `.btn-small` or `.btn-large`; `.btn-round`. Busy: `.is-busy`. Held on: `.is-on`, or `aria-pressed` / `aria-expanded` | markup |
| Text box | `.field`; `.field.field-search` (a label that holds chips and a bare input); `.field-bare` | markup |
| Switch | `label.switch` > `input` + `.switch-track` > `.switch-knob`, then its words | markup |
| Segmented bar | `.seg` > `.seg-ind` + `.seg-btn` | `segmented()` in `ui.js` |
| Tabs | `.tabs` > `.tabs-ind` + `.tab` | `segmented(…, { tabs: true })` |
| Tick box | `label.tick` > `input` + `.tick-box`, then its words; or `.tick-box` alone in a row that is `.is-on` | markup |
| Chip | `.chip` > `.chip-dot`, words, `.chip-x` | markup |
| Stepper | `.stepper` > `.stepper-btn` + `.stepper-value` + `.stepper-btn` | `stepper()` in `ui.js` |
| Menu | `.pop` > `.menu` > `.menu-item` (`.is-danger`), `.menu-sep`, `.menu-head`, `.menu-hint` | `openMenu()`, `openContextMenu()` |
| Small panel | `.pop.pop-panel` | `openPopover(…, { className: 'pop-panel …' })` |
| Sheet | `.sheet` > `.sheet-head` (`.sheet-who`, `.sheet-sub`), `.set-row` (`.set-label`), `.sheet-actions` | `sheet()` in `statusbar.js` |
| Dialog | `.scrim` > `.dialog` (`.dialog-wide`) > `.dialog-title`, `.dialog-text`, `.dialog-msg`, `.dialog-actions` | `openDialog()`, `confirmDialog()` |
| Toast | `.toasts` > `.toast`; uploads `.toast.is-upload` > `.toast-void` | `toast()`; `uploads.js` |
| Tip | `.tip` > `.tip-title`, `.tip-text`, `.tip-btns` | markup |
| Tooltip | `.tooltip` > `.tooltip-text`, `.tooltip-key` | `tooltip.js`, for anything with a `title` or `data-tip` |
| Drop hint | `.drop-word`, `.is-drop` on what takes the files, `.drop-ring` round the void | `main.js` |

Bar glass is the one rule at the top of that section; a new thing on bar glass joins its list. That rule also sets `--accent` and the five `--mutt-*` values back, which is what keeps Mutt's own things blue on a planet's page.

**The sample page** is `/parts` in the app: every part in every state, at any width. It is linked from nowhere and its code (`js/views/parts.js`) and layout (`parts.css`) are fetched only when that address is opened. Its "pointed at", "pressed" and "keyboard" samples are not drawn by hand: when the page opens it copies every rule that has one of those states from the live stylesheets, so a sample can't drift from the app.

**To add a part:** (1) draw it on `/parts` as one more `section(...)` in `js/views/parts.js`, with each state (`held(el, 'hover' | 'active' | 'focus')`, `off(el)`); (2) show the user, with options where there is a real choice; (3) add it to this section with its sizes and states, and to the table above; (4) add its rules to the SHARED PARTS section of `galaxy.css`, using only names from `tokens.css` (a value that has no name gets one here and there first); (5) use it. `tests/run.sh browser sample_page` opens the page at both widths.

### Icons

Session 6 replaces the four sets with one: one 16 grid, one 1.5 line, round ends and joins, in one file, every icon approved by the user as a sheet first. Keyboard characters (× + ••• ✓ → ↗) are not icons. Until then, new work uses `glyph` in `planets.js` and adds no fifth way of drawing.

## 5. How to style a new feature

Follow these in order. For a mode, this is step 6 of "How to add a mode" in `CLAUDE.md`.

1. **Read this file and open `design/look-board.html`.** Find the nearest thing already drawn.
2. **Say what each piece is**, then take its material from the table in section 3. The owner's things and what a feature shows them on a planet: box glass (`.fglass`). Mutt speaking (menus, sheets, dialogs, toasts): bar glass. Writing: paper. A thing you press: gloss. A thing you type in or slide: a well. If nothing fits, the piece is probably one too many.
3. **Build it from the parts in section 4.** A feature's file contains layout and the parts' class names. It does not contain a button, a menu or a box of its own. If a part is missing, stop: draw it on `/parts`, show the user, add it to this file and to the shared parts, then use it (section 4, "To add a part").
4. **Set the words.** Each line of text takes one role from the type table and the grey that goes with its job. Words straight on the sky get `--sky-shadow`. A serif only on paper.
5. **Space it** with the eight spaces, the three heights and the five corners. A corner inside a corner is the outer one minus the padding.
6. **Colour it** only with named colours. On a planet's page, box-glass things take `--pc` and their main button takes `--pa`; nothing on bar glass does. Signals only where they mean it.
7. **Frame less.** A caption, a heading or a row doesn't get a box. Only a thing someone would pick up (a file, a card, a panel) is boxed. When in doubt, set it straight on the sky.
8. **Make it arrive.** Opening: the box slides up 16px while its parts fade in and come into focus (`--dur-arrive`, `--ease-settle`, parts 30 ms apart, at most 14 of them). Closing: the same in reverse, about half as long. Pointing and pressing: `--dur-quick` and `--dur-change`. Put fades and blurs on the box's parts, never on a parent of glass. Fill entrances `backwards`, never `both`.
9. **Keep it calm at rest.** A new feature adds nothing that moves while idle. Only the sky, planets turning and the slow float of file boxes may. No endless animation without the user's yes.
10. **Make it work without a pointer.** Every control is reachable by keyboard and shows the outline. On touch screens controls are 40 high, and nothing appears only on hover.
11. **Make it work under Motion: Still.** Every animation ends on its last frame, in no time. Never pause an animation to stop it (a paused entrance stays invisible).
12. **Keep it light.** Its styles go in its own stylesheet, fetched together with its code, and waited for: `Promise.all([import('./name.js'), styles('name.css')])` (`styles` is in `util.js`; copy the `documents` entry in `modes.js`). Only what must show before its code arrives (an offer's drawing) goes in `galaxy.css`. A plain planet loads none of it.
13. **Look at it** in the hidden browser at 1280 and 375 wide (`tests/run.sh browser`, pictures in `tests/shots/latest`), before and after. Give the user a short list of what to watch at real speed.
14. **Write it down**: anything new or changed goes into this file in the same session.

Checklist before calling it done:

- [ ] Every piece is one of the five materials, and glass is `.fglass` or bar glass, not a fill of its own.
- [ ] No colour, size, corner, shadow or speed typed by hand; no new text size or weight. `tests/run.sh drift` passes.
- [ ] Only parts from section 4; anything new was added here first.
- [ ] Planet colour only on box-glass things on that planet's page; nothing on bar glass took it.
- [ ] Nothing new glows, leans or moves at rest.
- [ ] Opens and closes on the shared lengths and curves; no fade or blur on a parent of glass.
- [ ] Keyboard outline visible everywhere; nothing hover-only; 40-high controls on touch.
- [ ] No sideways scroll at 375 wide; no console errors; Motion: Still shows everything.
- [ ] A plain planet loads none of its files.
- [ ] `DESIGN.md` updated, and the "where the app stands" table if this changed it.

## 6. What was decided, and what is still open

Decided by the user, 2026-11-11 (the alternatives are on the boards in `design/`):

- A planet's colour is for the planet's own things only; shared controls stay Mutt blue.
- Boxes are calm at rest: the slow float stays; glow and lean only on the box pointed at or typed in.
- Small words: brighter greys, the faintest never for words, and the soft shadow under words on the sky.
- A box at rest carries a faint edge of the planet's colour and no halo.
- Small labels stay as spaced mono capitals (plain words were offered and turned down).
- Glass: the deeper frost; bar glass one flat dark fill.
- Gloss: one light from above on everything pressed (the softened Vita sheen, not satin and not gel).
- Serif on paper: Newsreader, everywhere.
- One logo, the Wonky. Four skies, tuned alike.
- The sky: print dust in a river over a deeper floor, many mixed stars with a few fringed flares, a hint of liquid light, old film grain, slow movement; threads in the universe. The user found the first print sky "boring and repetitive and static" and the first stars "a bit too much", and wants it "evolving but not too distracting": keep it that side of the line.
- All four graphics areas matter: planets and the files on them, one icon set, the sky, the logo and its loading.
- Foundations before visible changes; show before building; nothing may end up less smooth or more broken than it was found.

Decided by the user, 2026-11-12 (design session 3; the page with the alternatives is `/Users/edan/Mutt-notes/design/shared-parts-2026-11-12.html`):

- Stepper: a sunken track (not two glossy buttons, not a rolling bead).
- Tabs: words with a sliding light (the segmented bar as tabs was my pick and was turned down).
- Tooltip: a small glass label, replacing the browser's own.
- Uploads: a toast whose small void fills with light (bolder than a ring, chosen over my pick).
- Drop hint: the place that takes the files lights up; no frame round the page.
- Tick box: a square tick box, not a switch.
- Small buttons keep their look on touch screens and get a larger area to tap.
- A long toast grows to two lines.
- The small panel has a sheet's corners.
- Words that delete are quiet and grey outside a dialog.
- Bar glass dims what is behind it.

Still open, with the session that settles it: the seven faces of a file box and the planet header's final shape (4); the three rooms on their own layer numbers (5); the icon sheet (6); sharper planets, files wrapped onto worlds, loose files round the void, when the logo flicker plays, the three other skies' colours (7); every length and curve at real speed (8).

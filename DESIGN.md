# DESIGN.md

The one standard for how Mutt looks and moves. Read it before touching anything a person can see.

- **A value, part or rule that isn't in this file doesn't exist.** Don't invent one inside a feature. If a feature needs something new, add it here first (show the user), then build it.
- **Every session that settles something visible updates this file before it ends**, so the file is never behind the app.
- It is written as instructions. Where it says "is", build it that way.
- Decided with the user on 2026-11-11 (design session 1 of 8); sessions 3, 4, 5, 6, 7 and 8 added what they settled (section 6). The drawn references are in `design/`: `look-board.html` (every value, material and part, drawn) and `sky-board.html` (the live sky). Open them in a browser when a number here isn't enough.

## Where the app stands against this file

The eight design sessions of the plan in `/Users/edan/Mutt-notes/PROGRESS.md` brought the app into line with this file, in this order. Keep the table true: a session that changes an area updates its row.

| Area | In the app today | Lands in |
| --- | --- | --- |
| Named values (section 2) | **Done (session 2).** Every name below is in `public/assets/tokens.css`, the one place raw values are written. `mutt.css` is gone (folded into `galaxy.css`). `tests/run.sh drift` fails if a hand-typed value is added. | Session 2 ✓ |
| Shared parts (section 4) | **Done (session 3).** One button, text box, switch, segmented bar, tabs, tick box, chip, stepper, menu, small panel, sheet, dialog, toast, tip, tooltip and drop hint, in one marked section of `galaxy.css`, each drawn in every state at `/parts`. What the modes still draw themselves is listed under "What session 3 left for later". | Session 3 ✓ |
| Planet page, file boxes, planet colour rule | **Done (session 4).** One frame for every kind of file (`cells.js`, the section of `galaxy.css` headed THE FILE BOX), the header on the sky, one section heading for every mode, the readable greys, box glass to its recipe, nothing glowing at rest and only the pointed-at box leaning. What the modes still draw themselves is under "What sessions 2 to 4 left for later". | Session 4 ✓ |
| Modes on the shared look | **Done (session 5).** List, cookbook, documents, reading and the file view are built from the named values and the shared parts (section 4, "The modes"); their four private palettes are gone; paper is the one cream; the full-screen places are rooms on one layer. | Session 5 ✓ |
| Icons | **Done (session 6).** One set of 94 in `public/assets/js/icons.js`, drawn the same way everywhere and got with `icon(name)`; no keyboard character stands in for an icon; menus of things to do carry icons; the five offer drawings are panes from the same file. Section 4, "Icons". | Session 6 ✓ |
| The sky, the universe, the logo | **Done (session 7, part one).** The sky of section 3, built to its cost rules in `js/sky.js`; the universe is black with no stars, and beads of light travel the threads of its web; one logo, the Wonky. | Session 7 ✓ |
| Planets, the files on them, how they show their use, their motion | **Done (session 7, part two).** Twelve kinds (fourteen since 2026-11-16) each with its own weather and effect, files as cards in a belt each drawn as what it is, use shown as weather or dust, rings on any planet with ten files, the dive on opening a planet. Section 3, "Planets". | Session 7 ✓ |
| Motion, speed, the keyboard and phone sizes | **Done (session 8).** Six lengths, four curves, one step and three beats, all named; no stylesheet or script types a length or a curve (`tests/run.sh drift` counts 0 of each). Every menu opens one way. Section 2 "Motion" has the rules, the list of everything that moves, what Mutt may cost and how to measure it. Not done, and named there: the sign-in hang seen twice, Safari measured on a computer only. Phones were redone on 2026-11-16 in a real iPhone's Safari (the simulator) and Safari's engine at 402, 375 and 320 wide: "The phone scale" and the phone lines under each part. | Session 8 ✓ |

### Values that still hold yesterday's number

Session 2 changed nothing a person can see. So where this file asks for a different value than the app had, the name exists but still holds the old value. Each line in `tokens.css` that does this ends with `WANTS <value> (session N)`. This is the to-do list; when a session switches one, it deletes the `WANTS` note and the row here.

None are left: the sky was the last, switched in session 7.

One name kept from before that is not in this file (`--bg`) sits in a marked block at the foot of `tokens.css`. Don't use it in new work.

### What sessions 2 to 6 left for later, on purpose

- **Values off the scales stay hand-typed** until their part is rebuilt: a few 12.5 and 11.5 text sizes, 14 and 10 corners, 0.3 and 0.25 second motion. They are what `tests/run.sh drift` counts. In the stylesheets, after sessions 2, 3, 4, 5 and 6: colours 501 → 448 → 432 → 189 → 180, text sizes 204 → 176 → 163 → 74 → 73, corners 168 → 141 → 137 → 90 → 82, shadows 97 → 94 → 93 → 64 → 62, speeds 279 → 254 → 243 → 191 → 191. After session 7's first part: colours 177, text sizes 69, corners 80, shadows 62, speeds 187 (the old sky's and the four other logos' rules went). After session 8: speeds 0, in stylesheets and in scripts.
- **`galaxy.css` still opens with "the older base"**: what is left of the old white site's stylesheet (the top bar, page heads, sign-in, the markdown rules, settings). The file view's rules left it in session 5. Nothing new goes in that section.
- **A setting is not a palette.** The editor and the reader keep a few names of their own for what the owner has chosen, set by their scripts: `--de-size`, `--de-lh`, `--de-face` (a document's type size, line height and face) and `--rd-size`, `--rd-lh`, `--rd-font`, `--rd-h`, `--rd-vw` (the reader's, and the size of its page). They hold no colour.
- **A document's own colours are typed where they are used**: the eleven inks a writer can choose and the six rhyme colours of a poem (`doceditor.js`, `docs.css`), and the colours a `::highlight()` paints (find, spelling, rhyme, comments), which can't read a named value in every browser.
- A planet's colour is picked in its type box by pressing the chosen type again, on the small worlds themselves ("Planets", **Type and colour**); there is no swatch for it. The lock drawn on a locked world is the set's lock at whatever size the world asks for (`icon('lock', n)` in `planets.js`), the one place an icon is not 12, 16 or 20.
- Mutt keeps no icon for a link's site, so a link's caption is the site's name alone. Search's planet picker rows (`.cx-row`) are their own.

## 1. Principles

1. **The sky is the page.** Nothing paints its own page background. Everything sits on the one sky.
2. **Five materials, no sixth.** Sky, glass (two kinds), gloss, paper, print. Section 3 says what each is for.
3. **Your files are the brightest thing.** Chrome is dim and thin. Pictures, pages and covers carry the colour.
4. **A planet lends its colour to its own things only.** If it sits on box glass on that planet's page, it may take the planet's colour. If it sits on bar glass, it is Mutt's and stays Mutt blue on every page.
5. **Two typefaces, two jobs.** Red Hat Text for words, Red Hat Mono for small facts and small labels. A serif only on paper, for a desk's own names (see "Documents"), and for a quote's own words in a commonplace book (see "Commonplace book").
6. **Things arrive, they don't appear.** Opening and closing are the same motion in two directions, on the shared lengths and curves.
7. **Simple until needed.** A feature has no button until what you're doing calls for it (see "Direction" in `CLAUDE.md`).
8. **Calm at rest.** At rest a box only floats, slowly. Glow and lean belong to the one box being pointed at or typed in.

What Mutt must not look like (the user's words: "not AI-looking"): glow on everything at once; two-colour gradients on controls; everything moving at rest; the same rounded, edged, shadowed box for every job; gloss drawn several ways. It is dark only: there is no light mode and none may be added. PS Vita in character: rounded glass, glossy controls, fluid motion; skeuomorphic where it helps and minimal elsewhere; never cartoony. Pixel art is welcome as a small warm accent only: no pixel typefaces, pixel frames, pixel moon or pixel stars.

## 2. Values

Every name in this section is written once, in `public/assets/tokens.css`, which every page loads first. Stylesheets and scripts read the names; a raw number anywhere else is a mistake that `tests/run.sh drift` counts. To add a value: add it here (show the user), then to `tokens.css` with exactly this name, then use it.

### Colour

| Name | Value | Use |
| --- | --- | --- |
| `--sky-top` `--sky-deep` `--sky-mid` `--sky-low` | Vita: `#020721` `#041038` `#0a1f6c` `#1a56d0` | The sky's four steps, dark to bright. Nebula `#0b0425` `#16093b` `#2e0d74` `#7732dd`, Aurora `#010a12` `#02161f` `#032c39` `#096b65`, Dusk `#11031c` `#230925` `#471044` `#a43951`: each step exactly as light as Vita's, so words read the same on all four. |
| `--star-white` `--star-amber` `--star-blue` `--star-pink` `--star-mint` | `#ffffff` `#ffbd80` `#9eccff` `#ffb8e6` `#99ffe6` | The stars' colours: about a third white, the rest warm and cool. Read by `js/sky.js`. |
| `--comet-ember` | `#ff5a3c` | A comet on its day: `--star-amber` burnt to red. A comet heats from its dust (`--thread-on`, a little of its planet's colour) through `--star-amber` to this as its day nears. Read by `js/comets.js`; never on a control. |
| `--night-mid` `--night-deep` `--night-edge` | `#070914` `#020307` `#000002` | The universe's black, from the middle of the screen to its edge. |
| `--ink` | `#f2f5fc` | Titles and the owner's own words. |
| `--ink-2` | `#cbd3e8` | Body, labels on controls, captions. |
| `--ink-3` | `#a4b0cd` | Facts (dates, counts, sizes), hints, placeholders, small labels. |
| `--ink-4` | `#7f8cab` | Marks only: dots, grips, empty tick rings, a song's level bars, line numbers, switched-off things. **Never words.** |
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
| `--accent` | `var(--blue)`; inside a planet's own things `var(--pa)` | What a pressed thing is filled with. Never set it on a whole page: a planet's colour is set on its own page content (`#view`), so nothing on bar glass sees it. |
| `--pale` | `#e4e8f2` | What a planet's colour is mixed 34% toward to make a box's edge and glow (`--fg-tone` on the box). |
| `--box-edge` `--box-edge-on` | `rgba(225,232,255,.18)` `.24` | A box's edge at rest and pointed at, before the planet's tint is mixed in. `--box-edge` is also a picture's edge. |
| `--pic-edge-on` | `rgba(225,232,255,.4)` | A picture's edge, pointed at. |
| `--thread` `--thread-on` | `rgb(222,212,240)` `rgb(240,236,252)` | The dust of a thread between planets that share files, at rest and with a planet at one end pointed at. Painted as dots whose strength is the painter's (`WISP_SHADES` in `views/galaxy.js`; brighter is more dots, never bigger ones). The universe's web is the same ink. |

| `--mark-yellow` `--mark-green` `--mark-blue` `--mark-pink` `--mark-purple` | `#f2c43a` `#5cc86e` `#50a0ff` `#ff69a0` `#aa6ef0` | The five highlighters, shared by the reader and documents. Yellow is also a comment's colour (its count on a page, the edge of the comment in hand); words on it are `--mark-ink` `#2a2108`. A highlight on words is the marker at 36 to 40%. |
| `--pen-red` | `#f04a3e` | The photo editor's red pen, beside the five highlighters, white (`--white`) and black (`--void`): eight inks to draw and write on a picture with. Only for drawing on pictures. |
| `--room-veil` | `rgba(5,8,24,.62)` | What a room lays over the sky (section 4, "Room"). |
| `--page` `--page-ink` `--page-ink-3` `--page-line` `--page-raised` `--page-bar` `--page-accent` `--page-gutter` | Night: `#0f1530` `#dfe3ee` `#7f89a6` `rgba(220,228,255,.1)` `#182046` `rgba(16,22,52,.86)` `#86a9ff` `rgba(0,0,10,.32)` | The reader's page: its fill, words, faint words, lines, the fill of a panel floating over it, the bar's fill, its links and outline, the fold between two pages. One of four; Quiet, Sepia and Paper redefine the eight in `tokens.css` (`.rd[data-theme]`). The four fills and their words are also `--page-night`, `--page-quiet`, `--page-sepia` (each with `-ink`) and `--paper`. |
| `--ribbon-red` | `#e0574a` | A bookmark's ribbon and an underlined highlight in the reader. |
| `--light` `--light-ink` `--light-ink-3` `--light-line` `--light-line-on` `--light-tint` | `rgba(255,255,255,.94)` `#15171f` and four see-through steps of it | The add box that opens inside the void: ink on the void's white light. Nothing else uses them. |

Signals mean something or they aren't used. No other colour may be typed anywhere; a picture's own colours are the exception (and a document's, listed under "left for later").

### Type

Families: `--sans` Red Hat Text (400, 500, 700 only), `--mono` Red Hat Mono (400, 500), `--serif` `"Newsreader", "Iowan Old Style", Georgia, serif` (paper only, documents and the book reader alike), `--typewriter` `"Courier Prime", "Courier New", Courier, monospace` (a script, and a document its writer set in Typewriter). The two paper faces are fetched by `paperFaces()` in `util.js` the first time paper is about to show (a desk, a document, a book); call it from anything new that shows paper.

A PDF's own words, when Mutt retypes a line or writes a text box into one, are set in one of the three standard faces every PDF reader has (`--pdf-sans` Arial/Helvetica, `--pdf-serif` Times, `--pdf-mono` Courier), the one closest to the line's own; these are the PDF's type, never Mutt's, and are used nowhere else.

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
| Small label | `--type-small` | 10.5 / 1, mono, `0.14em`, capitals | 500, `--ink-3` | The label above a control or group (`WHO CAN SEE IT`, `INGREDIENTS`, `TICKED`), and `ADD` / `UNIVERSE` on the galaxy (`0.18em`, `--ink-2`). |
| Reach | `--text-reach` | 22 to 40 with the window / 1.3 | 500 | Words read from across a room: the step while cooking, a short quote in the slideshow (longer ones at the smaller of reach and Page, or of reach and Title). Nothing else. |

Set a line of text with the whole role: `font: var(--type-label)`. It carries weight, size, line height and family; letter-spacing and capitals are added beside it where the table gives them. When only the size is wanted (inside a `calc`, or beside the owner's text-size setting), each role's size is also `--text-display`, `--text-page`, `--text-title`, `--text-lead`, `--text-body`, `--text-label`, `--text-caption`, `--text-fact`, `--text-small`. The old stylesheets use the sizes; new work uses the roles.

The user kept the spaced capitals for small labels on purpose; don't turn them into plain words. They are for labels only: never a sentence, a button or a heading. The owner's text-size setting (S 0.93, M 1, L 1.1) multiplies the sizes of their own words; keep it.

### The phone scale

Decided 2026-11-16, when the user found Mutt on a phone small, crowded and hard to use. At 720 wide and under, `tokens.css` gives every role a phone size in one place (its section headed "the phone scale"), so nothing else needs a phone rule for its type: a part set with the roles is phone-sized already.

| Role | Phone size / line |
| --- | --- |
| Page | 28 / 34 |
| Title | 22 / 28 |
| Lead | 17 / 24 |
| Body | 16 / 24 (16 is also what keeps iOS from zooming into a text box) |
| Label | 15 / 20 |
| Caption | 13 / 18 |
| Fact | 12 / 16 |
| Small label | 11 |

Display and Reach keep their sizes. Heights grow with it: small 32, regular 40, large 44, the choice inside a well 34; the top bar is 52; icons are 18 (22 in the editor's and reader's bars), drawn with the line they have at 16 so they don't look thin. A phone rule that types its own size where a role would do is drift.

### Space, heights, corners

- **Space** (`--space-2` … `--space-48`): 2, 4, 8, 12, 16, 24, 32, 48. 4 inside a control, 8 between related things, 16 inside a box, 24 between boxes, 48 between parts of a page.
- **Reach** (`--h-reach` 52): a button pressed at arm's length, with messy hands: Back and Next while cooking. Only a room made to be used from a distance may use it.
- **Control heights** (`--h-small` 24, `--h-regular` 32, `--h-large` 40): small on tiles and in rows; regular everywhere; large for the one main action. On touch screens regular controls become 40 high; a small control keeps its 24 look and gets an unseen 40-high area to tap (decided in session 3: a 40-high button on a file box is a third of the box). The top bar is 36 (`--bar`; 52 on a phone, "The phone scale"). Inside a well that holds choices (segmented bar, stepper) the padding is `--inset` 3 and a choice or round button is `--h-inner` 26. The ring round a text box being typed in, and round a place files can be dropped (the add box), is `--ring` 3 wide.
- **The page** (`--max` 1360, `--gutter` 40, `--cols` 4): how wide a page may grow, the space at its sides (28 under 1100 wide, 16 under 720), and how many file boxes sit in a row (2 under 720). A planet's page adds `--space-48` at each side above 720 wide, so its one column clears the back arrow in the corner.
- **Corners** (`--r-mark` 4, `--r-row` 8, `--r-box` 12, `--r-panel` 20, `--r-full` 999px): 4 tick boxes, tags, paper; 8 rows and text boxes; 12 file boxes and menus; 20 sheets, dialogs, a planet's header; full for buttons, switches, segmented bars, toasts. A thing inside a rounded thing has the outer corner minus the padding (menu 12, padding 4, rows 8).

### Icons

- **Sizes** (`--icon` 16, `--icon-small` 12, `--icon-large` 20): 16 nearly everywhere; 12 inside a chip, a tag or a caption; 20 in the editor's and the reader's bars, for the back arrow in the corner of a page, an empty photo slot and Stop cooking.
- **The line** (`--icon-line` 1.5): the same thickness on screen at all three sizes. `--tick-line` (1.5px) is the tick inside a tick box, drawn with the box.
- **The light** (`--icon-lit` 0.45; it was 0.3 until the user asked for a little more in session 8): how much of its own colour fills an icon's body when its button is pointed at or held on.

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
| `--z-sheet` | 60 | Sheets (account, search), a box while it is being dragged. |
| `--z-room` | 70 | A room: a place that covers the page and its bar (the file view, the editor, cooking, the reader, the slideshow). Above sheets, so nothing of the page shows over it; dialogs, menus and toasts open above it. |
| `--z-dialog` | 80 | The scrim and its dialog. |
| `--z-pop` | 85 | Menus (••• and right-click). |
| `--z-toast` | 95 | Toasts. |
| `--z-fx` | 150 | Sparks and rings drawn over everything. |
| `--z-curtain` | 900 | The light that takes the screen at sign-in. |

- **Inside one part, order its own pieces with 1 to 9.** Those are not layers and stay as plain numbers (a planet's ring in front of its globe, a tab above its card). Never use a number above 9 without a name from this table.
- **A new full-screen place is a room** (section 4, "Room"); a new thing that opens over the page is a sheet, a dialog or a menu. If it fits none of the ten, stop and add a layer here first. Inside a room, its own bars and panels are ordered with 1 to 9.
- **Still on numbers of their own** (the app's order is kept exactly; tidying it would be a change, so it waits): the progress line 99, the drop hint 75 inside the page, the corner back arrow 38 (41 on a phone), the dusk veil between scenes 950.

### Motion

Settled in session 8 with the user: the names, the rules, and the list of everything that moves. A thing that moves uses these and nothing else. `tests/run.sh drift` counts lengths and curves typed by hand in stylesheets and scripts, and the count is 0.

**The names**

| Name | Value | Use |
| --- | --- | --- |
| `--dur-quick` | 120 ms | Pressing, pointing, a tooltip, a chosen row's blink. |
| `--dur-change` | 200 ms | A colour, a switch, a tick. **And everything that leaves.** |
| `--dur-move` | 320 ms | A menu opening, a row moving, the lean, a sliding bead, a room's fade, a page turning. |
| `--dur-arrive` | 500 ms | A box, a sheet, a dialog, a toast, a tip, an offer arriving. |
| `--dur-scene` | 800 ms | The whole screen changing: planet to galaxy, a page flying open, the void opening, the sky changing. |
| `--dur-grand` | 1300 ms | Set pieces only: sign-in arriving, the universe opening, the editor's bars stepping back unnoticed. |
| `--dur-none` | 0.01 ms | Motion: Still. Never use it yourself. |
| `--stagger` | 30 ms | Between things arriving one after another. Never more than 14 steps (`min(var(--i), 14)`). A menu's rows are half a step apart. |
| `--beat-quick` | 1 s | What never stops, quick: a caret, a spinner, dots while it thinks, a shimmer. |
| `--beat-slow` | 4 s | What never stops, slow: sign-in breathing, steam, a moon's plume, the arrow to the universe. |
| `--beat-rest` | 9 s | What never stops, at rest: a box floating, a moon bobbing, the ring round a thing you are dragging onto. |
| `--slide-pace` | 12 s | Not motion: how long one quote stays in a playing slideshow before the next (the commonplace book). |
| `--ease-settle` | `cubic-bezier(0.16, 1, 0.3, 1)` | Things arriving. |
| `--ease-glide` | `cubic-bezier(0.4, 0, 0.2, 1)` | Things moving from one place to another: a planet to its page, a page flying open, a bead, a shake. |
| `--ease-spring` | `cubic-bezier(0.34, 1.3, 0.64, 1)` | Things you press, and things that pop: a button, a switch's knob, a menu growing, a dropped planet. |
| `--ease-leave` | `cubic-bezier(0.55, 0, 1, 0.45)` | Things going away. |

Scripts use the same numbers, read from `tokens.css` by `util.js`, never their own: `DUR.quick`, `DUR.change`, `DUR.move`, `DUR.arrive`, `DUR.scene`, `DUR.grand` (milliseconds); `EASE` (settle), `EASE_GLIDE`, `EASE_SPRING`, `EASE_LEAVE`; `STAGGER`; `BEAT.quick`, `BEAT.slow`, `BEAT.rest`. An `.animate()` call takes its `duration`, `delay` and `easing` from those, and so does a timer that waits for a motion to end.

**The rules**

1. **Pick the length by what the thing is, from the table.** Not by taste, and never a number between two names.
2. **Arriving is `--ease-settle`. Leaving is the arriving played backwards, over `--dur-change` on `--ease-leave`,** whatever the thing and however long it took to arrive. No part has a leaving time of its own. Two set pieces are let off: the void closes over `--dur-arrive`, and a room leaves as it came (rule 4).
3. **Travelling a long way is `--ease-glide`**, the same length both ways. The arriving curve covers most of the way at once and crawls the rest; on a large move it reads as a jump.
4. **A room arrives and goes as one even fade** between two pictures of the screen, `--dur-move` each way.
5. **A plain fade or a change of colour names no curve** (the browser's own gentle one). A loop that breathes back and forth uses `ease-in-out`; one that turns or fills uses `linear`. Those two keywords are for loops only.
6. **Things that arrive together arrive one after another**, one `--stagger` apart, the first at once, at most 14 steps.
7. **Nothing new moves at rest.** What may: the sky, planets turning and their weather, the void turning, a file box's slow float, a moon's bob. A loop takes one of the three beats.
8. **Never blur or fade a parent of glass**; put it on the parts. A menu, a dialog and a toast move and fade; they are not blurred.
9. **Calm** (Motion: Calm): things fade in place instead of travelling, nothing loops but the planets turning and the void (slower), the sky holds still. **Still** (Motion: Still, and the system's reduced-motion setting): nothing moves at all and everything still shows. Every CSS animation runs once in `--dur-none`, so entrances land on their last frame; a script asks `reducedMotion()` before it animates. Never pause an animation to stop it.
10. **Painted things keep their own clocks**, written here as rules and nowhere else: the sky's dust 8 pictures a second and its stars 4; a planet and the void about 30; the dust lifting off a forgotten planet 2.5 seconds, once; a bead 22 pixels a second; the logo's flicker, uneven on purpose.
11. **What follows your hand follows it on a spring, and is never handed to the browser's smooth scroll.** The galaxy's zoom out to the universe is the model (`track`, `snap`, `carry` in `views/galaxy.js`): the picture chases the scroll on a spring, so its speed changes gently as well as its place and a flick or a wheel's notch never kicks it; the spring settles in `--dur-arrive` while you scroll. When you are well on your way and let go, or your scroll slows to a crawl, the page's own scroll jumps to the end (nothing on screen follows the page itself) and the picture glides there on a slower spring (`--dur-grand`) from the speed it already had. It never comes to a stop first: the browser's own smooth scroll starts from a standstill, and that pause was the roughness. Under Still the picture is simply where the scroll is.

**What Mutt may cost.** Measured in session 8 on a sharp screen (1440 by 900 at two pixels a point). A change must not make these worse; measure before and after (below).

- **Safari is measured too, and it is the browser the owner uses.** There, after session 8: the galaxy, a planet's page and the universe hold sixty at rest; sign-in about 59 (52 while typing); the void opens at about 55 and holds 60 while open; the scroll out to the universe, the dive and the pull away 57 to 60. Before the void was rebuilt the galaxy ran at 18 and the void opened at 13.
- **In Chrome, at rest every screen holds sixty pictures a second.** Share of one processor core kept busy, page plus drawing: sign-in about 30 + 30, the galaxy about 15 + 30 (11 + 64 with 27 planets), a planet's page about 10 + 25, the universe about 12 + 10, anything under Still about what an empty page costs.
- **Nothing makes the page wait.** No task longer than 50 thousandths of a second while a page is showing, except the moment a galaxy is first built (about 180, hidden under sign-in's white light when it comes from there). So: slow sums go to a worker (the void's cells and dots); nothing reads a picture back from the graphics chip and waits for it (the sky times itself with a marker; the void's still picture for the universe is made at an idle moment, and encoded by the browser in its own time).
- **A canvas that is copied from is only as big as what is drawn on it.** Safari copies all of it every time (the void, above). The same is still true of the planets: each is painted on one shared 1024 canvas and copied out, which costs Safari about 40 to 100 thousandths of every second; not yet changed.
- **The app starts only once `tokens.css` has arrived.** `index.html` keeps a plain script, `js/wait.js`, between the stylesheets and the app for this. Without it Safari started the app first on a visit with nothing cached, every named value read as nothing, and every scripted move took no time. Never remove it, and never read a named value in a way that could run before it.
- **Painters rest while the screen is changing.** The void and the planets keep their picture for the length of a page change (`html[data-vt]`): the dive, the pull away, a room arriving. They also rest while a room covers the page (`covered()` in `util.js`: the file view, the editor, the reader) and while the page is being scrolled (in Safari, a world repainting while a page of floating boxes scrolls past stalled for a fifth of a second). A new painter does the same.
- **In Safari, a page change redraws everything that moves on the new page, every picture.** So what arrives during one must be cheap: the file boxes' words come into focus from a 2px blur, not 8 (opening a planet went from about 45 to 58 pictures a second), and only the boxes on screen arrive at all.
- **No soft shadow or filter on many small things that arrive with a page change.** The stars' blurred glow cost more than the stars themselves; a gradient looks the same and is cheap. Many small things that sit still through a page change each get their own layer (the stars), so Safari doesn't paint them again.
- **In a dive or a pull away only the planet travels.** Anything else on both pages (a file in a comment's note under the clock) would fly on its own and show as a pale card before the page came (`render` in `router.js`).
- **Never move a whole grid of boxes as one piece.** Safari redraws every box in it before the move can start (a tenth of a second on a planet of 80 files, each time an offer arrived). Move the boxes that can be seen, one by one (`movers` in `offers.js`).
- **Glass on glass doesn't frost twice.** A file box in a sheet (search, recently deleted) has no frost of its own; frost over frost looks the same and Safari draws it again whenever the sheet moves.
- **Don't rebuild what hasn't changed** when laying a page out again (a planet's caption is rebuilt only when its words or icons change).
- **Nothing runs out of sight.** A painter rests when its thing is off screen, when the tab is hidden and under Still. The universe's beads rest until you scroll out to them.
- **A mode's code and styles are fetched only when a planet uses them** (`CLAUDE.md`, "How to add a mode").
- **Starting the sound engine costs about 60.** It happens while sign-in's light has the whole screen, the one place it cannot be seen. Leave it there.
- Sign-in at rest is the heaviest screen because the void fills it at the fineness the user chose; it is no heavier than before that choice. Don't lighten it by drawing it less finely.

- **Under a page change is the night sky** (`::view-transition { background: var(--sky-top) }`). The two pictures of the pages are both part-way see-through while one fades out and the other in, and in the dive there is a gap between them; Safari 18 showed the window's own white through it, so the screen went white for a moment (2026-11-16). Nothing in a page change may rely on what the browser paints behind it.
- **An entrance switched off only while a page change runs comes back when it ends.** A rule such as `html[data-vt] .thing { animation: none }` hands the animation back the moment `data-vt` is removed, and the thing plays its entrance then: the file view blinked out and in after every opening. Mark the thing itself instead (`.is-carried`).

**How to measure** (the tools are in `/Users/edan/Mutt-notes/design/session8/`; the hidden test browser can draw with this Mac's real graphics chip, nothing on screen, at a true sixty pictures a second: `GL_REAL` in `kit.py`):

- `measure.py <repo> <out.json> [many]`: each screen at rest and each big move: pictures a second, late pictures (a gap over 25 thousandths), long tasks, processor share. `compare.py a b` sets two runs side by side.
- `census.py <repo> <out.json> fluid|smooth|off|calm`: walks about thirty-five things and writes down what the browser was really animating (lengths, curves) and whether a picture was late; `off` and `calm` use the account's real Motion setting. Use `smooth` for late pictures: the others sample while things move, and the sampling itself makes pictures late.
- `deeper.py`: where script time goes. `audit.py <repo> <dir> keyboard|phone`: walks every screen with Tab, and at 375 and 320 wide.
- A late picture at the very start of a page change is the new page being built (50 to 80), once; the browser shows a still picture meanwhile. That one is expected.
- **Safari**: `safari_measure.py <repo> <out.json>` (every screen at rest and moving), `safari_probe.py <repo>` (what repaints, how often, what each costs, and any error), `safari_bench.py` (small trials of one way of drawing). Safari cannot run hidden: a window opens, is brought to the front, and must be left alone; ask the user first. A change to a painter is measured in both browsers: what is free in Chrome can be ruinous in Safari.
- `edge_check.py <repo>`: whether the void's strands slide or jump (the amount of strand in front of the light, picture by picture). `film_photo.py <repo> <out.jpg> <picture>`: a photo opening from its box, as a strip of pictures with how bright the photo is in each (it must not dip).
- `scroll_probe.py`: the scroll out to the universe, driven as a trackpad drives it (steady, a flick, letting go halfway): stand-stills mid-trip and the sharpest change of speed between two pictures. `film.py <repo> <out.jpg> void-open|void-close|void-send`: a strip of pictures of one move on one sheet, to see a jump or a part arriving out of turn.
- **Safari's engine, hidden** (the user's choice, 2026-11-16: no window): WebKit as Playwright builds it, in `~/.cache/mutt-tests` (`python3 tests/get_browser.py --webkit` on the branch that added it). The tools are in `/Users/edan/Mutt-notes/design/safari-ux/`: `engine_ux.py <repo> <out.json> [rounds]` walks forty moments, from sign-in to the reader, with real pointer and keys at two pixels a point, and names any script callback over 20 behind a stall; `summary.py after.json before.json` sets two runs side by side; `engine_ab.py <repo> full|dive|back|sign|search|hover [times]` repeats one moment with bits of CSS switched off (`UX_VARIANTS`) and, with `UX_TL=1`, prints a timeline of what changed on the page beside the stalls; `engine_one.py <repo> <questions.js> [path]` runs timings inside a signed-in page; `engine_shots.py` takes pictures. Other sessions' tests load this Mac: every moment records the load, and `quiet.sh` waits for a calm minute. Its numbers wobble more than Chrome's; repeat a moment three to five times before believing it.
- What these cannot tell: whether a move feels right. Give the user a short list to watch.

**Everything that moves.** A new thing that moves is added here, beside the thing it is most like, and does as that one does. Lengths are the names without `--dur-`; "leaves" always means `change` on `--ease-leave`.

| Thing | How it moves |
| --- | --- |
| *Shared parts* | |
| A button, a stepper | pressed and pointed at: quick and change, on the spring |
| A slider | its knob pointed at and pressed: change, on the spring; its value lighting: change |
| A calendar | a day pointed at: quick; pressed: change, on the spring; another month sliding in 8 from its side as it fades in: change, settling |
| A time wheel | turning: the browser's own scroll and snap; a value pressed or a key turns it there smoothly; the value under the band lighting: quick |
| A text box taking the keyboard, an icon lighting, a swatch, a tick | change |
| A switch | its track change; its knob move on the spring |
| The segmented bar's bead, the tabs' sliding light | move, on the glide |
| A menu (•••, right-click, the editor's, the reader's) | grows from where it was asked for, move on the spring; rows half a step apart, move; highlight glides, change; a chosen row blinks, quick; leaves |
| A small panel (Share, a list's settings, Aa) | grows like a menu; leaves |
| A sheet (account, search) | arrive (its fade move); leaves |
| A sheet page (the account sheet's doors) | the page showing leaves 16 sideways; the next arrives from 16 the other side, move; Back the same backwards |
| A dialog | arrive (its veil move); leaves |
| A toast; the upload toast's void filling | arrive; leaves; the fill move, steady |
| A comment note (under the clock) | drops 12 into place, arrive, notes one step apart; leaves sideways |
| The tooltip | waits 500, fades quick |
| The drop hint | change, move and arrive |
| A tip (the sharing tip, the recovery key ask, the name ask) | arrive; leaves |
| The ring on a phone, turning | follows the finger; let go, glides on and settles on the spring in move; under Still it jumps |
| A menu on a phone (a sheet at the foot) | rises in arrive on settle; leaves in change on leave, the shade under it fading the same |
| An offer | move (the user found arrive a little slow); it is looked for `--dur-move` after the page is up, and again `--dur-scene` after the planet's files stop changing while it's open; leaves |
| The line at the top while a page loads | creeps on the slow beat; finishes in change |
| "Write it as a document"; a comment arriving, being removed | move; arrive; leaves |
| *File boxes and the add box* | |
| A box arriving | rises 16 over arrive, its parts fading in one step apart |
| A box at rest | floats 2.5 up and down on the rest beat, each box offset |
| A box pointed at | glass and glow move and arrive; a picture, page or cover lifts over arrive; the lean follows the pointer |
| A picture fading in when loaded | arrive |
| The tag and the buttons on a box; the add box's buttons | fade change, move move |
| A video starting when pointed at | move |
| A box being added | its line move; its shimmer on the quick beat |
| A box leaving; the others closing up | leaves; arrive |
| A change made elsewhere (someone else, or you on another device; `live.js`): a box coming, going, changing or the boxes rearranged | the same moves as made here: a box joins in the one glide of the rest, leaves the same way, its picture or words swap in place; no sound, no glow, nothing says who. A page built again (a mode turned on elsewhere) changes at once, where you were |
| A box picked up, carried, dropped | lifts change; lands move or change |
| *The screen changing* | |
| One page to another | the old fades in move on the leaving curve; the new fades in over arrive. No blur. |
| Opening a planet: the dive | galaxy leaves over arrive; the planet travels and swells over scene on the glide; its page fades in over arrive after move |
| Coming back: the pull away | page fades change; the galaxy closes in over scene; the planet glides scene |
| Swiping up out of a planet (touch) | the page draws back into its planet as the finger goes up (shrinking toward it, to 0.86 when far enough, and rising a little); let go far enough, the pull away carries on from there; not far enough, it settles back in move on settle; under Still it doesn't follow |
| A mode switching on or off | leaves; arrives over arrive |
| A room arriving and going; a file gliding from its box | move each way, evenly. A picture, page or cover keeps its old self whole underneath while the opened one fades in over it (`view-transition-class: pic`), so it never dims part-way; the file travels above the room's dark veil (`z-index` on its group), and the room, carried in by the page change, has no fade of its own (`.viewer.is-carried`) |
| Signing out | the dark comes over arrive, lifts over scene |
| *Rooms* | |
| File view: side panel, connections, comments | arrive |
| File view: a note's earlier copy coming onto the stage | its bar fades in over move, its words rise over arrive |
| File view, marking up a PDF: the bar rising in at the foot, sinking away | arrive on the settle curve; leaves |
| File view, marking up: the bubble over picked words or a chosen mark | move on the spring; leaves (the editor's bubble) |
| Editor and recipe card: the page flying open and back | scene each way, on the glide |
| Editor: bars dropping in; the sky rising behind | arrive; scene |
| Editor: bars stepping back while you write | out over grand, back in move |
| Editor: panels, the bubble, the "/" menu | move (the bubble and "/" on the spring) |
| Reader: opening, closing | move; leaves |
| Reader: a page turning, its bars, panels, ribbon | move |
| Cooking: the next step | move |
| Slideshow (commonplace book): the next quote | the one showing leaves; the next rises 8 and fades in over arrive |
| Slideshow: its bar and Close stepping back while it plays, coming back | after a slow beat of stillness, out over arrive; back the same |
| Photo editor: a tab's controls arriving | arrive, one step apart |
| Photo editor: the crop's lines of thirds | change |
| *Modes* | |
| List: an item ticked and sinking to Done | scene on the glide, however far |
| List: items arriving, one added, one removed | arrive, one step apart; move; leaves |
| Cookbook, desk, shelf: cards, pages, covers arriving | arrive, one step apart |
| Commonplace book: cards arriving, one added; one taken away | each card slides up 16 over arrive while its words fade in a step later, one step apart; leaves |
| A desk's page or a shelf's cover lifting | arrive (the cover on the spring) |
| Board: files gliding from the grid into their places, or to new ones (Arrange, Undo, Make it bigger); a thing added; words or a line taken away | scene on the glide, one glide for all; arrive, rising 8; leaves |
| Board: a thing picked up, carried over a planet, let go; the hairline when edges line up | change on the spring (lifts to 1.03, 0.5 over a target); quick |
| Board: zooming with the bar or to fit; the dots round what is carried | move, through the scale; move in, change out |
| *The galaxy and its planets* | |
| The galaxy arriving | planets rise over arrive, one step apart; the hint over scene |
| A planet pointed at | rises 3 and swells to 1.09 over arrive on the spring; spins up, then coasts |
| Planets turning, weather, effects | painted (rule 10) |
| Planets moved to new places; stars with them | scene; the ghost and guide change |
| A planet dropped on an orbit | arrive on the spring |
| A file dropped on a planet | the bubble arrive on the spring; the gulp scene |
| A star or file box thrown at a world (Throwing) | flies on with its own speed, steered more and more toward the world, for at most scene; caught, it swings round it over arrive (holding close in, circling, until the server has answered), shrinking and fading after 0.7 of the way; the world's landing ring spreads over arrive; then the gulp. Under Still it is simply there once the server answers |
| A throw at nothing, or one that couldn't land | carries on the way it was thrown and comes back to its place on a spring, at most grand |
| Moons | bob on the rest beat; born over scene (several at once, from a split, one step apart); plumes on the slow beat; a split's Undo fades the moons it made away (change, leaves) as the files glide back |
| Stars (loose files) arriving, leaving | arrive; leaves |
| A star opening from a point into its card as the pointer comes near; lifting when pointed at; back to a point | move on the settle curve; move; leaves |
| A constellation: its stars gathering into it, moving with it | scene, as stars do; a new figure's name arrives, its wisps come in over move once the stars have landed |
| A planet merged into another (right-click, Merge into…) | flies to the other's centre, shrinking to 0.15 and fading, over move on the leave curve; the other gulps; Undo: it is born again in its place as a new planet is |
| A constellation becoming a planet | its stars draw together into one point over scene on the glide, its name leaves; the planet is born as a new planet is |
| Search: a found file lifting off its planet and gliding to the void (as a file launched from the void, backwards) | scene on the glide, along a gentle curve, growing from 0.35 and fading in over its first third; several one step apart (at most 14); flies only once typing pauses for move |
| Search: a found file moving to a new place on the ring | move on the glide |
| Search: planets without a match stepping back, and coming back | change |
| Search: the line from the file pointed at to its planets | fades in over move |
| Search: the sky's stars leaning in toward the void as the first files arrive | once, over grand, half as strong as the void swallowing a file |
| Search: the found files going home | leaves (change on the leaving curve), all together |
| Comets | still at rest; a comet's picture fades in over arrive where it is today (it is placed again when the galaxy is laid out and every half hour, never animated along its path); its tag fades in over move, out as leaving; pointed at, it brightens in quick; done, it burns up: sparks, then it falls into the void over scene on ease-leave and the void gulps |
| Threads between planets | still at rest; they arrive over scene after the planets, follow the planets while they glide or are carried (repainted only then), brighten in one step when a planet at one end is pointed at, and their counts fade in over move and out over change |
| *The void* | |
| Turning | painted (rule 10): about 30 pictures a second, every picture when it is big (sign-in); rests while the screen is changing; fades in over move once its pictures are worked out |
| Opening, closing | scene open, arrive closed; its box arrives over arrive after move, and leaves |
| Swallowing | the file spirals in over scene (several: one step apart); the void gulps |
| Listening (Speak to the Void) | the light swells and breathes with how loud you are, painted with the rest of the void; the plus fades over change; its one line arrives over move and leaves |
| A voice note's words being read | the new star breathes on the quick beat until they are in; what was said arrives beside it over arrive, stays a slow beat, leaves |
| *Sign-in* | |
| The page arriving | the void and the dust over grand; the logo lands at scene |
| The keys appearing; a key pressed | move and arrive, one step apart |
| A wrong code | shakes for move on the glide |
| The right code | the words go in move; the light takes the screen over scene on the leaving curve, then fades over scene |
| Breathing, the caret | the slow beat; the quick beat |
| *The universe and the sky* | |
| Out to the universe and back | follows the scroll on a spring (rule 11): tight while you scroll, slow when it carries on by itself |
| The universe appearing; its galaxies shifting | grand and scene; arrive |
| Diving into someone's galaxy | arrive on the glide |
| Beads, dust, stars | painted (rule 10); a bead goes first to the threads between galaxies that share files |
| A beam on its way (sending) | out to the universe as the scroll does (rule 11); the light from your galaxy to theirs over grand on the glide, its trail one step apart; the drop ring at theirs over scene; back as the scroll does. Still: none, the toast at once |
| A beam coming in (receiving) | after grand, from just past the screen's edge the way their galaxy lies, over grand on the glide, into its pile, which lands with the drop ring. Still: the pile is simply there |
| Changing sky | scene |
| *The top bar* | |
| The search box widening; the account's caret; the sky picker | arrive; move; move on the spring |
| The corner back arrow; the logo's letters landing | change; arrive |

**Not finished, and known:** in Safari sign-in drops to about 52 pictures a second while you type (its dust alone makes thousands of strokes a second), and the planets' copies cost the page about a tenth of every second; a new star being born lays the whole galaxy out again, which drops one picture (about 33) as it appears; after the right code, sign-in's white light held for most of a second in 2 of 14 measured runs and could not be made to do it again; the cause is not found. Safari on a computer is measured; a real phone's speed is not (its looks were checked in the simulator's Safari on 2026-11-16).

### Sound

Settled with the user on 2026-11-16 (design idea 20). Three rounds on a listening board gave the character: tactile, "kind of like Nintendo", textured rather than chords. A fourth, the same day, gave the rule that matters most: **less distracting, and a sound is the movement it goes with.** "If it is a sweeping action it should sweep or whoosh." So:
- A sound lasts as long as its movement (a length from `DUR`) and is shaped by its curve: arriving comes fast and settles, leaving starts slow and is gone, gliding swells and falls, popping rises quickly.
- It rises in pitch when something opens or comes nearer, and falls when it closes or goes.
- Only what really clicks clicks: a switch, a tick, a key, a stepper, a dial's notch. A landing is a soft pat, never a knock.
- One glint of glass (a single short note in the music's key, D E F G A, never two at once) marks a few things done.
- A sound starts when its movement starts: a page change's sound waits for the new page to begin moving (`moving` in `transition`, `whenMoving` in `transitions.js`), not for the press.

Sound is kept as strictly as Motion: a sound is a name from this list and nothing else.

**One way in.** `sound(name, opts)` from `sound.js` (always loaded, small); the sounds themselves are made in `soundbank.js` (`SOUNDS`, each with when it plays and how it is made; fetched once the page is up while Sounds is on, never with it off). A feature never makes a sound of its own, never loads a recording, and never starts its own sound clock: there is one, `audio()`, shared with the music. The one sound that lasts is `holdSound('wind', level)`. The sample page (`/parts`) plays every one.

**The parts every sound is built from**: *air* (noise swept in pitch and shaped like the motion, `swell`: a sheet, a menu, a dive, a page), *dust* (many tiny soft grains whose loudness follows the motion: the void), a *click* (a burst of noise a few thousandths long, the edge of a switch or key), a *knock* (noise ringing in a narrow band with a faint tone, the body of a click), a *pat* (a soft low touch: set down, arriving), *grain* (a few uneven tiny clicks: paper, a crumple) and the *glint*. Every part is a hair different each time.

**Ranks and loudness** (measured in Safari's engine, the loudest 50 ms, against the music's loudest at −19 dB; each sound's `TRIM` brings it there, a long sweep a little under; all of them 2.5 dB under the first numbers since the user asked for "a bit quieter", `LOUD` in `soundbank.js`):

| Rank | Loudness | Sounds |
| --- | --- | --- |
| 0, a press | −38.5 dB (the faintest ticks lower) | `press` (a button, menu row, tab or door with no sound of its own), `key` (a code digit, computer only), `on`/`off` (a switch's knob sliding and landing), `select` (a segmented bar's highlight gliding, a calendar's day picked), `step` (stepper), `slide` (a slider's notch, a time wheel passing a value), `detent` (the phone ring passing a planet), `pick` (a menu row chosen), `over` (a faint breath as a place lights to take what you carry), `shift` (rearranging: a soft short slide each time the others make way; at most one each `--dur-quick`) |
| 1, moving about | −33.5 dB | `swoop`/`unswoop` (the void opening: a rush of fine dust dipping and rising over the scene, settling with a pat; closing: a shorter rush falling away; not when it swallows, that is `take`), `pop`/`unpop` (menu, panel), `sheet`/`unsheet` (sheet, dialog), `turn` (a page sliding: the reader, a sheet's door, the next file), `open`/`close` (a room), `dive`/`surface` (long whooshes over the scene), `lift`, `search`, `found` (a faint tick per find), `wind` (out in the universe, rising with the scroll; a steady sound, so kept far under everything else: about −46 dB at full, 28 dB below its first level, at the user's word twice on 2026-11-16) |
| 2, something done | −29.5 dB | `take` (the void swallows a file: a pat and air drawn down), `land` (on a planet: a pat and a glint of its note), `drop`, `tick`/`untick`, `undo` (a sweep the other way), `bin` (a crumple falling away), `copy`, `no` (two soft dull knocks with the shake, never a buzz), `news` (a comment or a beamed file, once a visit, a tap on glass) |
| 3, rare | −27.5 dB | `save`, `join` (a constellation), `born` (a planet or moon, a glint of its note), `hello` (signing in: one long breath) |

**Every planet has its note**, its glint when a file lands or it is born: gas A4, lava D5, desert E5, terran F5, ocean G5, storm A5, haze D6, bloom E6, lagoon F6, pale G6, pearl A6, ice D7; a star and the void D6.

**The rules for many at once** (in `soundbank.js`, so no feature has to think about it): what is asked in the same moment is weighed together, rarest first; a plain `press` says nothing if anything else spoke with it or in the last `--dur-quick` (one press, one sound); the same sound again while it sounds is nothing, or for `land` (3) and `found` (6) one more faint tick; at most four at once (the least steps aside for a rarer one), sixteen starts a second; a rarer sound quietens the lower ones still playing; everything goes through one limiter, so many are never louder than one.

**Never a sound:** pointing, scrolling, dragging along (only `over` as a place lights); touching a file, planet or star (what it opens says it); Tab and the arrow keys; taking a text box, and typing in one (only the code pad, and not on a phone); a toast (it repeats what a sound already said); the corner back arrow (the pull away says it); what happens by itself (a slideshow moving on, saving, loading); while a song or video plays in Mutt; in a tab not showing; in the first second of a page; with Sounds off (nothing is even fetched).

**On Apple devices** the clock is an "ambient" sound (`navigator.audioSession`): it mixes with the person's own music, and the silent switch silences it. Browsers allow sound only after a tap, so the clock wakes on every pointer-down and key, rests after 15 quiet seconds when no music or wind needs it, and stops when the tab is hidden.

**A browser run by a test is heard by nobody** (2026-11-16, the user: they don't want to hear the hidden browser's tests): when a test drives the browser (`navigator.webdriver`), every sound and the music still play and are counted, but into a silent end with a meter (`speakers()` in `sound.js`; `soundsLoudest()` reads it, the browser path `sounds` checks it), and a song or video in the page plays muted. Anything new that makes sound goes to `speakers(ctx)`, never straight to `ctx.destination`.

**The switch:** `Sounds`, its own row under `Music` in the account sheet, On from the start (`sound` pref, `data-sound` on the page).

**Rearranging** (a planet's files, a list, a board, or anything new that is carried to a new place among others): `lift` when it is picked up, `shift` each time the others make way, `drop` as it settles into its place (a timer of about 0.7 of its settling length, so the pat comes as it lands); let go on a planet or the void instead, it is `land` or `take` and no `drop`. `grid.js`, `listmode.js` and `board.js` do this; copy them.

**How to add a sound:** say which existing sound it is most like, and use that one if it fits (a throw is a `lift` then a `land`; beaming out a `take`). If it is truly new, add it to `SOUNDS` with a rank, `when` and `made`, build it in `MAKE` from the parts above as its movement (its length, its curve, its direction; no tones held, no chords, at most one glint), measure it (the board's tool, `Mutt-notes/design/sound/`) and set its `TRIM`, add it to the table here, and play it to the user first.

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
| **Print** | The void, the sky's dust, the threads between planets and galaxies that share files, the drop ring, and comets' tails (a comet's streak and glint are crisp light, like the sky's flares). | Anything else. |

Glass on glass can't frost and goes muddy: never put box glass inside a sheet or menu. Inside bar glass, rows are washes (`--tint`), not boxes.

### Box glass

Use the `.fglass` class (don't write a fill). Its recipe, each value a name in `tokens.css`:

- Fill `--fg-fill`: `rgba(190,202,240,.09)`, flat. Never a gradient. Pointed at or typed in, `--fg-fill-hover`: `rgba(200,210,245,.13)`.
- Frost `--fg-frost`: `blur(28px) saturate(1.15) brightness(0.9)`. It softens the sky and deepens it a touch, so words hold anywhere on the page.
- Edge: 1px. With `--fg-tone = color-mix(in oklab, var(--pc), var(--pale) 34%)`, at rest `color-mix(in srgb, var(--fg-tone) 22%, var(--box-edge))`; pointed at `color-mix(in srgb, var(--fg-tone) 56%, var(--box-edge-on))`.
- Light `--box-light`: `inset 0 1px 0 rgba(255,255,255,.14)` on the top edge (`--box-light-on`, `.18`, pointed at).
- Glow: **none at rest.** Pointed at or typed in: `0 0 30px -4px color-mix(in srgb, var(--fg-tone) 30%, transparent)`.
- Shadow: `--shadow-rest`; `--shadow-raised` pointed at.
- Changes take `--dur-move` (edge, fill) and `--dur-arrive` (glow, shadow) on `--ease-settle`.
- The colours are worked out on the box itself, so it takes `--pc` from the page it sits on.
- Fades and blurs on entrance go on the box's parts, never on a parent of the glass: either one on a parent stops the frost.
- Glass that sits on a picture (the tag and the two buttons on a file box) is not box glass: it is `--bar-fill` under `--tag-frost` `blur(12px) brightness(0.7)`.

### Bar glass

- Fill `--glass-fill`: `rgba(13,19,48,.74)`, flat. Frost `--glass-frost`: `blur(28px) saturate(1.4) brightness(0.6)`. Edge `--glass-edge`: 1px `rgba(205,218,255,.16)`. Light `--glass-light`: `inset 0 1px 0 rgba(255,255,255,.1)`.
- The frost dims what is behind it (decided in session 3). Without that, a menu over a white page or a bright picture turns grey.
- Shadow: `--shadow-float` for menus, toasts, tips and tooltips, `--shadow-overlay` for sheets and dialogs.
- The top bar is the same glass with fill `--bar-fill` `rgba(6,10,30,.58)`, no edge but a 1px `--line` along the bottom, no shadow.
- Bar glass never takes a planet's colour. The planet's colour is set on the planet's own page content (`#view`), never on `body`, so anything that opens over the page (menus, sheets, dialogs, toasts, the top bar) is outside it.
- In the stylesheet it is the one rule headed "bar glass" in the shared parts section. A new shared part on bar glass is added to that rule's list; a feature's own tool on Mutt's glass (the editor's toolbar, its bubble, its find box) takes the class `.bar-glass` and writes no glass of its own.
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

One cream, flat, everywhere paper shows: a page on a desk, the pages of a document, a page or a cover in a file box, the reader's Paper page.

- Fill `--paper` `#f8f5ee`. Never a gradient, a sheen or a rim. Corners 4 (`--r-mark`), so it never reads as glass.
- Words `--paper-ink` `#1d1b18`, `--paper-ink-2` `#5c5852` (a subtitle, a quote), `--paper-ink-3` `#8f897f` (a page's number, a helper in the margin). A ruled line is `--paper-rule` `#ddd6c8`; a sunk patch (code, a table's heading row) `--paper-well` `#efebe2`; a link `--paper-blue` `#1f4fa8`; the caret in a document `--paper-caret` `#b3261e`. `--paper-edge` `#e9e4d8` is kept for a page's edge where one is wanted.
- Shadow `--paper-shadow`: `0 0 0 1px rgba(0,0,18,.2), var(--shadow-raised)`. Pointed at and lifted, `--paper-shadow-on`: the same hairline with `--shadow-overlay`. Paper never glows and never takes a planet's colour.
- A book's cover is paper's shape with the left corners 2 and `--spine`, a shaded band 7% wide down its left edge.
- Type on paper is `--serif`: titles 600, text 400, at the reader's or document's own size. The serif is used nowhere else, with two exceptions the user chose: on a desk, the planet's name and note and the names under the pages are serif too (session 5; section 4, "Documents"); and in a commonplace book a quote keeps its own voice, its words in the italic serif and who said it in the serif, on its card and in the slideshow (2026-11-16, from `design/quote-board.html`; section 4, "Commonplace book").

### Print: the void

The best-realised piece in Mutt, and the bar for everything else. Don't restyle it. What it is: a stippled black-and-white print: a bright white light caged by dark, sinewy strands that web together where they cross, turning in 3D; stippled cells, bright at their rims and dim in the middle; faint rays; only a faint mauve tint. Bright places are dotted more densely, like a print. Sized in proportion to the planets, sitting straight on the sky with no dark halo. No crosshair lines, no orange, no pixel sparks, no realistic or painted light. Add boxes that open from it are flat and plain like Are.na's: spacious, no glass, gloss or glow, not paper.

How it is drawn (`js/voidart.js`; session 7 drew it finer at the user's word, the idea untouched). These are rules for anyone who touches it:

- **Sharp.** Painted at the screen's own sharpness: up to 2 pixels a point on a computer, up to 3 on a phone, whose screen is 3 and whose void is small (`sharpness()` in `util.js`, which the planets and the sky's stars use too). Never stretch a smaller picture to fit.
- **Dots laid evenly, never scattered at random.** The stipple is one small tile of dots spaced evenly (`evenPoints`, 1.12 points apart) and punched through each layer of light; random scatter clumps and leaves bald patches. A dot is 0.26 to 0.64 points in radius, the same on every sharp screen; on a plain screen (under 1.5 pixels a point) dots and spacing grow by half so no dot is smaller than a pixel. All four numbers are `DOT`.
- **Brighter places get more dots, not bigger ones**: each layer (cells, rims and rays, the light's glow, its core) is punched with the same tile, shifted, so where layers overlap the dots add up.
- **Strands are smooth curves** (`ribbon`), never straight pieces: at sign-in the void fills the screen and corners show.
- **A hairline of light on the near strands** (`edges`): 0.6 wide, on the side toward the light, brightest beside it and gone by the edge of the cage. It is the only light on the strands; no gradients, no glow.
- **Cost.** It is redrawn about thirty times a second at rest and every frame only while opening, closing, hungry or swallowing; it rests when off screen, when the tab is hidden and under Motion: Still. Keep that. Its cells and its tile of dots are slow sums, so they are worked out off the page's own thread (`js/voidmake.js` has the sums and may not touch the page; `js/void-worker.js` runs them; `voidart.js` falls back to doing them itself), once, and kept for every void on every page. Until they are in, a void draws nothing; then it fades in over `--dur-move`. Opening takes `--dur-scene`, closing `--dur-arrive`.
- **It is a stack of canvases, and nothing is ever copied from one canvas onto another.** `el` is a box holding seven canvases, bottom to top: `body`, `cells`, `rims`, `halo`, `core`, `behind` (the strands behind the light, then the light), `front` (the strands in front, their hairlines, the open light). Each layer of light is painted on its own canvas and the dots are punched through it there; the browser lays the seven over each other. It was once one picture with hidden canvases copied onto it six times a redraw, and Safari pays for the whole of a canvas each time it is copied from: that held the void to 13 to 27 pictures a second there and made its strands jump. A layer is only as big as what is on it (the ball's square; for `halo` and `core`, which reach past the ball when the void is open, the wider `box`), and the dots keep their places on the picture wherever a layer's corner is. `copyTo(target, r)` makes a still picture when one is truly needed (the universe's). A new layer of light is a new canvas in the stack, never a copy.
- **A strand changes sides exactly at the ball's edge.** Each strand is drawn from 120 points, black where it is in front of the light and grey where it is behind. Where it passes from front to back, between two of its points, the run is cut at a point worked out where the strand's depth is nothing (`runs` in `voidart.js`), never at the nearest of its points: cut at the points, the black and grey changed over a whole piece at a time and jumped along the edges as the cage turned (the user saw it; measured at sign-in as 30 sudden steps in five seconds, now 1). Anything else that splits a turning shape into near and far does the same.
- **A big void is redrawn every picture.** On a galaxy it turns by a fraction of a pixel a picture and thirty a second is smooth; at sign-in it fills the screen, its strands travel further between pictures, and thirty looked jagged (the user, session 8). `BIG` in `voidart.js` is the size above which it is drawn every picture.
- **On someone else's galaxy it carries their name** (the name they gave, else `@username`) in Label, in the void's dark ink at full strength (the shade it takes when pointed at on your own), never the faint resting ink of `ADD`: a name is read, not hinted.
- **It rests while the screen is changing**, as the planets do: a page change sets `data-vt` on the page, and the browser is showing pictures of both pages then.

Sign-in: only the dark sky and the void, no box and no horizon. The void is huge and looming (it fills the screen; on a phone its cage runs off the sides). Every word (logo, name, code) sits in dark ink on its clean white light: never put text over the speckled cage. Dust spirals in and stars streak toward it along the same swirl; it reacts to every key, ripples on a wrong code, and on the right code everything rushes in and the light takes the screen. Ominous, an experience. One step to start: type a name (a known name asks for its code, a new one picks a code); never an "are you new?" question. Always night.

### The sky

Built in session 7 (`public/assets/js/sky.js`, the rules headed `.sky` in `galaxy.css`). The drawn reference is `design/sky-board.html`: the look is the board's, the way it is built is not.

**The look**

- **Ground.** A vertical fade: `--sky-top` at the top, `--sky-deep` at 34%, half `--sky-mid` half `--sky-deep` at 78%, a little brighter at the foot. The bright floor is `--sky-low` at 46%, glowing from the bottom-left corner. It stays blue; it does not wash out words.
- **Print dust.** Light made of fine dots (0.4 to 1px, pale blue-white, 22 to 80% strong), in two dot screens of different size and angle (2.7 and 3.4 across, the second turned 27°) so thick dust never looks like a grid. The dust gathers in **one river** from low left to high right, with dark winding lanes through it like the void's cage, and thins to almost nothing elsewhere. Each dot fades in and out as the dust drifts past it.
- **Stars: many, mixed.** Most are small soft points that gather where the river is. A handful flare, and no two match: each has its own size, tilt (about a third are turned to an ×) and arm lengths, a soft halo, and red and blue pulled apart a little like an old lens. Colours are the five `--star-*` names. They twinkle by a sixth.
- **Liquid light: a hint.** The sky is the surface of a dark liquid lit from above. A pale grainy sheen sits on the folds that face the light, and colour appears only as a thin line (2 to 14px) where each highlight ends, in the order red, amber, pale core, green, blue, violet, breaking up along its length. Never bands or floods of rainbow.
- **Old film.** Grain over everything (it changes six times a second), a slightly warm and faded tone, blacks lifted a touch.
- **Movement: slow.** One slow liquid field drives the river, the lanes and the light together, so the parts move as one.
- **The universe.** Black (`--night-*`), with grain and **no stars**. Mutt's stippled web joins the galaxies (`js/uvweb.js`, painted once for a layout), each galaxy in its own halo of dots, and **beads of light** travel the threads that reach a galaxy: at most 14, one to a thread, 22 pixels a second, fading at both ends (`beads()` in `uvweb.js`, `.uv-bead`). Galaxies that share files are joined by a wisp of their own instead of the web's thread between them (see "Threads" under Planets), and the beads go to those first.
- **Four skies, tuned alike.** Vita, Nebula, Aurora, Dusk. A sky is only its four colours; every other part of the recipe is shared, and each step is as light as Vita's.
- No ribbons and no colour clouds: the river replaced them.

**How it is built, and what it may cost.** These are rules, not notes: a change to the sky keeps every one.

1. **Three layers**, all absolutely placed inside `.sky` (a canvas that sizes its own box grows without end): `.sky-wash`, the ground as a plain gradient (seen for the first moment and wherever the dust can't be drawn); `.sky-dust`, the moving dust; `.sky-stars`, the stars. Over the dust sits `.sky-night`, the universe's black.
2. **The liquid is worked out small**: a picture a sixth of the screen each way (`FIELD`), holding how much dust, the light on the liquid, where it shows and how wide its colour line is. It needs more than 8 bits, so the dust needs WebGL2 with half-float pictures.
3. **One light pass at full size** (at most 1.5 pixels a point) turns that into ground, dots, sheen and grain. Nothing slow may go in this pass: no noise of more than one step, no loops.
4. **Eight pictures a second** (`DUST_FPS`), not sixty. **None while the tab is hidden, none out in the universe** (the black covers it), and **one** under Motion: Still, under Calm, and on a slow computer.
5. **A slow computer gets the still sky.** The first five pictures of dust are timed (a marker is left behind each and looked for between the page's other jobs: the page never stops to wait for the graphics chip); if the middle one takes more than 14 thousandths of a second, or the graphics are drawn by the processor, the dust is drawn once, copied onto a plain picture, and never moves. Without WebGL2 there is no dust at all: the ground, the stars and a still grain (`.sky.is-flat`).
6. **Stars are a still layer**: ready-made pictures (a point per colour, one picture per flare) placed with `drawImage`, redrawn four times a second to twinkle (`STAR_FPS`) and every frame only while something pushes them about: the pointer (they lean a little), a scroll, the void bending them into a ring (`setLens`), or the void swallowing a file (`pull`).
7. **Night is the stylesheet's.** `setNight(0..1)` only sets `--night`; the black fades in, the stars fade out and the dust rests, with nothing redrawn for the fade.
8. **A sky's colours are read, not typed**: the painter reads `--sky-*` off `.sky-wash`, where they ease when another sky is picked, and follows that ease frame by frame.

**To add a sky**: its four colours in `tokens.css` (`html[data-sky="name"]`), each step as light as Vita's (relative luminance 0.003, 0.007, 0.021, 0.114); its name in `PREF_CHOICES` (`mutt/api.py`) and `SKIES` (`js/theme.js`). Nothing else.
**To change what the sky is made of**: change the board first (show the user), then the two shaders in `sky.js`; keep the cost rules; look at it with `/Users/edan/Mutt-notes/design/session7/shots.py`, and give the user what to watch at real speed, because the hidden browser draws it still.

### Planets

Built in session 7 (`public/assets/js/planets.js`, painted by `planetgl.js`). The drawn reference is `/Users/edan/Mutt-notes/design/session7/twelve-worlds-2026-11-13.html`. The world comes first; a planet's files ride on it, modest.

**Fourteen kinds**, each with ground, weather and one effect that is its own. The first twelve are the painter's looks 0 to 11; the moons are 12 to 21, so the two added on 2026-11-16 are 22 and 23 (`LOOK_INDEX`), and a new kind goes on after them. Names are plain and say what you see.

| Kind (`id`) | What it is | Its own effect |
| --- | --- | --- |
| Deep ocean (`ocean`) | deep water, islands in pale shallows | a cyclone that turns; the sun's glint on the sea |
| Forests and seas (`terran`) | forest and plain, mountains with snow, ice caps | an aurora round its pole, brightest in the dark |
| Banded giant (`gas`) | bands sliding past each other, curling where they rub | a great storm, a few white ovals |
| Pale giant (`pale`) | a calm giant with soft bands | a six-sided storm on its pole |
| Lava seas (`lava`) | dark plates and a molten sea | seams that breathe, vents that flare, smoke |
| Ice sheets (`ice`) | pale sheets cut by blue crevasses | a blizzard, glints off the snow, crevasses lit at night |
| Red desert (`desert`) | rust plains, ochre dunes, old dark lava, one canyon, small caps | a dust storm crossing |
| Thunderstorm (`storm`) | cloud curling over cloud | two hurricanes with clear eyes; lightning |
| Coral shallows (`lagoon`) | warm shallows, atolls of sand round pale pools | light dancing on the water; small clouds |
| Night bloom (`bloom`) | dark seas, continents of veined growth | its veins and shores glow at night, in slow waves |
| Golden haze (`haze`) | no ground, only thick cloud | cloud racing round in a sideways V, deep glowing air |
| Pearl mist (`pearl`) | a milky world of slow veils | the colours of oil on water sliding over it |
| Stardust (`dust`) | no ground, only loose dust in the stippled print of the void and the wisps: thick in slow swirls, sparse between; its grains keep their size on the screen, as the print's dots do | grains catch the sun along its edge, a few twinkle |
| Twilight (`twilight`) | one face always to the sun, scorched and cracked; the back frozen; a green band of life with small seas round the edge between (the zones follow the sun, not the ground, so all three show on the face we see) | a ring of cloud where the warm air meets the cold |

- **A planet's kind** is its owner's pick (`drawers.look`), or one from its id. **A new planet or moon is given a kind its owner's galaxy doesn't show yet** (`fresh_look` in `mutt/api.py`, saved in `drawers.look` when it is made, autosort's new planets too): only once all fourteen (or all ten moons) are shown does one repeat, the least shown first; a moon first differs from the moons beside it. Ties go in a set order (`FRESH_PLANETS`, `FRESH_MOONS`) so new neighbours look unlike each other. The owner can still pick any kind, or Auto. Planets made before there were twelve draw from the first eight, so none changed by itself (`twelve` from the server, `lookOf`); later ones draw from all fourteen (none had yet, so Stardust and Twilight changed no planet). Moon rock is gone; those planets are Pearl mist. Moons are their own ten real moons and did not change.
- **Colour.** A kind is four colours (`PALETTES`), each leaning a set amount toward the planet's own colour, then pushed (`rich`). This is the one place raw colours are typed outside `tokens.css`.
- **Type and colour are one box** (2026-11-16, the user: "merge planet color into planet type by making it so you can click the planet again and again to change the color and you just press outside of the window to go back"). Pressing the world on a planet's page (or `Planet type…` in its ••• menu) opens the dialog `Planet type`, with the line "Press the chosen type again for another colour." over a grid of small worlds: Auto (its note the kind it draws), then every kind, each painted in the planet's colour. Pressing a type makes the planet that type at once and the box stays open; pressing the chosen one again gives the planet the next of the eight planet colours (`PALETTE` in `util.js`, round and round; a colour picked before, not among them, goes to the first). Every small world, the big one and the page's tint follow at once, and the change is saved behind it, one save at a time (`showLook`, `saveLook` in `views/planet.js`). Pressing outside the box, or Escape, puts it away; nothing needs confirming. There is no other colour picker and no free colour any more. A moon's box is unchanged: moons keep their real colours, so pressing one picks it and closes.
- **Light.** One sun, upper left. A crisp edge between day and night, a warm last light along it, and a thin glow of air on the lit side only, painted in a picture 1.12 times the ball (`AIR`) so nothing clips it. No highlight laid over the ball, no halo behind it, no drop shadow: those belong to the plain painter only (below).
- **Sharp.** Painted at the screen's own sharpness, up to 2 pixels a point on a computer and 3 on a phone (`sharpness()` in `util.js`); on a phone each globe is small, so the extra pixels cost little and keep its weather from looking pixelated.
- **Size** grows gently with its files (`planetSize` in `planets.js`, before the galaxy's zoom): 120 across when empty, plus 8 for each step of the square root of its files, so about 145 at ten, 160 at 25, 200 at 100, and never more than 220. Made gentler on 2026-11-16 at the user's word ("a bit too drastic"; it was 112 plus 13 a step, up to 280).
- **It turns** once in about a minute (40 to 75 seconds). Pointed at, it rises 3 and swells to 1.09 on `--ease-spring` and spins up a little (`nudge`), then coasts down. Each world's weather keeps its own clock, faster on a busy world.
- **Rings** are on any kind of planet that holds ten files or more, and on no other. They lie round its middle, lean as it leans, and the painter casts their shadow on the world. **Their look** (redrawn 2026-11-16, the user: "they look weird now, and oddly duo tone… make them match the planets subtly"): one colour, the planet's own light colour dusted toward `--paper` (`--ring`), never two; many fine ringlets of different strength in it (a faint inner ring, a bright broad one, a clear gap at 1.63 of the radius where the painter's shadow has its gap too, a middling outer ring with a faint thin gap, a faint edge). The half behind the globe and the half in front are the same strength, so the ring never reads as two tones; brighter on the sun's side, dimming to a little over half away from it, and the globe's shadow dims the back half away from the sun. CSS only (`.planet-ring` in `galaxy.css`), nothing painted.
- **Locked**, a world is clouded over by the painter with the set's lock on it. A private one is a blur.

**Files on a world.** Cards in a belt round the middle (two belts past six files), at most 60 tall of the map's 256. Weather parts round them, dust settles on them, and they stay softly lit on the night side. Each kind of file has its own small drawing, so a planet's use reads from the galaxy; words are bars, because nothing here is meant to be read, only told apart.

| A file | Its drawing (`FACES`) |
| --- | --- |
| a picture, a video | a print with a pale border (a video's has a play mark) |
| a note | paper, a heading and lines |
| a checklist, and every note on a list planet (three to a card) | rows: a tick box and its words |
| a recipe | an index card: its name over a red rule, ingredients beside steps |
| a book | its cover, with a spine |
| a long note, and every note on a desk | a cream page, centred title, paragraphs |
| a link | a small window with its bar |
| a PDF or other paper | a white sheet with a red tag |
| a sound | its shape as bars, on night |
| anything else | its kind, in a colour |

**Use.** A planet shows how used it is, to everyone who can open it. What counts: a file added to it or changed on it (`planet_use` in `mutt/api.py`, from times Mutt already keeps). The scale: busy for a day (1), calm by a week (0.5), the first dust at a month (under 0.385), all of it at three (0). Busy is more weather, faster, and brighter light of its own; forgotten is no weather, thin air, drained colour and a coat of dust over ground and files. When something lands on a dusty world the dust lifts as weather does (2.5 seconds, once): a wind gets up, the coat breaks into patches and streams off as dust in the air, and the weather comes back behind it (`wakeUp`). Still shows the state without the movement.

**Moving planets.** (A constellation moves the same way, "Constellations".) A planet is carried by its name to a free place on an orbit (the guide and the ghost show where: the ghost is the drop ring, still and faint, the planet's size). Tidying lays planets on five orbits; a carried planet has nine to land on, one between each two of those (`SNAP_ORBITS`; the user asked for more rings, 2026-11-16). On a laptop-sized screen the room above and below the void is one planet tall, so the in-between orbits add places mostly at the sides. Carried over another planet, the two change places when you let go: the other one wears the drop ring as a planet does when something is about to land on it, and the ghost sits on its place (`planetOver`, `place(…, also)` in `views/galaxy.js`).

**The galaxy on a phone: the ring** (2026-11-16, second pass; the user chose "rings that turn" and asked for every phone from the SE to the Pro Max, the 13 mini being the smallest that must be good). Under 640 wide the planets ride one ring round the void: the computer's rounded orbit (ORBIT_P), as tall as the screen and wider than it, so its two ends run off the sides. An arc of planets shows above the void and one below, and the whole galaxy fits one screen: it never scrolls. **The order is the computer's** (muscle memory): the planets above the void there go left to right along the top arc, those below right to left along the bottom one, so each planet is on the same side of the void as on the computer. The ring's order comes from the computer's layout at 1440 by 820 (`deskSpots`), saved places and all.
- **Few planets** (each arc's planets fit on the screen): each arc holds its own, centred, and the ring holds still; a row too full hands its end planet round to the other arc.
- **More planets**: they are spaced round the whole ring, each with the room its name needs, and a **swipe sideways turns it**, like a wheel (below the void, moving right turns it the other way). Letting go, it glides on with the finger's speed and settles on a spring (`DUR.move`, the spring of "Planets") with the top row tidy: a planet in the middle, or two either side of it (`restOf`). A turn that moved suppresses the tap it ends with. The turn is kept for the page's life (going into a planet and back finds it as it was). Tab to a planet the ring has turned away turns it into view (`ringShow`); Shift+Left/Right moves the focused planet one place round. Up and down still scroll out to the universe. Under Motion: Still it jumps.
- **Sizes**: a planet on the ring is 60 to 100 across by its files (`ringSize`, times the screen's height over 640, kept 0.92 to 1.12), whatever the zoom. On a short screen, or under a comment note, the planets give up to a fifth of their size before the void shrinks (a little more on a phone shorter than a 13 mini). The void is a little smaller beside the ring than it was: its radius is the screen's width × 0.115 or height × 0.085, the smaller, 38 to 92 (`voidRadius`), so a wide phone's void doesn't crowd the planets and stars to the edges. A planet shrinks to seven tenths of its size at most (a little less on the shortest screens) so the biggest still fits between the void and the edge, and a turning ring is judged with its biggest planet at the very top and the very bottom, so no turn can push one under the bar or off the foot.
- **Stars** keep to the band between the two arcs, the newest nearest the void, the sides first (`phoneStarSpots`); as many as fit there show, the last place being "+N". Only loose stars count toward that: a constellation's stars always show with their figure.
- **A constellation** rides the ring as a planet does, in a room the size of a big planet (up to 200 by 100), its stars at least 1.7 chips apart; if its figure comes out tall it may lie on its side, whichever is lower.
- **Moving a planet**: carried onto another planet, the two change places (on the ring and on the computer: their saved places are swapped); let go anywhere else, it goes back.
- A comment note at the top takes its height off the screen first (`notes:room`). The Universe cue sits under the bottom arc with room to spare.

**Threads: planets that share files.** When a file is on two planets, a wisp joins them, so a galaxy shows how its planets are tied together. Decided with the user on 2026-11-15: "spacey wispy connections, not digital lines".

- **What it is: print.** Two to four fine strands of dust that twist round each other, part in the middle and gather at the ends, wandering in width, thinning and returning along their length, with a faint haze and a few loose motes round them; each fades out into the air of the planet at either end. Brighter is more dots, never bigger ones, and never a glow or a line. One painter draws it everywhere: `wisp()` in `uvweb.js`, the same for planets (`views/galaxy.js`) and for galaxies (`paintWeb`). Each wisp has its own seed, so it is the same wisp however its planets move.
- **Where it goes.** A gentle bow from the edge of one globe to the edge of the other, on the side away from the void, bowed just enough to clear it and kept inside the page (`threadCurve`). One that can't clear it (a planet above the void and one below, on a phone) passes behind the void. Behind the void and the planets; in front of the sky.
- **How much.** Fuller (more strands, wider) the more files the two planets share: 1, 2 or 3, 4 or more. A moon's files count as its planet's.
- **At rest** it is faint and still (`--thread`). **A planet pointed at or focused** paints its own wisps stronger (`--thread-on`) and shows how many files each carries (`2 files`, a Fact in `--ink-2` with `--sky-shadow`, just off the wisp's middle, on the outside of its bow). A screen reader hears the same on the planet (`aria-description`: "Shares 2 files with Holiday").
- **Who sees what.** Everyone who can open both planets sees the wisp, on their own galaxy and on anyone else's. A wisp never leads to a planet the viewer can't open (private, locked, or People they aren't on); the server leaves it out (`planet_threads`).
- **Cost.** One canvas, only as big as the wisps reach, repainted only while planets glide or are carried and when a planet is pointed at; nothing runs at rest. While planets glide it is painted again only when an end has moved, its counts and the planets' screen-reader words are written only when they change, and it stops following a few pictures after the planets land. It fades with the planets' names on the way out to the universe, and dims with them while the void is open.
- **Between galaxies.** In the universe, two galaxies that share files (a file on someone's planet that others can add to, or a copy one person saved from another's planet, both on planets the viewer can open) are joined by a fainter wisp instead of the web's thread, and seated side by side on the map: the one sharing most with those already seated takes the free place nearest them, then each pair is drawn a little closer where nothing else is in the way; yours stays put and everyone else keeps to A to Z (`seat`, `gather` in `views/galaxy.js`; `galaxy_links` in `mutt/api.py`).

**Opening a planet** from a galaxy is a dive: the galaxy rushes past from where the planet is, the planet swells toward you and settles at the top of its page. Coming back is a pull away. Between two planets, pages just change. (`router.js`, the rules headed "Opening a planet" in `galaxy.css`; its lengths and curves are the named ones: the galaxy leaves over `--dur-arrive` on `--ease-leave`, the planet travels and swells over `--dur-scene` on `--ease-glide`, its page fades in over `--dur-arrive` after `--dur-move`; coming back the page fades over `--dur-change` and the galaxy closes in over `--dur-scene`. The user watched a sketch of it in session 8 and kept it as built.)

**Swiping out of a planet** (touch screens, asked for 2026-11-16, "not too sensitive"): once a planet's page is at its end, or too short to scroll, a swipe up lifts the page back toward its planet, and letting go far enough up is the pull away to its galaxy. Far enough is about a third of the screen (180 to 280 points), or a flick past half of that; anything less settles back. It never starts while the page still scrolls, on a sideways or downward move, with two fingers or pinched in, on something that takes a finger itself (a text box, a player, the board, a list's grip), or while anything is open on top or a file is being carried. No sound of its own: the pull away says it. (`swipeout.js`, started from `main.js`.)

**Without the painter** (no WebGL2, or `?flat=1`): the plain painter wraps a flat picture round a ball, with the same cards. It has no kinds beyond colour, no weather and no use. Keep it working; don't grow it.

**To add a kind of planet** (show the user a sheet first: the kind large, at galaxy size and at the smallest, beside its neighbours):
1. Add `{ id, label }` at the END of `LOOKS` in `planets.js` (the order is the painter's) and its four colours to `PALETTES`.
2. Add its branch to the painter's chain in `planetgl.js`, before the moons, with the next number, and move the moons' numbers up by one (they follow the planets; `LOOK_INDEX` in `planets.js` counts them the same way). A branch sets `col` and may set `cloud`, `cloudC`, `spec`, `atmo`, `atmoC`, `glow` (light of its own), `nightGlow` (light only in the dark), `limb`. Use `busy` and `calm` for what should follow use. Give it one effect no other kind has.
3. Add the id to `PLANET_LOOKS` in `mutt/api.py`.
4. Raise the two colour lines in `tests/expected/drift.txt` by hand (a palette is the one allowed place), after telling the user.
5. Add its row to the table above.

**To give a new kind of file, or a new mode, its drawing on a world**: add a drawing to `FACES` in `planets.js` (map pixels; bars, not words; colours from `INK`), a line to `faceOf` saying which files get it (a mode decides through `planet.modes`), and, if the cards should be taller than wide, its name to `UPRIGHT`. If the mode changes what the galaxy must know, add that mode's flag to the texture's key in `textureFor`. Add its row to the table above.

### Stars

A star is a file on no planet, kept round the void on its owner's own galaxy (`renderStars`, `layout` and `nearStars` in `views/galaxy.js`; the section of `galaxy.css` headed "stars"). It is the file's own face (`fileFace`), so it never needs a drawing of its own, and it belongs to the painted scene, never laid over it like an app's icon. Chosen by the user on 2026-11-16 from four drawings (lit cards, a stippled print, points of light, Vita bubbles; `/Users/edan/Mutt-notes/design/stars-2026-11-16/`): **points of light that open into lit cards**.

- **At rest, with a mouse: a point of light.** The face shrinks to 0.42 of the chip and turns round (its words and the folded corner hidden), so a note is a cream point and a picture a point of its own colours. Its light is a sharp rim (`--star-halo`) and a soft glow round it (`--star-glow`, a gradient on the same box as its four faint rays in `--star-blue`, turned by its tilt). The glow was once two blurred shadows, which Safari painted again on every picture of a page change; each star is also its own layer (`will-change: transform`), so going back to a galaxy whose stars are photos went from about 45 to 58 pictures a second (2026-11-16). Points further from the void are dimmer (brightness 1 beside the void, down to 0.62 at the outer edge, by `--near`). The halo is the star's light, part of the sky like the sky's own stars, not a glow on a control.
- **As the pointer comes near: a card.** Within three chips of the pointer a star opens (`.is-near`), and it goes back to a point past four, so it never flickers at the edge. The card has corners `--r-mark` (4) like paper and sits on `--shadow-rest`. It is lit from the void's light, which is the light in the middle of the galaxy: a soft-light wash from `--star-white` on the side facing the void to `--night-deep` on the far side (`--out`). It leans a little, as if caught in the swirl, up to 9° either way and always the same way for the same file (`--tilt`, from its id). It is smaller and dimmer the further it is from the void (0.78 to 1.06 of the chip, brightness 0.66 to 0.96, by `--near`). These are the files on a planet's belt, off the planet.
- **Pointed at, or reached by the keyboard: lifted.** It is straight, at 1.6, at full brightness, with no wash, on `--paper-shadow`, and its tooltip gives its name.
- **On a touch screen** (no hover) every star rests as its card: there is no pointer to come near.
- **Out towards the universe**, and while something is being carried, they all rest.
- Opening is `--dur-move` on `--ease-settle`; going back to a point is leaving (`--dur-change` on `--ease-leave`). Nothing moves at rest.
- **A voice note** (Speak to the Void) rests as a bright point with 24 rays round it, their lengths its sound's loudness from start to end (`raysOf` in `planets.js`, a mask over `--star-white`, in place of the four faint rays); its card is night glass (`--night-mid`) with its first words, its sound's shape along the foot and its length. While its words are being read it breathes on the quick beat.
- **More stars than fit**: a computer shows up to 240 round the void, a phone 18 (the newest 17 and a "+N" in the eighteenth place). "+N" is a round of clear glass the size of a star (`--gloss-clear` on `--clear-fill`, a 1px `--edge`, `--gloss-light`), its number in Caption 500 `--ink-2`; pressing it shows them all. On a phone a star is 36 across (a found file in search 44), whatever the zoom. A star's card is too small to split a word well, so a word longer than its line runs to the paper's edge instead ("Remembe r:" was the trouble).
### Constellations

A few of your stars joined in your sky, with a name: a light way to group files without making a planet (`js/constellations.js`, the rules headed "constellations" in `galaxy.css`). Decided with the user on 2026-11-16.

- **What it is.** Two to twelve stars that leave the cluster round the void and sit together as one figure out in the sky, laid out among the planets as if it were a small planet (it takes a place on the orbits, or a row on a phone, and planets being moved keep clear of it). Its stars stay the stars they were (the same small boxes, opened, right-clicked and carried the same way), and its files stay stars everywhere else: counts, search, the Download's `Stars` folder (in a folder of the constellation's name).
- **Its figure.** A chain that bends and now and then branches, as constellations are drawn, from the constellation's own seed, so a star added leaves the others where they were. Stars about two and a half boxes apart (2.9 × the star box; drawn closer when a big one would not fit, never closer than 2.2).
- **Its lines are wisps**, the same print as the threads between planets (`wisp()` in `uvweb.js`), finer: three strands, from the edge of one star to the edge of the next, with the faintest of bows. Faint at rest (`--thread`), stronger (`--thread-on`) while its name or one of its stars is pointed at or focused, and while it is being offered as a planet. Brighter is more dots, never a glow.
- **Its name** sits under it as a planet's does (Label, `--ink`, `--sky-shadow`) with its count as a Fact (`3 stars`). Pressing it opens its menu: Rename, Make it a planet, Break up.
- **Moving it** (the user, 2026-11-16: "allow moving constellations"). It is carried by its name, as a planet is (the `move` cursor; a finger holds a moment first), and its stars and wisps come with it as one, a little behind the pointer with the planet's weight, its wisps lit. It lands as a planet does: on a free place on the orbits (the guide and the ghost show where), or the nearest clear place; let go, it and its stars glide there together over `--dur-scene`. On a phone's ring, carried onto a planet (which wears the drop ring), the two change places. Shift and an arrow key on its focused name move it to the next free place that way. Its place is kept with the planets' (`PUT /api/galaxy/layout`, its id `sky:<id>`; `constellations.x`/`y`), and the first thing moved by hand on a galaxy keeps every planet's and constellation's place, so nothing else wanders. A star carried out of it still leaves it, as before.
- **Joining.** Carry a star over another: the one under it wears the drop ring, and the tooltip above it says what letting go does ("New constellation", or "Join Sailing"); the carried star's own name waits meanwhile. A star needs to be let go right on another to join (8 past its edge), so a star carried across the cluster to a planet doesn't join on the way. Two loose stars make a new constellation; a star let go on a constellation's star joins that one (leaving any other it was in).
- **Naming.** When two stars first join, a small panel opens under the new name with an empty text box ("Name this constellation", Name it). Left empty, or closed, it is called "Constellation".
- **Taking one out.** Carry it away from its figure and let go in the open sky (let go on its own figure, it stays), or "Take out of …" in its menu; a toast says so with Undo. A constellation left with one star ends. Break up (with Undo) lets all its stars loose.
- **Becoming a planet.** At four stars (the user's number), the offer box (`modeOffer`, its drawing `sky`) comes once, at the foot of the screen above "Universe", with the constellation's wisps lit so it's plain which one: "This constellation could be a planet" / Not now / Make it a planet. Not now is remembered; the menu keeps "Make it a planet". Accepted, its stars draw together into a point over `--dur-scene` on the glide and a planet of the same name is born there (on a galaxy arranged by hand it takes that place), holding the files in the constellation's order.
- **Who sees it.** Only its owner, on their own galaxy, as with the stars themselves. Nothing about it is sent to anyone else.
- **Keyboard.** A star's menu has "Join with another star": it wears the drop ring, still and fainter, a toast says how, the arrow keys go to the nearest star that way (the drop ring, turning, and focused), Enter joins, Escape stops. A click on a star while picking joins too. Screen readers hear "In the constellation …" on each of its stars and its name and count on the name.
- **Phone.** Hold a star to pick it up, as before. On a phone the figure keeps inside the width (it is drawn closer together first).
- **Still.** Nothing moves; the figure, its wisps and its name are simply there.
- **Cost.** One small canvas per constellation, only as big as its figure, painted when its shape changes and when it is lit or dimmed (under a thousandth of a second to repaint). Nothing runs at rest; nothing is copied from one canvas to another.

### Kept together and beaming

Two ways of sharing with one person (2026-11-16, built from `design/concepts/10-binary-planets.html` and `11-transmissions.html`; never call the second "transmissions").

**A planet kept together** (`drawer_keepers`; `pair` icon), called a **shared planet** in every word a person reads (2026-11-16, the user: make it clear that adding people can make a shared planet with them). It is in both people's galaxies, each placing it where they like. It is marked by a faint glow, words and the `pair` icon at 12 (made clearer at the user's word, 2026-11-16: "just a faint small glow and threads connecting the planet between both users"):
- *Made with someone* (2026-11-16, the user's pick of the ways offered): "Make a planet with Rae" starts from the person, skipping the Share panel. Where: on Rae's galaxy, pressing "Rae’s Galaxy" in the bar opens Rae's person sheet, whose last row, Together, is a button "Make a planet…" with the `pair` icon (its tooltip and spoken name "Make a planet with Rae"; the row and the sheet already say who) (on your own galaxy the name still opens the account sheet); on one of Rae's files, a quiet small button beside Save in the file view ("Make a planet with Rae"), a row in its ••• and right-click menus, and a row under "Keep as a star" in Save to ("A new planet with Rae…"); on something Rae beamed you, the first row of "Put on a planet" ("A new planet with Rae…"). Each opens one dialog (`planetWith` in `keeping.js`): "A planet with Rae", the line "A shared planet sits in both your galaxies, and you both add to it and arrange it. Rae is asked first; until then only you two can see inside." (plus "It starts with “name”." from a file or a beam), a name box ("Name it"), Cancel / main `pair` **Make it with Rae**. The planet is made shared with Rae by name (People), with no first-visit sharing tip, and Rae is asked at once; from a file it starts with a copy of it, from a beam the beam is kept on it. Toast: "Made “Birds”. Rae is asked to share it with you" with See it. At most three such asks wait for one person at a time.
- *On a galaxy*: a faint, small glow round the globe (`.planet-twin`: 16% past its edge, 26% strength, still) in the colour of the one it is shared with (`nameColor` of their username, the same colour everywhere their name is shown), and in the caption, before the count, `pair` in that colour and "with Rae" in `--ink-2` (seen from this galaxy: on Rae's galaxy it says "with Sam"; `pairWith` from `/api/galaxy`). Never a second light or anything that moves.
- *On its page*: after the sharing fact in the header, `pair` and "with Rae Okafor" (a visitor: "Sam Ray and Rae Okafor").
- *Share panel*: under who can see it, a section like its others, always headed by what it makes. Once kept: "Shared planet" / "With Rae Okafor. It’s in both your galaxies, and you both add to it and arrange it." Asked: "Shared planet" / "Waiting for Rae to say yes. Then it’s in both your galaxies…", a row "Asked Rae" with a quiet "Take back". For anyone who already shares it (added files, or named under People): "Make it a shared planet" / "Share it with one of them: it goes in both your galaxies, and you both add to it and arrange it. They’re asked first." and a row per person with a small `pair` **Share planet** button. People picked with no one in it yet: "Make it a shared planet" / "Add someone above, then you can share this planet with them…", so the way is said before anyone is added.
- *The ask* reaches the other person on their own galaxy as a tip, the same tip and place as the recovery key's (`.tip.key-tip.keep-tip`, `keeping.js`), one at a time, never over another tip: "Sam wants to share “Japan trip” with you" / "A shared planet sits in both your galaxies, and you both add to it, arrange it and share it." / main **Yes, share it**, quiet **Not now** (put away; asked again only if Sam asks again after a week). Yes: "“Japan trip” is in your galaxy now, shared with Sam"; Sam hears "Rae said yes: “Japan trip” is a shared planet now".
- *News* (they joined, left, changed who can see it, deleted their account) is a toast with "See it", once, on the next visit to your galaxy.
- *Leaving* is "Leave planet…" (`takeoff`) in its ••• menu, where Delete would be (a kept planet can't be deleted). Both keep everything: the one who leaves gets a private planet of the same name with their files and copies of the other's.
- *The universe*: the two galaxies sit side by side (what they keep joins them strongly), and the planet is drawn once, between them, always, yours too (`.uv-kept`, `keptBetween` in `views/galaxy.js`): in the middle of the gap when there is one (4 of its widths or more), else just outside the pair, beside the line between them on the side away from everyone else, clear of both galaxies and their names. The two galaxies' thread runs through it: a wisp from each galaxy to the planet in place of the one between them (`via` in `paintWeb`, `uvweb.js`). It has a faint glow on each side, toward each galaxy, in each one's `nameColor` at 24%. When one of them is the galaxy whose page it is, that planet fades from the page as you pull back while the one between them comes in (`leaveHome`). Someone who can't open it sees each galaxy's own blurred stand-in, as for any planet they can't open: nothing says two people share it.

**Beaming a file** (`beams`; `beam` icon). One of your files, sent to one person with a few words; it stays yours until they answer, and you are never told which answer.
- *Out*: "Beam to…" second in a file's menu, just under Open, and a **Beam to…** button (`beam` icon, `.btn`) first in your own file's view (`.vw-actions`): it is found by being seen, never by a tip (the user, 2026-11-16). Both show whenever there is anyone else in Mutt (`canBeam`; before, only once you'd crossed paths with someone, and new people never knew it was there). Also wherever a mode shows a file its own way: a cookbook's card (its right-click menu and the open card's •••) and the document editor's •••. A dialog: "Beam “name” to…", the line "It waits for them until they save it or decline it.", a search box, the people rows of People sharing (`.pp-row`, the name they go by then a faint @username: everyone, in a list that scrolls, those you've crossed paths with first, nearest first, then the rest A to Z; typing narrows it), a two-line box "A few words, if you like" (140), Cancel / **Beam to Rae**. Then the journey (below), then a toast "Beamed to Rae" with Undo.
- *Sent as it was shown* (2026-11-16, the user: "they receive it in the format it was beamed out and they can save it as a star"): beamed from a cookbook it is a **recipe card**, from a desk or the editor a **document**, else what it is (a note with a card is a card, one with a document's pages a document) (`beams.form`). It arrives in the box as that: the cookbook's own card (`recipeCard` in `cookbook.js`, with its dish photo) or the desk's own first page (`docPaper` in `docs.js`, 200 wide, its word count under it in caption type). Kept, the copy is still that: a card keeps its dish photo (copied too, never a star of its own while its card is there), a document its pages and pictures. Saving someone's file keeps its form the same way.
- *The journey* (the user chose "every time", 2026-11-16): pressing Beam takes the view out into the universe (on your own galaxy the page scrolls out, from anywhere else it opens the universe), a **light** leaves your galaxy's void and travels to theirs along a gentle bend, and lands in the **drop ring** round their void; then the view goes back where you were and the toast comes. The light is a white point in a soft `--blue-ink` halo (32), with ten dust motes behind it (8, `--blue-ink`, each smaller), one `--stagger` apart (`flyLight` in `beams.js`, `.bm-flight` on `--z-fx`). Anything you do meanwhile (a scroll, a click, a key) ends it where you are. While it travels the universe's tips (your name) wait (`html.is-beaming`). Under Still there is no journey.
- *Coming in*: the first time a beam is seen on a device, its pile waits hidden while the same light crosses the sky from just past the screen's edge, the way the sender's galaxy lies from yours in the universe (`towards` in `views/galaxy.js`), and the pile lands with the drop ring as it reaches it. Each beam comes in once (`mutt:beams-landed:<username>`); a quiet pile never does.
- *In, by the void*: a pile per sender rests just outside the void where the stars begin, up and to the right (on a phone, in a row below it): the first file's face as a star card (38, corners `--r-mark`, turned 6°, `--shadow-rest` with the star's halo), a count in the planet bubble's blue when there are several, and under it "from Sam" in caption type on the sky's shadow. A new pile lands with the drop ring once (below). From someone never met here: one quiet pile, dimmer, its count in a well, tagged "waiting quietly", no ring and no note.
- *In, under the clock*: a note like a comment's, "Sam Ray beamed you <name>" (or "2 files") and their words; pressing it opens the box, × only puts the note away.
- *The box* (a dialog) wears a **border of dust** (the user, 2026-11-16: so it matches the design language): the drop ring's print laid round its rounded edge, wandering 14 out, dotted by the drop ring's own tile over `--thread-on` at 0.8, arriving with the box (`dustFrame` in `uvweb.js`, `dustBorder` in `beams.js`, `.bm-frame`; made for the box's size and again when it changes). "**Sam Ray** beamed you a file" with the time; for a stranger, a caption line "You haven’t crossed paths here before. If you leave it, it goes in a month."; the file box (200 wide, no buttons); their words in italic, centred; `1 of 3` between small round `chevron-left` and `chevron-right` buttons when the pile has more; a caption line, centred, "It isn’t yours until you save it. If you decline, they aren’t told."; then the three answers **stacked, full width, in this order** (the user, 2026-11-16: "make it clear that you can save as star, save to planet, or decline"): main **Save as a star** (`star`; toast "Saved as a star in your galaxy" with Open), **Save to a planet** (`onto`, a planet list headed "Save it to"; toast "Saved to Walks" with See it), quiet **Decline** (`close`; toast "Declined" with Undo). Under them a quiet "Stop beams from Sam" (a confirm, red, then "Sam can’t beam you any more"). The same on a phone.
- *Stopped people* are a door in the account sheet, "Beams you stopped", shown only once there is someone, each with "Let them beam".
- *A kept copy's* file view says "Beamed by Sam Ray (@sam)" and "Their words" to its owner; to anyone else it is any saved copy.

### Throwing

A star on the galaxy, or a file box on a planet's page, flicked at a world flies there (Throw to Sort, the user's idea 06, built 2026-11-16 in `js/fling.js`; `drag.js` for stars, `grid.js` for boxes). It is a quicker drop: carrying something onto a world still works as before.

- **A flick** is letting go while moving at 900 points a second or more over the last 80 thousandths of a second (a pointer held still for 60 before letting go was put down, not thrown).
- **Aim helps.** The world nearest the line of the flick, within 28° either side (widened by how big it looks), is the one meant; nearer wins a tie; only what is on screen counts. Planets ring the void, so a throw at one often crosses it: **a world in line wins over the void**, which takes only the throws no world is in line with. A flick that starts over the void (stars sit close round it) and is aimed at a world beyond still flies there.
- **What it can be thrown at.** A star: a planet, a moon, or the void (where it is sorted as a star let go there is). A file box on a planet's page: that planet's moons; on a moon's page, its planet. Never at a star.
- **The flight** (Motion, "A star or file box thrown"): it keeps its own speed and is steered more and more toward the world, pulled a little toward the void on the way; within 2.2 of the world's radius it is caught and swings at most three quarters round it, closing in. The swing waits for the server, so the landing is the picture of something already done. The world's **landing ring** is the drop ring spreading once from 0.62 to 1.12 and fading (`.is-landing`), then the world gulps as for a drop.
- **Says** "Put on Walks" with Undo (on the galaxy; a star taken back returns to its place among the stars and to its constellation if that still exists), "Moved to Glazes" with Undo on a planet's page, as a drop does.
- **A throw at nothing** comes home (Motion, "A throw at nothing"). **One that couldn't land** (offline, or the world won't take it) comes home and a toast says why ("Mutt couldn’t be reached, so it stayed a star.").
- **Touch**: the same, after the hold that picks a thing up. **Keyboard**: nothing new; moving with the keyboard is the menu's "Put on…". **Still**: no flight; it is there once the server answers.
- **Home as a star** (the user, 2026-11-16: "drag a file to the top left to send to galaxy as a star"). While one of your own files is carried (or thrown) on a planet you arrange, the back arrow in the top-left corner is a target too (`skyTarget` in `collection.js`): it turns into the `star` icon at full strength, and a line on the tooltip's glass beside it (on a phone, just under the bar) says what letting go does: "Drop to make it a star" when this is the file's only planet, else "Drop to take it off Walks". Over it, the arrow wears the drop ring (−32%) and the line turns `--ink`; let go, the box shrinks into it as into a moon, it comes off this planet, and the toast says "Now a star in your galaxy" (or "Took it off Walks") with Undo. Afterwards the arrow is an arrow again. Someone else's file on your planet never sees it.

### Speak to the Void

Press and hold the void, talk, let go: the recording becomes a star, and its words are written out on the device (the user's idea 19, built 2026-11-16; `blackhole.js` for the hold, `views/galaxy.js` `holdVoid` / `letGoVoid` / `keepVoice` / `readVoice`, `voice.js` for recording, `hear-worker.js` for the words, `mutt/hear.py` on the server). Decided with the user: the small English reader, the void's "To" decides where it goes, rays shaped like its sound.

- **Holding.** Pressed for 450 thousandths of a second without moving more than 12, the void listens (a shorter press is a click, as ever: it opens the add box). With the keyboard, hold Space on the void; a tap of Space opens it. On a phone the page doesn't scroll and no menu comes while it is held.
- **Listening.** The plus steps aside and the label counts the time (`0:07`); the light swells and breathes with how loud you are (`voidart.js` `listen`, `loudness`); the sky's stars lean in a little; music, if playing, goes quiet. **One short line** from the void (`.void-say`: the tooltip's glass, Caption `--ink-2`, kept within the void so a phone's ring of planets is never under it) says what letting go does: "Drag up to let it go" (a mouse), "Slide up to let it go" (a finger), "Esc to let it go" (Space). Sliding up past 1.6 of the void's radius turns it to "Let go to drop it" in `--ink`.
- **Letting go** keeps it: the void gulps and a new star arrives (or the file goes where the void's "To" says, below). Let go after sliding up, or Esc: "Dropped. Nothing was kept" under the void. Under a second: "Too short to keep". Five minutes: it lets go by itself.
- **The first time** the browser asks for the microphone, and "Hold to talk. It stays on your device." shows under the void while it asks. A phone needs the finger lifted to answer, so that hold is lost; "Now hold the void and talk" says so. Turned off: a toast says how to turn it on in the browser's settings for this website. No microphone, or busy: a toast says that.
- **The words** are read on the device by Moonshine Tiny (English, Useful Sensors, MIT licence; 28 MB, fetched from Mutt's own server the first time a recording is read, kept by the browser after that, let go 45 seconds after its last job so a phone gets its memory back). A recording is read in pieces of at most 20 seconds, cut at the quietest moment. Only the words are saved (`meta.heard`), and the name is the first words of the first sentence, six at most. Nothing is sent anywhere to be read. A page closed before the words came is caught up the next time the galaxy opens (`/api/hear/todo`, three at a time).
- **What was said** shows beside the new star for a slow beat on box glass (`.gx-said`: the words in Body `--ink`, "Read on this device · 0:07" as a Fact); pressing it opens the file.
- **Where it goes.** The void's "To": a star stays a star; a planet: straight onto it; Autosort: born a star, its words read, then it flies from where it sits to the planet chosen, with the usual "Sent to …" and Move. No words heard: "No words were heard, so it stayed a star."
- **In the file view**: "Voice note · 0:07", the player, and the words, which its owner can correct (a plain text box, saved when it loses focus); "Words read on the device it was recorded on". Others see the words as text.
- **Still**: nothing breathes or swells; the lines and the star simply appear.
- **Cost.** Nothing is fetched until the void is first held (`voice.js`), and the reader only once a recording is kept. While listening, one loudness reading a picture. The reader runs off the page's thread: 3.7 seconds of speech read in about 1.3 seconds the first time, 0.2 after, in Safari's engine on a computer.

### Comets

**A comet is a reminder you can see.** Write a note with a day in it, press "Make it a comet", and from then until its day it crosses your own sky; on its day it reminds you (`js/comets.js` paints it, `js/remind.js` does the reminding, the rules headed "Comets" in `galaxy.css`; the days are read by `mutt/when.py` and kept in `reminders`). Built 2026-11-16 from the design board's idea 12; the user chose the look and every answer below. **Its name is always "comet"** (the user: "call them comets when possible, but make sure it is known that they are reminders"), and every place that names one says it reminds you: "a comet can remind you", "A comet will remind you", "A comet reminding you: …", the notification's "Reminding you: …".

- **Made, not found** (the user: "once you add a date/time you can click to make it a comet/reminder"). A note never becomes a comet by itself. **Nothing offers one while you type** (2026-11-16, the user: "get rid of the comet nudge while typing in the textbox because it's janky but keep the others"): the line that came up under the add boxes and the note editor is gone. A note's view has the same offer as a row in its side panel ("“Friday 4pm”" / "A comet can remind you" / Make it a comet), and a list item that names a day has **Make it a comet** in its right-click menu. **Any file of yours** (the user: "I don't see the option to convert anything to a comet") has **Make it a comet…** in its file menu (the `date` icon, after Beam to…): one that is already a comet opens its own menu; anything else opens the **Comet: when** box (section 4), which starts from what its words (or a file's name) say (the user: "it doesn't read what the note says, it just has a default"). Making one says so in a toast with Undo, and the first time asks the device whether it may send notifications.
- **What counts as a day** (widened 2026-11-16, the user: "suggest a comet if you imply a date, time, day of the week or month"). Your own notes, up to 400 characters (a longer one only by its first line), naming any time still ahead: "tomorrow 3pm", "Thursday", "24 Nov", "next Friday", "in 2 weeks", "2026-12-06", "the 20th", "this weekend", "next week", "next month", "end of the month", "in March", "mid-Jan", "in 2 hours", "tonight", "Friday morning" (morning 9, afternoon 3, evening 6, night 8), "pay rent today" (midday, or 6 once midday has gone), and a time alone ("call Mum at 5": today at five, or tomorrow once it has gone; "at 1" to "at 7" is the afternoon or evening). Never a fraction, "Day 1", anything every week or every day, "today I felt…", or a diary's own date. A birthday or anniversary comes round every year. The first day the note names is the comet's; change the words and the comet follows them (a note with no day left stops being one). **A list's items** (the user: "things from a list can also be comets"): a list item that is a comet carries its mark at the end of its row (**List comet mark** in section 4); ticking it off ends its comet and its reminders, unticking brings them back. "Next Tuesday" is the Tuesday of next week (written on a Monday, eight days on); "Tuesday" alone is the coming one.
- **When it reminds you: once** (2026-11-23, the user: "less reminders for comets its a bit much now"; before, "Plus a heads-up" sent one more an hour before, or the evening before). At its time, or 9 in the morning for a day with no time, and nothing before it. In your own time zone, as it was when you made it. Added to a Calendar it has the one alert too.
- **How it reminds you** (chosen "Both"). A notification where the device allows (Safari on a Mac; on an iPhone only once Mutt is on the Home Screen, which a tip says once), with Mutt open or closed. **It looks like Mutt's own** (2026-11-23, the user: "should look professional with the logo and name"): titled **Mutt**, with Mutt's icon (the void, `icon-180.png`); its words are what it is for on the first line and "Comet · today, 3 PM" on the second; one per comet, never a second for the same one. And always a note under the clock on every page, the comment note's shape with the `date` icon in `--comet-ember`: the note's name, "A comet reminding you: today, 3 PM", and **Done** and **Later** (In an hour / Tomorrow). While one shows, the comment notes wait. It stays until answered, or closed. On a phone it is one note across the top, its words kept, and the galaxy makes room under it. Notes step aside while a sheet is open or a room (the file view, the editor) is.
- **Ticked off, it burns up into the void** (2026-11-23, the user: "you can just delete a comet by checking it off and it does a little animation burning up into the void"; before, Done sent it round the void and away over two days, so ticking it seemed to do nothing). Done anywhere (its card's tick box, its menu, its note, the note under the clock) or its item ticked on its list: it is gone from the sky at once. On your galaxy it catches fire first: its label goes as leaving, it is painted again in full `--comet-ember` with a burst of ember sparks from its head (`burst` in `fx.js`), then it falls straight in to the void's middle over scene on `--ease-leave`, shrinking to a tenth and brightening, fading in the last part, and the void gulps (`gulp`: the `take` sound, its ripple, the stars leaning in). Its tails keep pointing away from the void as it falls. Behind a room (its note opened over the sky) it waits until the sky shows again; dealt with elsewhere (on its list) it burns once when your galaxy next shows, within ten minutes. Under Still it is simply gone. Undo brings it back to its place.
- **On its day it waits, burning** (chosen "Waits, burning"). Due and not done, a comet stays at its closest point to the void in full `--comet-ember` until you answer: **Done** (or ticking it off) burns it up into the void; **Remind me later** (an hour, or tomorrow) backs it out a little way so it comes in again.
- **Its menu** (right-click on the comet, the "Comet" button in the note's view): open it as what it is (Open Errands for a list item, Open note, Open picture, Open link…: `cometThing` in `remind.js`; the user: "if a comet is a list item show it as a list item not a note"), Done, Change when… (the **Comet: when** box, set to its day), Remind me in an hour, Remind me tomorrow, Add to Calendar (a calendar file with the same one alert, yearly for a birthday), Stop the comet ("No longer a comet: it won’t remind you", with Undo). Every change has an Undo.
- **Its journey** (the user: "it should progress from when it is added to deadline"; "different reminders have different time frames"). How far along it is is how much of the time from making it to its day has gone. It falls in from the edge of the galaxy along a comet's own path (a parabola with the void at its focus, squashed to the galaxy's oval), closest to the void on its day at its time (noon with no time). **It goes where the sky is open** (the user: "use blank space to place comets instead of putting them in crowded areas"): of 72 ways in, at the galaxy's edge or a little inside it, it takes the one whose head and whole streak keep furthest from planets and their names, the void, the loose stars, the other comets, the notes under the clock and the screen's edges. How big it shows is how far along it is or how soon its day is (within a week), whichever is more, so a comet made today for tomorrow is already close and bright.
- **The look: a shooting star in print** (chosen as "A · Print"; then the user: "the comets should have character and match the interface", "not look like stars, just like a cool looking shooting star"). Two tails always pointing away from the void: a straight streaky gas tail of ten fine streaks, and a broad dust fan curving behind its path with faint bands across it, with a hood of light at its head; each a soft shape punched through the void's own tile of dots (`evenPoints`, `DOT`), laid on so that brighter is more dots. Over the print, crisp, what makes it read at once as a shooting star: **the streak**, a wedge of light as wide as its head drawn to a point two thirds down the tail, white-hot at the head and in its heat colour behind, with a fine bright thread down its middle running nearly the whole tail; and **the glint** at its head, the sky's own flare (`flarePicture` in `sky.js`): a white-hot core in a soft halo and four arms, the long pair across its path, red and blue pulled a little apart like an old lens. It never wears a file's card (tried and set aside 2026-11-16: it read as a loose star). Far out it is small, but never a speck: however far off its day it is drawn at least 0.3 of its full size (`LEAST` in `comets.js`), so a comet made today for next week is a small, plain shooting star; it grows (tail up to 190, 90 on a phone; head 11, 7) as it nears. **Every comet shows** (2026-11-16, the user: "all comets should show up"; before, only the nearest 5 were drawn, 3 on a phone, and the server sent 12), each in the most open sky left by those placed before it: waiting ones first, then the nearest days.
- **Its heat** (the user: "more red/enflamed as the deadline approaches"). Cool pale dust with a little of its planet's colour, through `--star-amber`, to `--comet-ember` on its day: heat is the larger of how far along it is (squared) and how near its day is in the last three days, so a comet made a day ahead still burns.
- **Its tag** (the user: "easily click/hover to see what it's for"; "integrated/readable/distinct"). What the note is for, without its day ("Dentist tomorrow 3pm" is "Dentist"), in Label `--ink`; under it its day in Small mono capitals in the comet's own heat colour ("TOMORROW, 3 PM"; "… · NOW" while it waits); after the `date` mark in the comet's own heat colour: a caption like a planet's, snug beside its head with **no line to it** (the dotted line was taken away at the user's word: "less dashed lines, more Mutt theme"), so it stays within three short steps of the head. It goes where it covers least (not the void, a star, a planet or its name and count, another tag, the notes under the clock, its own head and never across its own streak), first choice the side of the head away from its dust; above or below, it reaches out on the side away from its streak. Within three days of its day it shows by itself (on a phone only the nearest one does, and not if it could only sit over the void, whose middle is the add button there); otherwise it shows while its comet is pointed at or focused. It never has a box or pane behind it (2026-11-16, the user: "dont do the black boxes on the text for the comets"): where it can't help sitting on the void or a planet, the sky's shadow under its words (`--sky-shadow`) keeps it readable.
- **Pointing and pressing.** The area to point at is its head and the first half of its tail, 30 across (40 on a touch screen). Pointed at, it brightens and shows its tag; pressed, it opens as what it is (the user: "if a comet is a list item show it as a list item, not a note; same goes for other formats"): **a list item** opens the **Comet card** beside it (section 4), its tick box and words as on its list, which list, when, and Change when… / Later / the comet's menu, ticking it off there; **anything else** opens over your sky, not on its planet (the user: "open it separately from the planet"), with its comet row at the top of the side panel: **Done** and the comet's menu. **Done ticks it off** on every list it is on, and its Undo unticks it. On a touch screen the first tap shows its tag and the next opens it. Tab reaches each after the planets; a screen reader hears "Comets: your reminders", then each one's name and day.
- **Who sees it.** Only you: your own galaxy, your own notes. Never in the universe or on anyone else's; nobody else can see, make or download one, and a notification carries no words (the device asks Mutt for them). Out towards the universe it fades with the threads, and dims with them while adding or searching.
- **Still.** It is simply there, where it is today.
- **Cost.** One canvas per comet, only as big as the comet, painted when the galaxy is laid out and only if it changed: about a thousandth of a second (the first, which draws the dot tile, about 12). Nothing runs at rest; nothing is copied from one canvas to another after painting. The painting code is fetched only on your own galaxy, once the page is up; the reminding (`remind.js`) is small and loads with the page.

### Drop ring

What shows round a planet, a moon or a star while you carry something onto it, where a moved planet will land, and round the void while files are carried in from the computer. Chosen by the user on 2026-11-16, who found the dashed circles "too perfect": **a loop of dust**, the threads' print bent into a circle.

- **What it is: print.** Three strands of dust that twist round each other a whole number of times on the way round, part and gather in two or three places, wander in width, with a haze and a few loose motes round them (`dustLoop` in `uvweb.js`, beside `wisp()`). Never a ruled or dashed line, never a glow.
- **How it is drawn.** Once, a moment after the page starts (`dropring.js`, `makeDropRing` from `main.js`): the loop's soft strands as one picture, and a small tile of evenly laid dots, the void's own spacing and sizes (`evenPoints`, `DOT`). The stylesheet uses the two as a mask over `--thread-on`: the loop stretched to each ring, the dots never stretched, so a star's small ring and a planet's large one are dotted alike, and 7% shows between the dots as in the void. Until both pictures are in, no ring shows (`html.has-dust`). One rule in `galaxy.css` (headed THE DROP RING); each part sets only how far it reaches (planet −23%, moon −43%, star −32%, the ghost −7%; a world's landing ring after a throw spreads from the same reach, so the loop's middle lies where the old circle did; the void −55%, clear of its own dotted edge, which swells while files are over it).
- **Moves.** Waiting to be dropped onto, it turns once every `--beat-rest`. The ghost and the star you are joining from with the keyboard wear it still: the ghost at half strength, that star at 0.6.
- **Laid round a box** (`dustFrame` in `uvweb.js`): the same strands along a rounded rectangle, their waves as often per length as on a ring a few hundred round; the box of what a beam brought you wears it, still.
- **A beamed file landing** (`.bm-star.is-new`, and `.bm-landing` round a galaxy in the universe as a beam reaches it, beams.js) wears it once: from 45% to 115% of its size over `--dur-scene`, rising in and fading out, never turning. Under Still it is already gone.
- **Round the void** (`.drop-ring`, put there by `ring()` in `blackhole.js` while files from the computer are over the window) it grows in from 0.9 over `--dur-arrive` and fades over `--dur-change`, and turns like the rest. It was a blue ring with a glow until 2026-11-16, matched at the user's word. The orbit's dotted guide is a path, not a ring, and stays.

### The logo

One logo, the Wonky: Fraunces italic 500, `"SOFT" 100, "WONK" 1, "opsz" 144`, `-0.02em` (`.logo-word`; `logo()` in `js/logo.js`). There is no other design and no setting for one.

Its letters flicker through a run of 25 other typefaces and land back, left to right: when Mutt opens, at sign-in as the logo leaves the void (a longer, rougher run), and when it is pointed at (a quick one; the user kept this in session 7). Those typefaces are fetched the first time the flicker plays and never before; only the four letters of "mutt" are downloaded. Never under Motion: Still.

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

Underlined words are not buttons: "Upload", "Retry", "Take off", "Delete", "Delete account" are small quiet buttons. A file of yours taken off its last planet is a star again, and Mutt says so wherever it can happen: a file's menu row "Take off Walks" carries the hint "Becomes a star", and the toast after is "Now a star in your galaxy" (2026-11-16). A word that deletes is grey like any quiet button; red waits for the "are you sure" dialog and a menu's last row (decided in session 3).

### Text box

- **Boxed**: a well, 32 high (40 on touch), corners 8, 12 side padding, 1px `--line-2` edge, 13px words in `--ink`, placeholder `--ink-3`. Pointed at: edge `rgba(190,205,240,.36)`. Typing: edge `--blue-ink` at 80% and a 3px ring of `--blue` at 32% (inside a planet's own things, the planet's colour).
- **Search**: the same, 40 high, corners full, 16 side padding, 14px words.
- **Bare**: for a planet's or file's own name and note. No box; 2/8 padding, corners 8. Pointed at: `--tint` behind. Typing: a well.

### Switch, segmented bar, tick box, chip, stepper, tabs

- **Switch**: track 40 × 24, a well. Knob 20, the pearl, 2 from the edge, travels 16 on `--ease-spring` over `--dur-move`. On: `--gloss-on` over `--accent`, the top light, and `inset 0 0 0 1px rgba(0,0,30,.25)`. Its label is 13px `--ink-2`, 8 to the right.
- **Segmented bar**: a well with corners full and 3 padding, 32 high in all. Each choice is 26 high, 12 side padding, 13px 500, `--ink-3` (`--ink` pointed at). The chosen one: `--gloss-on` over `--accent`, white words, the top light, `--bead-drop`. It picks one value of a setting; at most four short choices.
- **Tick box**: for "include this when I confirm" (a switch means "this happens now"). A 16 square, corners 4, a well with a 1px `--line-2` edge (`--line-3` pointed at). Ticked: `--gloss-on` over `--accent`, the top light, and a white tick drawn with the icons' line (`--tick-line`) that springs in over `--dur-change`. This tick is part of the box and stays drawn in the stylesheet; it is not the `check` icon. Its label is 13px `--ink-2`, 8 to the right. Never the browser's own tick box. It is also the tick on a list's items and (at 24) on an ingredient while cooking, where it means "done".
- **Chip**: one for people in Share and filters in search. A small plain button's look (24 high, 12px 500, padding 0 4 0 10) holding a name, an 8px dot of colour when it stands for a person or planet, and a 16 round button holding the `close` icon at 12 that takes it away (`--tint-2` behind when pointed at).
- **Stepper**: a well with corners full and 3 padding, 32 high, like the segmented bar. A quiet round button 26 at each end (the `minus` and `plus` icons, `--ink-2`; pointed at `--tint-2` and `--ink`; pressed 92% size) and the value between them, at least 36 wide, 13px 500 `--ink`, digits of equal width. A button at its limit is switched off.
- **Slider**: an amount on a scale (the photo editor's Light, Colour, Detail and Straighten). Its name in Label `--ink-2` and its value as a Fact on the right (`+30`, `0`, `12°`; `−` for less, digits of equal width), `--ink-3` at rest and `--ink` once moved. Under them a channel 4 high, a well with corners full, inside a row 32 high. The part that is set fills from where the scale rests (the middle for a scale that goes both ways, the start for one that starts at nothing) with `--gloss-on` over `--accent`. The knob is the switch's pearl at 20 with `--pearl-drop`; pointed at it swells to 1.1, pressed it shrinks to 0.94 (change, on the spring). The keyboard moves it (arrows, Page Up and Down, Home and End) and its keyboard outline is drawn round its row. A double-click puts it back where it rests. Switched off, the whole slider is at 42%. On touch screens its row is 40 high. Built by `slider()` in `ui.js`.
- **Calendar** (2026-11-16; the user: "make it easier to input date and time without manually typing every digit"): a day is pressed, never typed, and never in the browser's own date box. A head row: a small quiet round `back` button, the month and year in Label `--ink` in the middle, a small quiet round `forward` button (switched off before the first month that can be picked). Under it the days of the week as one letter each in Caption `--ink-3`, starting on the day the person's week starts. Then six weeks, always (so it never jumps), days of other months left empty: each day a round 32 (40 on touch screens) in Label `--ink-2` with digits of equal width; pointed at, `--tint-2` behind and `--ink`; pressed 92% size; today has a 1px `--glass-edge` edge and `--ink`; the picked day is the segmented bar's chosen bead (`--gloss-on` over `--accent`, white words with `--on-gloss`, `--bead-drop`); days that have gone are switched off (42%). The keyboard: one Tab stop on the picked day (or today), arrows a day or a week, Page Up and Down a month, Home and End the week's ends, Enter or Space picks. Picking plays `select`. Built by `calendar()` in `ui.js`.
- **Time wheel** (2026-11-16, chosen with the calendar): a time is turned to, never typed. A well (`--well`, `--well-shadow`) with corners `--r-box`, five rows seen (rows 32, 40 on touch screens), holding a wheel for the hour, a `:`, one for the minutes (every five, plus the exact one if it was set to another) and one for AM or PM (only where the person's clock has them; else hours 00 to 23). The middle row lies under a band with corners `--r-row`, `--gloss-clear` over `--tint-2`; values are Label at `--text-lead`, digits of equal width, `--ink-3`, the one in the band `--ink`; each wheel fades out toward its top and bottom. A wheel scrolls and snaps to a value, takes a press on a value, and keeps the keyboard (up and down, Page Up and Down three, Home and End), each its own Tab stop with its keyboard outline inside. Passing each value plays `slide`. While there is no time yet the whole wheel is at 42%; turning it gives one. Built by `timeWheel()` in `ui.js`.
- **Swatch**: a colour to pick. A dot of the colour, 20 across (24, `.swatch-large`, in a panel of nothing but colours), with a 1px inner edge of `--edge`. Pointed at, 10% larger; pressed, 6% smaller. The chosen one wears a ring: 2 of the surface behind it (`--swatch-gap`, `--bg` unless the part sets it), then 1.5 of `--ink`. "No colour" is the paper dot with a red stroke across it (`.is-none`). On touch screens it keeps its size and gets a larger area to tap. One swatch for the highlighters, a document's inks and search's colours; a planet's colour is not a swatch (it is picked on the small worlds of its type box).
- **Tabs**: for switching what a panel shows (a segmented bar picks a setting). A row of words 32 high, 16 apart, 13px 500, `--ink-3` (`--ink` pointed at and chosen), over a 1px `--line`. A 2px line of `--blue-ink` with a soft glow of itself sits on that hairline under the chosen word and slides to the next over `--dur-move` on `--ease-glide`. Any number of tabs; the row scrolls sideways when it must.

### Menu

One menu for the ••• button, right-click, the editor and the reader, and it opens one way (below). Bar glass, corners 12, padding 4, at least 220 wide, `--shadow-float`. Rows 32 high, corners 8, 8 side padding, 8 gap, 13px `--ink`; icon 16 in `--ink-3`; a fact on the right in mono 11 `--ink-3`.

- **A menu of things to do gives every row an icon** (a file's menu, a planet's •••, a list item's, a recipe card's, a book's, the editor's Insert and More): `{ icon: 'trash', label: 'Delete', … }`. A planet you can move a file to shows its colour dot in the icon's place.
- **A menu that picks one of a list gives none** (Sort, the text style, a chapter, a format to download as). Pass `on: true` or `on: false` on each row and the chosen one ends in the `check` icon.
- **Download** opens a menu of what the file can be had as: `As it is` (its own kind as a fact, `.jpg`), a divider, the small heading `Converted to`, then each kind it can become with its ending as the fact (`PNG` `.png`). A video's list ends with a second heading, `Sound only`. A note has no file of its own, so its menu is headed `Download as`; a file that can only be had as it is downloads at once, with no menu. The kinds come from `downloads.js` (`formatsOf`); none is a choice to remember, so the rows carry neither icons nor a tick.
- A menu never mixes rows with and without icons. If one row would need an icon that doesn't exist, draw it (see "Icons") or give the menu none.
 Pointed at: `--tint-2`. A dangerous row is `--danger` (words and icon), washed 15% `--danger` when pointed at, and is last, below a divider (1px `--line`, margin 4/8). A group's heading is a small label with 8/8/4 padding. A row's keyboard outline is drawn 2 inside the row so the menu's edge doesn't cut it. On touch screens rows are a large control high (40; 44 on a phone) with 12 side padding and Body words (14; 16 on a phone).

- **How every menu opens** (the user's pick in session 8, "lively, everywhere"): it grows from where it was asked for (0.84 to full size about `--origin`: the corner at the button, or the pointer) over `--dur-move` on `--ease-spring`; its rows follow one after another, half a step apart (`--stagger` / 2, because a menu is small), each over `--dur-move` on `--ease-settle`; one highlight glides between rows over `--dur-change` instead of each row lighting; a chosen row blinks once (`--dur-quick`) before the menu leaves. Pressed again while its own menu or panel is open, a button closes it; it never opens a second one (`openPopover` does this for every caller). It leaves as everything leaves: `--dur-change` on `--ease-leave`. `openMenu`, `openContextMenu` and any `.menu` handed to `openPopover` get all of this from `glideLight` in `ui.js`; a feature never animates a menu itself. Never a blur on the menu's glass.

- **A planet's right-click menu** on its owner's galaxy: `Open`, then `Planet type…` (its colour too), `Add a moon…` and, last and red, `Delete planet…`; on someone else's galaxy, `Open` alone. The three are done on the planet's own page, so they open it and carry on there (`askThen` in `views/planet.js`): a thing only a page can do is never built a second time for a menu. `Merge into…` (icon `move`, 2026-11-16, the user: "allow right click to merge planets") sits after `Add a moon…` whenever there is another planet to go into (neither one shared with someone): it opens a second right-click menu where the first was, titled "Merge Sketches into", one row per other planet A to Z (icon `planet`, its file count as the row's fact). Picking one does it at once, with no question: the planet flies into the other, which gulps, and a toast says "Merged Sketches into Drawings · 2 files moved" with Undo, which brings it back as it was (name, look, sharing, place, files, moons). Its files go to the end of the other in their order; its moons become the other's (a full set of eight says so in a toast and nothing changes).
- **A file's right-click menu** (any kind of file) on a planet its owner arranges by hand (`sendItems` in `collection.js`) has, right after `Open`, `Send to top` (icon `up`) when the file sits below the first two rows, or `Send to bottom` (icon `down`) when it is in them (never on the last file). The files glide to their new places and a toast says where it went, with Undo. Not on a sorted view (the documents desk, a sort other than by hand) or on someone else's planet.

- **On a phone** (720 wide or less, with a finger; 2026-11-16): a menu is a sheet at the foot instead (`asSheet` in `ui.js`, `.pop.is-sheet`), 8 in from each side and above the bottom edge, corners 20, padding 8, over the page dimmed by a shade (`.pop-shade`, `--scrim`) that a tap closes. It rises 24 over `--dur-arrive` on `--ease-settle` and leaves 16 down over `--dur-change` on `--ease-leave`; the shade fades in over `--dur-move` and out with it. A small panel (Share, the Aa) stays beside its button.

**Small panel**: a menu that holds controls instead of rows (Share, a list's settings, the editor's Aa). The same glass and shadow, corners 20, padding 16, 12 between its parts. It opens and closes like a menu (it grows from its button; its controls do not arrive one by one).

### Sheet, dialog, toast

- **Sheet** (account, search): arrives over `--dur-arrive` on `--ease-settle` (its fade `--dur-move`), leaves over `--dur-change` on `--ease-leave`. Closed, it is `inert`. Bar glass, corners 20, padding 16 (12 at 720 wide or less), 12 under the head, `--shadow-overlay`, `min(440px, 100vw - 20px)` wide. Name in Title; under it a Fact line. A settings row is a 96-wide label (13px `--ink-2`; still 96 and beside its control at 720 wide or less, where "Recovery key" needs 90; a fact and its button wrap rather than squeeze) and its control, at least 32 high, 8 above and below; a control keeps its own width (a segmented bar's well hugs its choices, never stretched across the row). A foot row of buttons sits above a 1px `--line` with 12 above them.
- **The account sheet** (doors, 2026-11-16; the user picked “what you change often, then doors” from `design/settings-board-2026-11-16.html` in Mutt-notes): its first page is the head, then `Name`, `Sky`, `Text`, `Motion`, `Music`, `Sounds`, then four doors (a Sheet page part): `Recently deleted` (fact: how many; shown only while a file waits), `Your files` (`Download, tidy`), `Share menu` (`On` or `Off`), `Code and recovery key` (`Key kept` or `No key yet`), then the foot with `Sign out` alone. Whoever runs Mutt sees reset requests under the doors. **Your files** page: `Download` (a plain regular "Download everything" ending in the `download` icon; busy, "Packing your galaxy…", until the download begins) and `Planets` (`Tidy planets`). **Share menu** page (2026-11-16, fact `Send to Mutt from any app`): `Send to Mutt` (Caption fact `Not set up` or `On N devices`, small `Set up` plain or `Add a device` quiet), and while it is on a foot with quiet small `Turn off` (asks in a dialog first). Set up opens a dialog shaped like the recovery key's: title `Send to Mutt`, one paragraph, the key in the same box (`.rk-key`) with a small `Copy`, then quiet `Done` and the main `Get the shortcut` (`download` icon; it copies the key on the way and says so in a toast). **Code and recovery key** page (fact `@username`): `Code` (Caption fact `6 digits`, small plain `Change`), `Recovery key` (Caption fact `Kept outside Mutt` or `None yet`, small `Make a new one` quiet or `Make one` plain), and a foot with quiet small `Delete account` at its end. **Recently deleted** page (fact `N files · kept a week`, a quiet small `Empty` at the head's end): file boxes four across (three at 720 wide or less) with 8 between them, no comment count, two rows, then a quiet small `Show all N`; each box's fact is how long it has left (`7 days left`, `Goes today`). Clicking a box opens its menu (Put back, Delete now…); a box that leaves folds away over `--dur-change` on `--ease-leave`; when the last one goes the page steps back. Erasing always asks in a dialog first.
- **Whose galaxy, in the top bar** (2026-11-16, the user's ask): the middle of the bar names whose galaxy you are on (a small quiet button with a caret) and opens the account sheet on your own galaxy and planets. On someone else's galaxy or planet it opens **the sheet about them** instead (2026-11-16, the user: "show their username and how many files they have, their display name"; `personBody` in `statusbar.js`, `.sheet-person`, from `GET /api/users/<username>`): the same head (Title = their name, else `@username`; Fact line `@username · N files · N planets`, the files those on planets you can open, said `N files you can see` when some of theirs are closed to you) with a main `Your galaxy` at its end, then fact rows (Caption `--ink-3`): `Planets` (`All open to you`, or `2 open · 1 with a code · 1 private`, or `None yet`), `Joined` (month and year), and `With you` only when there is something (`1 planet kept together · You saved 3 files of theirs`). Nothing to change, no doors, no Sign out. Out in the universe it says `Universe` as a plain title in `--ink`: no caret, nothing to press, not a Tab stop, and an open account sheet closes as you go out. The universe page itself carries no heading of its own (only its faint line `Everyone’s galaxies. Open one to look around.`), so the word shows once.
- **Sheet page** (2026-11-16): a sheet whose first page keeps what is changed often and puts the rest behind doors. The doors sit together under a 1px `--line`, 2 apart, reaching 8 past the rows on each side: a door is a menu row 40 high (corners `--r-row`, `--tint-2` when pointed at or focused): its name in Label `--ink`, a Caption fact in `--ink-3` at the end, then `chevron-right` in `--ink-3`. Pressing one slides the sheet over to the page: the first page leaves (`--dur-change` on `--ease-leave`, 16 to the left) and the page arrives from 16 to the right (`--dur-move` on `--ease-settle`); Back plays it the other way. The page's head is the sheet's head with a quiet round `chevron-left` Back in front of its name (Title, Fact line under it) and its own small buttons at the end. Back takes the keyboard on a page; returning gives it to the door. Escape steps back before it closes the sheet. Every page opens on the first page again. `sheetPages()` in `ui.js`.
- **Name** (the account sheet's first row, right under the head; 2026-11-16): a bare text box holding the words you'd like to be called (placeholder `What people call you`, saved when you leave it); when set, the head's Title is the name and its Fact line starts `@username · `. **Names** (2026-11-16, the user: "show Bob Ray (@bobray)… not in the universe… everywhere else that makes sense"): a person named on their own (a byline, a comment's author, the owner on a file's view, Made by / Saved by, a person in search, the notes under the clock, the subject of a sentence: "Bob Ray (@bob) keeps this planet private.") is written `Bob Ray (@bob)` (`personLabel` in `util.js`). In a possessive ("Bob Ray’s planet", "’s galaxy", "’s document") and in a tight label (a galaxy in the universe, the void, the bar's "whose galaxy", a file box's caption, the fact beside a planet in a file's view) the name alone. Someone with no name is `@username` everywhere. Everywhere you type or pick a person (sharing with people) it stays `@username`.
- **Recovery key dialog**: a dialog that can't be waved away (only `I’ve kept it`, main): Body words, the key in a read-only boxed text box in Red Hat Mono, centred, letters spaced, 12 above; under it, 8 apart, small plain `Copy` (icon `copy`) and `Save as a file` (icon `download`, a .txt). Shown after making an account, after any new code set without the old one, and from the sheet. The key is never offered as a file on a planet: a planet is behind the same code the key replaces.
- **Asked for a reset** (account sheet, only for whoever runs Mutt, above Recently deleted, only while someone is waiting): a section heading (`Asked for a reset`, fact `N people`), then one item per person 12 apart: `@username` Label `--ink` with ` · their name` in `--ink-2`, when as a Fact on the right; their note in Caption `--ink-2` in quotes (`No note.`); small main `Make a link` (icon `link`) and quiet `Not now`. An answered item fades out over `--dur-change` on `--ease-leave`. `Make a link` opens a dialog with the link in the same read-only box (Caption size, left-aligned) and `Copy`. On their own galaxy they're told once a visit by a toast: `@sam asked for a reset · See`, which opens the sheet.
- **Can't remember it** (sign-in, in the void's light, in its dark ink): after two wrong codes (or a wait), `Can’t remember it?` joins `Not you?` as a second underlined word. It shows a prompt, one line of what to do (Caption `--ink-3`, `.login-about`) and two underlined choices in Label `--ink-2`: `Use my recovery key` (a line drawn like the name's, the key in Red Hat Mono at Body size, any case or spacing) and `Ask for a reset` (the same line, for a note: who you are, where to reach you). Then `Pick a new code` takes the six rings as at sign-up. A reset link opens the same page as `/login?reset=…`, asking only `A new code for @sam`. Each step arrives as sign-in's steps do; `Back` steps back.
- **Dialog**: arrives over `--dur-arrive` (its veil `--dur-move`), leaves over `--dur-change`. Bar glass, corners 20, padding 20, 340 wide (560 when it must be), `--shadow-overlay`, over `--scrim`, which also blurs the page behind by 10px. Title in Lead 700, words in Body `--ink-2`, buttons right-aligned 8 apart with 12 above. The quiet or plain button comes first, the main or danger one last.
- **Toast**: arrives over `--dur-arrive`, leaves over `--dur-change`. Bar glass, corners 20 (full at one line), at least 40 high, padding 8 16 8 14, 12 gap, 13px/16. A long message wraps to a second line and the toast grows; it is never cut short. It is as wide as its words, up to the screen less 16 a side (on a phone it once wrapped at half the screen). A black 8px dot with a pale ring leads it (the void, small). Its one action is `--blue-ink` 500, not underlined: `Sent to Recipes · Move`. When autosort finds two planets about equally right, the one action is the other planet: `Sent to Recipes · Rome trip instead` (one tap moves the file there).
- **Asking for a longer code** (2026-11-15, after the security check): an account that last signed in with 4 digits gets one toast, once a day on each device: `Your sign-in code is only 4 digits. A 6-digit one is far harder to guess. · Change code`, which opens the Change code dialog.
- **Uploads** are a toast, not a tray: `Uploading 3 of 7`, then `Added 7 files`, or `2 uploads failed · Retry` with a red ring. Its void is 16 and fills with white light from the middle as the files go in (black at none, bright with a soft glow at all); when the last file lands the same toast says what was added. Under Motion: Still the light steps without easing.
- **Too big, made smaller** (2026-11-16, the user's ask: "try to first compress it to make it fit under the limit before rejecting the file"): a picture, a sound or a video over the upload limit (50 MB) is first made smaller on the device, in the same toast: `Making scan.bmp smaller to fit…` (`Making 2 files smaller to fit…`), its void filling as it goes, with `Stop` while sound or video is being made smaller; the file's box says `Shrinking…` in place of its size, then shows its new size. When it lands: `Added 1 file · made smaller to fit, 57 MB to 7.2 MB` (`· 2 made smaller to fit`), shown a slow beat. A picture comes out as a JPEG (WebP or PNG if see-through), a JPEG keeping its camera details; sound as M4A, video as MP4. A file that can't fit even so fails with its reason in the box and the toast (`interview.wav: too long to fit, even made smaller. Files can be up to 50 MB.`) and no Retry; one stopped says `scan.bmp wasn’t added · Retry`. Other kinds over the limit (a PDF, a zip, a GIF) are turned away at once as before (`archive.zip is 51 MB. Files can be up to 50 MB.`).
- **Converting** (a download as another kind) is the same toast: `Converting to MP3 · 40%`, its void filling as it goes, with `Stop` as its action; the file is saved when it is done and the toast goes. The first sound or video converted fetches Mutt's converter once (about 30 MB): the toast says `Getting the converter ready…` meanwhile. A mistake says what went wrong in a plain toast.
- **Comment note** (the user's ask, 2026-11-13; made smaller at their word the same day, and again 2026-11-23: "make the notifiations smaller for eerythign"): new comments on your files, told only on your own galaxy (not out in the universe), in a column under the clock at the top right, 8 below the bar, on `--z-bar` so sheets and rooms cover it. One note per file, newest first, three at a time; when one goes the next steps in. A toast's bar glass at corners 12, 248 wide at most, padding 6 (32 on the right for the close button, a small quiet round one 4 from the corner). It leads with the file's picture, 22 square, corners 8, in a well with a 1px `--line` edge; a file with no picture shows the `comment` icon at 12 in the commenter's colour. Then, in Caption: `@sam` (`--blue-ink` 500) `commented on` (`--ink-2`) and the file's name (`--ink` 500), at most two lines, with when as a Fact on the right; under it the latest words in Caption `--ink-3`, one line, cut with an ellipsis. Pointed at, `--tint` behind it. Several comments read `@sam left 3 comments on …`, two people `@sam and @jo commented on …`, more `@sam and 2 others commented on …`. Pressing it opens the file on its planet (a star over the galaxy) with its comments scrolled into view; either way, or the close button, they count as seen and the note never comes back. It stays until answered: it does not time out. **The clock** (the user's ask, 2026-11-15) is a small quiet button with the bar's height to tap (padding 8, its time in tabular figures, 500): pressed on any page, the column shows the last three files people commented on, seen or not, in the same notes (any new ones step aside), and the clock stays lit (`--tint-2`) while they show. Pressing it again, Escape, going to another page or closing the last one puts them away and the new ones come back. With none ever, a toast says "No one has commented on your files yet". **On a phone** (2026-11-16): one note at a time, one line at the top, centred, 300 wide at most (16 in from each side on a narrower screen) and a large control tall, saying only who and on what (the name alone, without `@username`; no when, no words); the galaxy makes room under it, and the notes step aside while a sheet or a room is open.
- **Comet note** (2026-11-16, "Comets" in section 3): a comet that has come, on any page, in the comment notes' place and shape (they wait while it shows). Its lead is the `date` icon in `--comet-ember`; the note's name in Caption `--ink` 500 with when as a Fact; under it "A comet reminding you: today, 3 PM" in Caption `--ink-3`, wrapping, never cut; under that, set in from the lead, **Done** (a small button with the `check` icon; **Tick off** with the `tick` icon for a list item, whose words add ", on Errands") and **Later** (a quiet one opening a menu: In an hour, Tomorrow). Every one has the close button (the user: "you should be able to dismiss the comet nudge"): closing one waves away only the note, at once, and it stays closed (fixed 2026-11-23: it used to come straight back); a due comet still waits, burning, in your sky. On a phone it keeps its words and its buttons, at the top, centred like the comment note. Its Done and Later sit 4 apart, set in to the words.
- **Comet row** (the file view's side panel, below its buttons, your own notes only): a box of `--well` with a 1px `--line` edge, corners 12, the `date` icon, two lines and a button on the right. Offered: “Friday 4pm” (`--ink`) / "A comet can remind you" (Caption `--ink-3`) / **Make it a comet**. A comet: "A comet will remind you" (or "is reminding you") / its day in Small mono capitals in `--comet-ember`, then Done when it is near and a quiet **Comet** menu (the comet's own menu).
- **Comet: when** (the file menu's "Make it a comet…", and "Change when…" in a comet's menu): the shared dialog titled "Make it a comet" ("Change when it reminds you", button Save, when changing), its words "A comet will remind you of “<its name>”. Until then it crosses your sky.", then **quick choices**, small buttons that wrap: what the words say first, in quotes (“Friday”), then Later today (three hours on, to the hour, until 9 in the evening), Tomorrow, This weekend (Monday to Friday), Next week; the one that matches the day and time below is held on (`--accent` edge, a quarter of `--accent` behind it). Under them, nothing to type (2026-11-16): **Day** on a **Calendar** and **Time** on a **Time wheel**, each under a Label in the inputs' caps, side by side in the wide dialog (560) and one under the other when there isn't room (a phone). Beside the Time label a small quiet button: "No time" empties the time (the wheel goes faint), "Add a time" gives it back; turning the faint wheel gives a time too. A quick choice moves the calendar and the wheel to it. Under them, in Caption `--ink-3`, when it will remind you in words: "It will remind you Friday, November 20 at 9 AM." (once: no heads-up); a time gone says so in `--danger` and the button waits. Cancel and **Make it a comet** (the main button).
- **Comet card** (a list item's comet pressed in the sky; 2026-11-16): the shared small panel (`pop-panel`), 340 wide at most, beside the comet. A row: the list's tick box (`tick-box`, a button with `role=checkbox`) and the item's words in Body `--ink`; set in under the words, in Small mono `--ink-3`, the `date` mark in `--comet-ember` with when, and the `planet` mark with the list's name; then Change when… and Later ▾ (small buttons) and the ••• of the comet's menu at the far end. Ticking it: the `tick` sound, the comet is done (with Undo) and the card closes a moment later. The tick box takes focus only when the comet was reached by the keyboard.
- **Comets at the top of a list** (the user: "reorganize comets to the top of lists in order of date"): your items that are comets and not ticked sit above the rest, the soonest first, and have no handle to drag (a comet's place is its day); one that stops, or is ticked, goes back to its own place among the others.
- **List comet mark** (list mode, your own items that are comets): at the end of the item's row, before its remove button, the `date` icon at 12 and its day ("TOMORROW, 9 AM") in Small mono capitals in `--comet-ember`, 24 tall, padding 0 8, corners `--r-row`, `--tint` behind it when pointed at; pressed, the comet's menu headed "A comet will remind you". Its title says "A comet will remind you …". Hidden on a ticked item. **On a phone** it goes on its own line under the words, starting where they start, so neither is squeezed.
- **Asking for a recovery key** (2026-11-16, for accounts made before keys): a tip, on your own galaxy only (not in the universe), 4 seconds after the page settles and only while nothing else is open or asking (a dialog, menu, sheet, room, a toast with a button; an account still on 4 digits is asked for a longer code first). Title `A way back in`, text `If you ever forget your code, a recovery key gets you back in.`, small main `Make one` (the recovery key dialog) and quiet `Not now`. It sits at the foot on the left, 24 in, clear of the Universe cue and the toasts; at 720 wide or less across the foot, 16 in, with toasts above it. Its parts arrive and leave in `--dur-arrive`, leaving as everything leaves. `Not now` waits a week and asks once more; a second `Not now` and it never asks again (per device). Leaving the galaxy puts it away unanswered.
- **Asking for a name** (2026-11-16): someone with no name is asked every time they go out into the universe, once the zoom out has settled (`--dur-scene`). A tip at the top right under the bar (8 below it, 16 in from the edge; where the comment notes sit on your own galaxy): title `What should people call you?`, text `Your name shows on your galaxy, planets and comments, in place of your @username.`, a text box (placeholder `Your name`), then small main `Save` and quiet `Not now`. Save keeps it with a toast `People will see you as …`; Not now, Escape, or coming back in puts it away until the next time out. It arrives and leaves as the recovery key ask does.
- **Tip** (the sharing tip, the recovery key ask, the name ask): Mutt speaking once. Bar glass, corners 20, padding 16, 300 wide at most, `--shadow-float`: a line in Label `--ink`, one or two sentences in 13/18 `--ink-2`, then small buttons (main first when there is something to do, quiet "Got it").
- **Tooltip**: what an icon button or a cut-off name is called. Bar glass, corners 8, 24 high, padding 0 8, Caption in `--ink`; a key beside it as a Fact in `--ink-3`, 8 apart. It appears 8 below the thing (above when there is no room), centred and kept inside the window, half a second after pointing (at once when moving from one to the next) and on keyboard focus; it fades over `--dur-quick`. Never on touch screens. The browser's own labels are not used: anything with a `title` gets this instead.
- **Drop hint**: while files are dragged over the window nothing frames the page. The thing that will take them lights up: on a planet the add box (edge `--blue-ink`, a ring of `--accent` at 32% and a soft glow), on the galaxy a ring opens round the void, just outside its cage (1.5px `--blue-ink` with the same ring and glow; the void itself is not redrawn). One label sits where toasts sit, shaped like a main button: `Drop to add to Postcards`, `Drop into the void`, and over a planet on the galaxy `Drop onto Postcards`. Where nothing can take files the label is clear glass and says why. A page says what takes files through its view's `dropTarget()`: `label`, `el` (the thing to light), `lit(on)` and what `over(e)` returns (main.js).

### File box

One frame for every kind of file, wherever files are shown (a planet's page, the rest of what search found). Built by `renderCell` in `cells.js`; styled only in the section of `galaxy.css` headed THE FILE BOX. Drawn in every kind at `/parts`.

- **The frame**: a box four wide to five tall (`.cell-box`), corners 12, and 12 under it one line, the caption. Four boxes to a row, 24 apart each way; on a phone two to a row, 12 apart across and 16 down, and square (2026-11-16: two tall boxes filled a phone with little in it), a picture between 4:5 and square held by its height.
- **The rule**: the box shows what is in the file and the caption says what it is called. Nothing is said twice: a name is never repeated inside its box, and a fact is never in both places.
- **The caption** (`.cell-cap`): the name on the left in Caption `--ink-2` (`--ink` when the box is pointed at), cut with "…", and one fact on the right in Fact `--ink-3`; both carry `--sky-shadow`. The name is the file's own name; a link's title is in its box, so a link's caption is its site. The fact is the date for a note or a link, pages for a page or a book that knows them, and otherwise the size. Someone else's file adds `@name` after the name; a file with comments shows their count before the fact. A file that is also on other planets (seen on one of its planets) shows, before those, a small dot (8 across) in each other planet's colour, three at most then `+N`, 2 apart; pointed at, it names them ("Also on Holiday and Walks"). The file view says the same in words: its planets section is headed "Also on 2 planets" (or "Only on this planet") when it was opened on one of them, lists only the others, and each opens this same file on that planet; opened anywhere else it stays "On N planets". A moon in that list says `moon` as a Fact.
- **A face is one of three things.** To add a kind of file, decide which and build it from that:
  1. *It has a shape of its own* (a picture, a video, a page, a cover): it keeps that shape, in the middle of the box, never cropped (`shaped()` in `cells.js`). Corners 12, a 1px edge of `--box-edge`, `--shadow-rest`. Pointed at: 1.5% larger, edge `--pic-edge-on`, `--shadow-raised`.
     - *A page* (a PDF or a document with a first page): paper. Corners 4, `--paper-shadow`, at most 94% of the box so it reads as a sheet lying in it.
     - *A book* (an EPUB with a cover): its cover, the same way, with the left corners 2 and the `--spine` band.
  2. *It is words* (a note, a link): box glass (`.fglass`'s recipe) filling the box, padding 16 (12 on a phone).
     - *A note*: its words from the top in Body `--ink` (16/22 on a phone), fading out over the last 40px through a mask (never a painted fade: it shows as a dark band on glass). **A brief note** (48 letters or fewer on one line, `briefNote` in `cells.js`) is set larger on a phone, in Title at 500, so a box holding `milk` doesn't look empty.
     - *A link*: set to the foot: the title in Lead (16/22, four lines) and what the page says in Caption `--ink-2` (three lines). If the link has a picture it runs across the top of the box, edge to edge, above a 1px `--line`, and the title keeps two lines and the description one.
  3. *It is neither* (a song, a zip, code, anything else): box glass, set to the foot: one bold word in Title (what kind of file it is: `ZIP`; for a song, how long it is: `3:42`) and under it, only if the bold word wasn't the kind, the kind as a Fact. Above the word, its sign if it has one:
     - *A song*: 40 level bars, 1px wide in `--ink-4`, their heights made from the file's id so they never change; they take the planet's tint when the box is pointed at.
     - *Code or text with words to show*: its first lines in mono 10.5/1.6 `--ink-2`, fading out; code is numbered in `--ink-4`. Then only the kind as a Fact (no bold word).
     - *A voice note made by holding the void*: its words (three lines, Body `--ink`, from the top) over its sound's real shape (`meta.voice.wave`, 16 bars) with its length as a Fact; with no words yet, the shape larger and "Voice" as the bold word. The fact is its date.
     - *Any other file*: nothing above the word. Don't invent a picture for a kind; a new sign is drawn on `/parts` and shown to the user first.
- **The tag** (`.cell-tag`): a fact that sits on a picture, 8 in from its top-left corner: 20 high, corners 4, padding 0 8, Fact in `--ink`, on `--bar-fill` under `--tag-frost`. A video's (or a song with a cover's) length always shows, after a small play triangle. What a page or a cover is (`PDF · 12 pp`, `Book`) shows only when the box is pointed at.
- **The buttons on a box** (`.cell-actions`): two small plain buttons (`.btn.btn-small.pill`), 12 above the foot of the box, on the same dark see-through glass as the tag. They appear when the box is pointed at or focused, and never on touch screens (right-click and a long press open the same menu).
- **At rest** a box floats: 2.5px up and down, 8 to 12 seconds, each on its own beat. Nothing else: no glow, no lean.
- **Pointed at or typed in**: the edge, glow and fill of box glass, plus a lean toward the pointer (up to 3° and 2.4°). Only that one box leans; it settles back when the pointer leaves (`drift.js`, which writes the lean on that box alone).
- **Arriving**: the box slides up 16px over `--dur-arrive` while its parts fade in and come into focus from a 2px blur, one `--stagger` apart (at most 14 steps); a picture only fades in (blurring a photo, shadow and all, cost Safari a whole repaint of it each picture: a planet of photos opened at 52 a second, 58 without). Only boxes on screen (and 200 past it) arrive; the rest are simply there (`onlySeenArrive` in `grid.js`). **A big planet opens in two steps**: of more than 36 files, the first 24 are built and arrive; the rest are added a dozen at a time with no motion once the arrival is over (`--dur-arrive` and 16 staggers), below the screen where nothing is drawn, and at once if anything needs every box first (Tab, scrolling, a drag, a sort, an upload, finding a box: `finishRest` in `grid.js`). The page fetches every file as before. Letting the browser skip boxes far off screen (`content-visibility`) was tried and gained nothing measurable in Safari's engine, so it isn't used. The blur stays small: Safari draws every blurring part again on each picture of a page change, and 8px made opening a planet drop to about 45 pictures a second (measured 2026-11-16).
- **Being added**: the box at 55% with a 2px line under it filling left to right; red when it fails, with the reason and "Retry" as the caption.
- **The add box** (`.entry`, `entry.js`) is the first box on a planet you can add to. It is a sunken slot, not a file: a well with corners 12 and a 1px `--line-2` edge (`--line-3` pointed at), the placeholder "Type, paste or drop" in `--ink-3`, "Upload" as a small quiet button at the foot, and a small main button "Add" in the planet's colour once there are words. On a phone it is a slim bar 56 high across the whole row (on a touch screen the placeholder is "Type or paste" and Upload is led by the `upload` icon), opening to four lines with Upload and Add under them once it is typed in. While you type in it, or drag files over it, its edge is the planet's paled colour and it has the 3px ring of a text box being typed in.

### Planet header, section heading, small text

- **Planet header** (`.liv-head`): no box. It sits straight on the sky, and the files below are the only glass on the page. The world (124 across; 84 on a phone), with its moons beside it (up to eight: right then left, two high and two low on each side, the fifth to eighth in a column further out; on a phone, five or more put the world above the name), then the name in Page, the note in Body `--ink-2`, and a Fact line; every word carries `--sky-shadow`. The name and the note are bare text boxes (`.field-bare`); on someone else's planet they are read-only and are plain words. Its buttons (Share, •••) are plain, level with the middle of the world, at the far end; on a phone they sit under the Fact line. Share's icon is who can see the planet now, the same one the Fact line shows: `lock` Private, `key` Code, `people` People, `globe` Public, `plus` when others can add; it changes the moment the setting does (2026-11-16). 24 between the world, the words and the buttons; 32 under the header.
- **One column**: the header and everything under it share the same left and right edges, 48 in from the page's own gutter above 720 wide, so the back arrow sits in the margin beside them. Nothing on a planet's page is inset on its own.
- **Section heading** (`.sec-head`, built by `sectionHead()` in `ui.js`): one for every mode. The name in Label `--ink-2` and one Fact beside it (`Books 2`, `Documents 4 · 518 words`), 8 apart, straight on the sky with `--sky-shadow`, in a row 32 high with 12 under it; the group's own buttons (Sort, New document) at the far end. **Only where a page has more than one group, or the group has its own buttons**: a plain planet has no heading, because its header already says how many files it holds.
- **Small text**: one Caption and one Fact. Anything you could count or date is a Fact (mono); everything else small is a Caption.

### Search: gravity

Decided with the user on 2026-11-16 (the proposal `Mutt-notes/design/search-gravity-2026-11-16.html`, option A). Search belongs to a galaxy. On a galaxy what it finds doesn't come as a list: each file lifts off the planet it is on and settles round the void. Built in `gravity.js` (fetched the first time someone searches on a galaxy) with search's sheet in `search.js`; styled in the section of `galaxy.css` headed "Search as gravity", beside the stars.

- **Where it searches**: on your galaxy, your files and stars; on someone else's galaxy, their files on the planets you may open (never by a file's hidden details). Opened anywhere else, search first takes you to the galaxy it searches: from a planet page, that planet's galaxy (the pull away); out in the universe, back in to yours (on someone else's, home to yours); from any other page, your own. Back returns you.
- **The sheet** keeps the search box, the row of choices, People (they are galaxies, not files) and planets found by their names. It holds no files, except the rest after "+N more".
- **A found file** is the small face the planets wear in their belts, the stars' look (`.star`) a little larger (47 across, 37 on a phone: the galaxy's `cell`), evenly round the void just inside the rim of its cage (2.1 times the light's radius), clockwise from the top in the order Sort gives. At most 12 (8 under 640 wide). Pointed at or reached by keyboard it grows as a star does, its tooltip names it and where it lives (`a postcard of the harbour · Postcards`, `… · a star`), and a faint line (1px `--line-3`, a gentle curve) runs back to each of its planets.
- **The galaxy**: the planets holding found files (flown or not) and planets found by name stay as they are; every other planet, your stars and the threads step back to 0.36. A found star leaves its own place for the ring and returns when search closes.
- **More than fly**: a quiet small `+N more` (`More than N` while there are more to fetch) under the ring opens the rest as file boxes in the sheet, as search's list was.
- **Opening one**: a press or Enter opens the file view over the galaxy, the file gliding from its spot; the file view's arrows walk through what was found; closing it brings search back as it was.
- **The keyboard**: Tab goes from the box through the choices to the files (`tabsWith` in `ui.js`: they belong to search's layer), then `+N more`; the down arrow in the box goes straight to the first file; the arrow keys go round the ring; Escape closes search and every file goes home.
- **Typing**: each letter asks at once; the files move only once typing pauses (`--dur-move`). Files that still match stay, new ones fly out, those that don't go home. An empty box sends everything home.
- **Still**: no flight and no lean; the files, the lit planets and the rest stepped back are simply there.
- **Cost** (Chrome with the real graphics chip, 1440 by 900 at two pixels a point): 60 pictures a second while the files fly, while gathered and going home, no long tasks; the page and drawing cost less gathered than search's list did. Not measured in real Safari.

### Offer

An offer (a mode's "This planet looks like …") is box glass with corners 20 and padding 16: its small drawing (below), then a line in Lead 700, the signs it noticed as Body `--ink-2` behind small `--ink-4` dots, one line of Caption `--ink-3` saying nothing is lost, and at the far end a quiet "Not now" then a main button in the planet's colour whose words match the menu's. It is the one box in `offers.js` (`modeOffer`); a mode only supplies words and the name of its drawing. **It comes while you're there** (the user, 2026-11-16): a planet that becomes a list, a shelf, a cookbook… as you fill it is offered then, a moment after the last change, not on the next visit; and it guesses readily, since an offer waved away costs one tap and a planet never recognised costs the feature (three short things are a list, two books a shelf, two pieces of writing a desk, three quotes a commonplace book). The sharing tip makes way for it. On a phone the buttons sit under the words, the drawing sits beside the title, and the signs and note run the full width under both.

- **Split into moons** is offered in the same box, though it acts once instead of showing the planet another way: "This planet holds two things" (three, four…), the signs with numbers ("4 files are about pottery and 4 about climbing.", "1 other fits neither."), and the note says which move to a moon of their own and which stay, then "Nothing is lost, and it can be undone." Its button and its ••• row (icon `moon`) say `Split into moons`. Accepting brings the new moons in beside the world one step apart, the files that went leave the grid in one glide, and a toast says `Split into 2 moons` with Undo. It is offered last of the offers, only while the planet shows as plain files, and never on a moon.

- **Board** is offered by what the owner does, not by what the files are: after their files have been moved by hand 8 times in two weeks, on a planet of 4 files or more. "You’ve been arranging this planet", the sign with its numbers ("You’ve moved its files around by hand 8 times in the last two weeks."), and the note: "It can become a board: put each file anywhere, at any size, with your own words and lines between them. The files themselves don’t change." Its button and its ••• row (icon `board`) say `Make it a board`. Once answered either way it never steps back by itself. Unlike every other mode, `Make it a board` is in the ••• menu of any planet or moon with 2 files or more before it is offered (the user's word: any planet being rearranged should be able to become one).

**An offer's drawing** is one of eight in `icons.js` (`drawing(name)`: `list`, `shelf`, `cards`, `desk`, `moons`, `sky`, `quotes`, `board`), and they are all made the same way: a pane of glass in front (an outline in the icons' line, faintly filled) with the planet's paled colour along its top edge, another pane behind it, and a few marks that say which mode it is. A list is two strips with ticks, a bookshelf two covers, a cookbook a card behind its tab, a desk two pages, a split (`moons`) a planet with its small moon on the front pane (chosen by the user from three, 2026-11-16), a board three cards of different sizes laid loosely, a short line joining two, and two lines of words. Drawn on a 24 grid, shown at 28 in a 40 well with corners 11. A new mode's drawing is made this way and no other: add it to `DRAWINGS` in `icons.js`, name it in the mode's page entry (`drawing: '…'` in `modes.js`), and show the user first.

### Room

A room is a place that covers the page and its bar: the file view, the document editor, cooking, the reader. Build a new full-screen place this way and no other.

- Its own element has the class `.room` (fixed, edge to edge, on `--z-room`). Call `enterRoom()` (`ui.js`) when it is put on the page and `leaveRoom()` when it is taken off.
- **The page steps away and the sky stays.** While a room is open the page, the top bar and the back arrow fade out (`html.in-room`); what shows behind the room is the real sky, dimmed by `--room-veil`. A room never paints a background of its own, and never blurs the page behind it.
- **It arrives as one even fade**: put it on the page inside `transition(fn, { type: 'room' })` (`transitions.js`), which fades from a picture of the page to a picture of the room, so the page's glass keeps its frost while it goes. Leave the same way. The file view does this with its own type, `viewer`, so the file can glide from its box.
- Words set straight on a room's veil carry `--sky-shadow`, like words on the sky.
- What Mutt gives you to work with in a room is bar glass (`.bar-glass`) holding shared parts, and stays Mutt blue; the owner's things in it are box glass or paper and may take the planet's colour.
- Dialogs, menus and toasts open above a room. A sheet can't: `/` does not open search while a room is up.
- **A room opened from inside another** (the photo editor from the file view) takes its place: the one under it is hidden while the new one is up (`.room:has(~ .room)`), and is just as it was when the new one goes. Two rooms never show through each other.
- Two rooms bend the rule, each for a reason: the editor's veil is a layer of its own (`.de-bg`) so it can fade while the page flies home, and it steps the page away with its own older class (`html.is-writing`); the reader's page fills the screen, so it has no veil and doesn't step the page away.

### The modes

How each mode is built. A new mode follows the nearest of these.

**List** (`listmode.js`; the section of `galaxy.css` headed LIST MODE).
- The shared section heading: `List`, then how many and how many ticked (`8 items · 2 ticked`), with a small quiet "Clear ticked" and a small round button (the `more` icon) at the far end.
- Under it a 2px line that fills in the planet's paled colour as things are ticked.
- Then "Add an item": a sunken slot like the add box (a well, corners 12, a 1px `--line-2` edge, the ring of a text box while typing).
- **Every item is its own strip of box glass** (`.lm-row.fglass`, corners 12, at least 48 high, 8 apart), because each is a file you can pick up and drag. Nothing boxes the strips together. Pointed at, a strip takes box glass's pointed-at look and shows its grip (the `grip` icon in `--ink-4`) and a small quiet round button holding `close`. A ticked strip is fainter, its words `--ink-3` and struck through.
- Words are the owner's own: Lead size at 400, times their text-size setting.
- The tick is the shared tick box in the planet's colour. Bullets and numbers are the planet's paled colour and `--ink-3`.
- "Ticked", between what's left and what's done, is a small label with a hairline after it.
- Its options are a small panel (kind of list, where ticked items go, the longest item). A sample list inside it sits on bar glass, so its rows are washes.

**Cookbook** (`cookbook.js`; the section headed THE COOKBOOK).
- The cards are a box of index cards: box glass, corners 12, the next card overlapping the foot of the one before by 16, a 2px line of the planet's paled colour along each top edge. On a card: its name in Title, servings as a Fact, the first ingredients in Body `--ink-2`, and its photo (92 × 72, corners 8) at the far end. Pointed at, a card lifts 8.
- Chapters are dividers: a sheet of glass tinted 14% with the planet's colour and a tab standing up from it (28 high, corners 8 at the top) carrying the chapter's name in Label and its count as a Fact. This is the cookbook's own sign; keep it.
- A card opened sits in the page above the cards: box glass, corners 20, padding 16/24/24. Its name in Page; the stepper and segmented bar for servings and measures; "Ingredients", "Method" and "Notes" as small labels; amounts in 700 `--ink`; step numbers as Facts in 24 wells; its photo 252 wide with corners 12. On a phone (480 or less) its row (the arrows, Cook, Edit, More, Put it back) sits 4 apart with the round ones at 40, so it fits 375; under 360 the arrows step aside, as a card swipes to the next.
- Editing a card keeps its layout, with shared text boxes that keep the card's own type; "Add an ingredient" (led by the `plus` icon) and the row's `close` are small quiet buttons.
- A photo looked at closely opens over the dialog's scrim, on the dialog's layer.
- **Cooking is a room, sized for arm's length**: the recipe's name in Title; ingredients down the side in Lead with the tick box at 24; the step in `--text-reach` under a small label (`STEP 2 OF 5`); Back (plain) and Next (main, the planet's colour) at `--h-reach`; a dot for every step, the ones passed in the planet's paled colour. On a phone the ingredients open over the step from a button.

**Documents** (`docs.js`, `doceditor.js`; `docs.css`).
- The desk is the shared heading (`Documents`, how many, how many words; Sort as a quiet button, "New document" plain) over a grid of pages, 24 apart across and 32 down, at least 220 wide.
- **A page on the desk is paper**: flat cream, corners 4, `--paper-shadow`, the proportions of a real sheet, its first words set small on it and fading out at the foot. No rim and no glow at rest. Pointed at, it lifts 7, tilts half a degree and takes `--paper-shadow-on`; it leans toward the pointer like a file box.
- **A desk keeps its own voice** (chosen by the user): the planet's name (600) and note (italic), and the name under each page (Lead size, 600), are `--serif`. Under the name, one Fact line (`Letter · 142 words · just now`). Nowhere else is a serif used off paper.
- "Continue writing" is one strip of box glass with a small page, a small label, the name and a main button.
- **The editor is a room.** Its pages are paper with `--paper-shadow`. The document's name in the top row is a bare text box in the desk's serif (Title size, 600).
- Everything it gives you to write with is bar glass holding shared parts, and stays Mutt blue: the toolbar (one pill, shared quiet buttons 32 high; a button that opens a menu has a caret; on a phone, 760 wide or less, it is two centred rows with corners 20 and no dividers, so nothing hides off the edge: undo, redo and the two pickers, then the marks, lists, insert and Aa; the "Auto" tag beside the kind of writing gives way there, its menu still saying it), the Aa panel (a small panel: each row a 72-wide label and its control; a group that picks one is a segmented bar; a group of things to do is quiet round buttons; colours are swatches), the bubble beside selected words (a pill of quiet round buttons), the "/" menu (shared menu rows under small labels), find, the outline, history.
- Comments in the margin are people's words: box glass, with a marker-yellow edge on the one in hand. Inside the panel they sit on bar glass, so they are washes.
- The word count is a fact on a tag (`--bar-fill` under `--tag-frost`), bottom left. On a phone (760 or less) it is a plain Fact in `--ink-3` just under the document's name in the top bar, never over the writing.
- On a touch screen, opening a document doesn't bring up the keyboard (it would cover half the page before you've read it), except for a new or empty one; a tap on the words starts writing.

**Reading** (`reading.js`, `reader.js`; the sections headed READING).
- The shelf is the shared heading (`Books`, how many) over covers standing with their feet level, straight on the sky: each at its own shape (two to three), at least 132 wide, 24 apart across and 32 down. A cover is paper's shadow with the left corners 2 and the `--spine` band; a book without one gets a flat cloth cover with its name in the serif. Pointed at, it lifts 4.
- Under a cover: its name in Label `--ink`, then its author in Caption `--ink-3` with one Fact at the far end (`34%`, `New`, `PDF`; a finished book's in `--good`). How far through is also a 2px line under the cover in the planet's paled colour.
- "Continue reading" is one strip of box glass: the cover, a small label, the name in Title, a 4px track, a Fact, a main button.
- **The reader is a room whose page fills the screen**, in one of four page colours: Night, Quiet, Sepia and Paper (the one cream). Each is flat. Books are set in `--serif` (sans is the other choice) at the reader's own size.
- On a phone (720 wide or less) a book starts with ragged edges: its one column is too narrow to justify without wide gaps. Justified stays one choice away in the Aa panel, and a reader's choice is kept.
- **Its bar, panels and menus are cut from the page's colour** (chosen by the user), in the shared parts' shapes. Inside `.rd` the usual names (`--ink`, `--ink-3`, `--line`, `--tint`, `--well`, `--edge`, `--blue-ink`) are read from the page's eight values, so a shared button, tab, stepper, text box or swatch is right on all four with nothing written twice. This is the one place Mutt's controls take a colour that isn't Mutt's; don't copy it elsewhere.
- A panel is the small panel's shape (corners 20) filled with `--page-raised`; its settings are a small label over each control; a row of choices is the segmented bar's shape with the chosen one a bead of the page itself; page colours are four tiles showing "Aa" on each fill; contents are rows 32 high.
- Words you pick get a pill of `--page-raised`: the five marker swatches and an underline, then small quiet buttons (Note, Copy).
- The foot's two lines are Facts (`10%`, `6 pages left in chapter`).

**Commonplace book** (`quotes.js`; `quotes.css`, fetched with it the first time a planet is one).
- A planet kept for quotes. The shared heading (`Quotes`, how many and how many people: `8 · 7 people`) with, at the far end, a segmented bar `All` / `By who` (only once someone is named) and a small plain `Slideshow` led by the `play` icon. Under it the wall; files that aren't quotes stay below under `Other files`, without an add box of their own.
- **The wall** is columns of cards (three above 900 wide, two above 540, one on a phone), 24 apart (12 on a phone), each card going into the shortest column so the wall reads across in order. The shared add box (placeholder "Add a quote", 168 high) is the first thing on it.
- **A card is box glass** (`.fglass`, corners 12, padding 24/24/16; 16 on a phone) led by a short stroke of the planet's paled colour (24 by 2). **A quote keeps its own voice** (chosen by the user with this mode): its words in `--serif` italic 400, at Title, Lead or Body by length (up to 70 letters, 180, longer), the opening mark hung in the margin; then who said it in the serif 600 at Label size `--ink-2`, and where from in the serif italic at Caption size `--ink-3`. The marks round the words are Mutt's: the note's own are taken off when it is read.
- **By who**: each person's quotes stand together under the shared section heading (their name, how many), and those groups are packed into the columns like cards; a card there leaves out the name. Quotes with no one named come last, under "No one named".
- Pressing a card opens the slideshow at it, paused; its menu (right-click) is the file's own with "Show in the slideshow", or for someone else's planet that and "Open as a file".
- **The slideshow is a room.** One quote large, centred on the sky with `--sky-shadow`: its words in the serif italic at `--text-reach` (longer ones smaller, see Type), who said it in the serif 600 at Lead `--ink-2`, where from in the serif italic at Label `--ink-3`. Close is a quiet button at the top right. At the foot one pill of bar glass (Mutt blue): `chevron-left`, where you are as a Fact (`3 / 8`), `chevron-right`, a hairline, Play/Pause (`play`/`pause`) and Shuffle (`shuffle`, lit while on), all quiet round buttons. Playing, it moves on every `--slide-pace` and keeps the screen awake; after a slow beat with the pointer still, the bar and Close step back until it moves. Arrow keys step, Space plays and pauses, Escape closes, a sideways swipe steps.

**Board** (`board.js`; `board.css`, fetched with it the first time a planet is one; from `design/concepts/18-board.html`).
- A planet arranged by hand, as a free surface. Under the planet's header the board takes the rest of the window, the window's full width, down to 12 above its foot; the page doesn't scroll past it. Nothing on it moves at rest.
- **Its files are the file box** (`renderCell`), each at the size its owner gave it: a picture keeps its shape, anything else can be any shape from 64 to 1600 across. Their names show only while pointed at, chosen or reached by keyboard (chosen by the user), under the box as its caption.
- **Its words are bare words on the sky** with `--sky-shadow`, in Mutt's own face (chosen by the user over the serif and the mono): a heading in Page, a label in Small spaced capitals `--ink-3`. Pointed at, a `--tint` behind them; while written, the well. Up to 300 characters. **They can always be taken away**: pointed at, picked or being written, a small plain round button with the `trash` icon (24, the same size on the screen at any zoom, 40 to tap) sits on their top corner, `Take the words away`, with Undo; emptying them does the same, and so do Delete and the menu. Double-click words to write in them.
- **Lines between files** (the one extra the user chose; frames were left out) are the threads' dust (`wisp` from `uvweb.js`, `--thread`), from edge to edge with a slight bend, under the files. They are drawn once, on one canvas the size of what they reach, and again only when an end moves or the zoom changes by a quarter.
- **The ground is the void's print**: a fine grid of faint dots (`--ink-4` at 55%) that moves and scales with the board (chosen by the user), fading in at its top and bottom edges. While something is carried, the dots round it brighten.
- **Moving.** A file is carried by pressing and dragging it (holding a moment with a finger); carried, it lifts to 1.03 and looks as a box pointed at does. Its edges and middle catch other things' and show a hairline in the planet's colour where they line up. Carried to the edge, the board rolls. Let go on a planet, a moon or the void (in the planet header), it goes there, as from the grid. The corner pearl (the switch's, 16 on the screen at any zoom, 40 to touch) makes it bigger or smaller.
- **Zoom** from 15% to 250%: pinch, ⌘ or Ctrl with the wheel, or the bar's `−` and `+`. The bar's zoom fact (`76%`) is a button that fits everything in sight; ⇧1 does the same and ⇧0 is 100%. A plain wheel or two fingers on a trackpad move round it, and so does dragging the empty board. **The board always opens fitted to its files** (2026-11-16, the user: "auto scale the view of the board when you first click on it to fit the files perfectly"): everything in sight as large as it fits, never past 100%, in the middle of the room between the header and the bar (32 from the sides, 16 on a phone). Where you were is no longer kept.
- **The bar** is one pill of bar glass at the foot: zoom out, the fact, zoom in, then for the owner `Arrange` (`sort`) and `Words` (`textbox`), and for whoever may add `Add` (`plus`, the add box in a small panel). At 720 wide and under these three are their icons alone, so the bar fits across a phone. Joining turns it into "Pick what to join it to" and `Cancel`. A toast stands above it.
- **Its menu** (right-click, or a held finger let go without moving) is the file's own with `Make it bigger` (`plus`) and `Make it smaller` (`minus`), a column at a time (150, 220, 464, 708, 952 across, gliding from its top left corner), `Join with a line`, `Take its line away` and `Bring to front` for the owner; words have `Change the words`, `Make it a label` (or heading), `Join with a line`, `Take the words away`. Pressing a line offers `Take the line away`.
- **The keyboard**: Tab walks the board in reading order, top left first; arrows move the chosen thing 8 (Shift, 48), `-` and `=` (or `[` and `]`) make it smaller and bigger, Enter opens a file or writes in words, the menu key opens its menu, Delete takes words away, Escape stops joining, and ⌘Z (Ctrl+Z) puts back the last move, size or arrangement (a run of arrow presses on one thing is one; up to 40 back), anywhere on the page while nothing is being written in or open on top.
- **Others**: a visitor sees the board as its owner laid it, with the zoom only; on a community planet a newcomer's file arrives below the rest and only the owner moves things. A new file (from Add, autosort, another planet or someone else) goes to the foot of the board's shallowest column, at the size Arrange would give it, and the view glides to show it; files dropped on the board wait in rows of four from where they were let go (before 2026-11-16 several at once went down a diagonal, which made long lines). A file that leaves keeps its place for when it comes back.
- **Only what is near is on the page**: things within a screen of the view are built, and those more than two screens away let their pictures go (Safari keeps every picture it holds).
- **Leaving.** `Show as files again` keeps the board's reading order as the planet's order, and Undo brings the board back as it was. **A board is laid out for you** (2026-11-16; the first time at the user's word "in a way that makes sense but is easy to modify", then "automatically arrange items on a board to be viewable on desktop and arranged in different sizes already for you. right now it's just a long line of images"): a collage in columns 220 wide and 24 apart, each file into the shallowest place it fits, shaped like the room the board opens into (a little wider, as columns run long), so it opens whole on a computer. With mixed sizes, the files most worth seeing large take two columns now and then (a big picture or video, a long piece of writing, a link or page with a picture, a file people have commented on; never two in a row), the first on a big board three; a picture keeps its shape and a tall one is made narrower rather than taller than 1.45 times its width (1.35 when wide); a short note is 132 high, a middling one 220, a long one 300; a note above a gap runs down to close it. Grouped, each group has a heading that is the board's own words (so it can be renamed or taken away) and the groups stand side by side in shelves 48 apart, each as wide as makes the whole the room's shape, the room left on a shelf going to its tallest group. The files glide from where they sat in the grid into these places.
- **Arrange** (the bar's button, the owner only) lays the whole board out again, every file gliding to its new place over the scene length, with `shift` then `drop`, and a toast "Arranged · Undo" (one at a time). Its menu is two sets of choices: Order (`In groups`: by subject when the planet has two or more clear ones, the rest under "Everything else", else by kind; `By kind`: Pictures, Videos, Notes, Links, Sound, Files; `Newest first`; `Oldest first`; `A to Z`; `As they are now`: the board's own reading order, tidied) and Sizes (`Mixed sizes`, `All one size`). The choices are kept on the planet (`order`, `sizes` in the board's settings) and a new board starts In groups with mixed sizes. Headings Mutt wrote before are reused or go; the owner's other words wait in a row above everything; lines stay with what they join.
- **A board that had become a long line or a heap is laid out once by itself** when its owner opens it: a fifth of its files (at least two) mostly covering another, or a shape more than two and a half times wider or taller than the room that only fits at under 45%. It says "Laid out to fit your screen · Undo", and it never does this again on that planet (`laid` in its settings, set by any arrangement).
- On a phone the same board, fitted to the screen (a board laid out on a computer fits across it; Arrange on the phone lays it out for the phone); the bar's buttons are 40.

**File view** (`viewer.js`; the section headed THE FILE VIEW).
- A room. The file is as large as it can be on the left; a picture or a video keeps its shape with corners 12, a 1px `--box-edge` and `--shadow-raised`; a PDF's pages are white paper with `--paper-shadow`; a note is its words on the sky at the size of a list's items; a link is its address in a well, a picture of the page, then its title in Title; a file with nothing to show is a card of box glass.
- **Its name, note, facts, planets and comments are a column of words straight on the sky** to the right, 360 wide, with `--sky-shadow`: no pane and no line between it and the file. The name (Title) and note (Body `--ink-2`) are bare text boxes. Then its buttons (plain "Edit" led by the `edit` icon on a picture you can edit, plain "Download" ending in a caret when it opens the download menu, quiet "Original" ending in the `out` icon), a hairline, its facts as a two-column list of Facts (an edited picture adds `Original` · `1600 × 1200, kept`; a saved copy says `Saved` for its date, then `Made by` and `Saved by` as links to each person, as `Name (@username)` (Names, above), "you" for yourself, and `Saved by` reads "Bo from Cy" when it was saved from someone in between), a hairline, a small label (`ON 1 PLANET`) with a small plain "Planets" ending in a caret, each planet as a 32-high row, then, when copies of the same file sit on other people's planets you can open, a hairline, the label `IN 2 OTHER GALAXIES` (`YOUR COPY` when the only other is yours) and a 32-high row for each of those planets with whose it is as a Fact at the far end, opening that copy there (your own copy kept as a star is one Caption line, "You kept a copy as a star."), the comments, and last the small quiet "Take off …" and "Delete". When the planet it was opened on is the file's only one, "Take off …" is "Make it a star", led by the `star` icon, its tooltip saying it comes off that planet (the user, 2026-11-16).
- **A note's history** (`history.js`, fetched only for your own note once it has an earlier copy): under the facts, a hairline, the small label `HISTORY` with `N earlier` as a Fact at the far end, then a 32-high row for `Now` and for each earlier copy (its name or `Today, 14:02` in Label, its words as a Fact on the right; a named copy's time joins the Fact), five then a quiet small `Show all N`. The row on the stage is `--tint-2`. Picking a copy puts it on the stage in place of the note, under a bar of Mutt's glass (`.bar-glass`, a pill 40 high; on a phone corners 20 with the buttons under the words): when it was written in Label, a key of the two marks as a Fact, a small plain "Back to now" and a small main "Put this back". The words are the note's own size on the sky, marked against now: **added since** washed 28% `--mark-green`, **taken out since** in `--ink-3` struck through in `--danger`. A phrase that changed reads as one mark, struck then added. "Put this back" keeps how it is now as "Before restoring" first. A note's ••• and right-click menus have a `History` row (`history` icon) that opens the file view straight on the latest copy. Nothing shows on a note never changed.
- Top left, two chevrons (the file before, the next one) and `1 / 4` as a Fact; top right, a quiet "Close".
- On a narrow screen it is one page to scroll, the file then its words, with the top row staying put on Mutt's bar glass. A note's stage hugs its words (at least a third of the screen, from the top), and a brief note is set in Page at 500.
- **A PDF's words can be picked**: pdf.js's see-through words lie over each page, and a pick shows as `--blue` at 30% with the page's own words showing through.
- **A PDF's pages are drawn only near where you are**: each page waits as a white sheet of the right shape until it is within 900 of the screen. On a phone a page scrolled far off lets its picture go and is drawn again when it comes back, and whether a page is near is read from where it sits, not from how it looks while the view grows in (a 60-page PDF holds about 7 MB, never more than 14, where it once drew every page at once, about 100).
- **Marking up a PDF** (your own; `pdfedit.js` + `pdfedit.css`, fetched the first time you pick words or press "Mark up"). Everything is written into the PDF itself, as real PDF marks any reader shows, and saves by itself a moment after each change.
  - "Mark up" is a small plain button beside the zoom, lit while marking. Picking words brings a bubble of bar glass, the editor's: the five marker swatches, underline, strike, a note, and (on one line) change these words. A chosen mark gets a 1.5 outline in `--paper-blue` (corners `--r-mark`), a grip to resize ink, and its own bubble (colours, note, delete).
  - The bar is bar glass at the foot of the pages, pill-shaped: Pen, Text box, Note, Signature, Change words (quiet round buttons), the colour (a swatch that opens a small panel: colours, then Line or Size as a segmented bar), Undo, Redo, the save word as a Fact, and a small main "Done". Escape puts down the tool, then the choice, then finishes. On a phone the dividers and the save word step out so Done stays in view. On a phone (480 or less) its buttons are the small size (32, with the 40 reach round each), so every tool and Done stay in view on a 375 screen.
  - Marks are paper colours: the markers are `--mark-*` laid on multiplied at 40%; ink and text are `--paper-ink`, `--paper-blue` or `--paper-caret`. A note is a small tab of its marker colour with the `comment` icon in `--mark-ink`; a highlight's note shows the same tab in the margin.
  - Changing words covers the old line with a patch of the page's own colour and types the new words over it in the closest PDF face (Type), in the line's own ink; while typing, the line itself is the text box, outlined in `--paper-blue`.
  - The signature is drawn once on a pad of paper in a dialog, kept on the device, and placed with a click.
- **A Word, OpenDocument or RTF file** shows its pages read into paper (the document's look: `--serif`, headings at Page, Title and Lead). It, a PDF, a text or a Markdown file of your own has a plain "Make it a document" (icon `page`) under Download: a Mutt document is made beside the file (the file is kept), and opens.

**Photo editor** (`photoedit.js`; `photo.css`, fetched with it the first time a picture is edited).
- A room, opened from the file view's "Edit" or a picture's menu (`Edit picture`), laid out like the file view: the picture as large as it can be on the left, keeping its shape, with corners 12, a 1px `--box-edge` and `--shadow-raised`; Mutt's tools on the right, 360 wide.
- **The tools are one panel of bar glass** (corners 20, `--shadow-float`, Mutt blue on every planet): the shared tabs (`Crop`, `Light`, `Colour`, `Detail`, `Draw`, `Size`), the tab's controls, and at its foot over a hairline a small quiet `Start over` and a Fact saying what it will save (`1080 × 1080 · JPEG`). A tab's controls rise in one after another, one step apart, each over arrive.
- Crop: a segmented bar of shapes (Free, Square, 4:3, 16:9), the turn and mirror round buttons (`turn-left`, `turn-right`, `mirror`, `mirror-down`) under a small label, and the Straighten slider. While cropping the picture's corners are square; what is cut away lies under `--room-veil`, the kept part is edged in 1px white with white corner brackets and edge bars 3 thick drawn just inside it, and the lines of thirds show while it moves. Light, Colour, Detail: sliders, and Colour's black and white is a switch. Draw: a segmented bar of tools (Pen, Marker, Arrow, Text), eight swatches under a small label, a segmented bar of sizes (Fine, Medium, Bold), one line of hint, and a small quiet `Clear drawing`. Words written on the picture are typed into the shared text box, at the size and in the colour they will be. Size: a segmented bar (Full size, Large, Medium, Small) and a hint.
- Top left, quiet round Undo and Redo and a quiet `Before` (held, it shows the picture as it was); top right, a quiet `Cancel` and a main `Save`. Cancel with changes asks first in a dialog.
- Saving replaces the file everywhere and keeps the original: the toast says `Saved · 1080 × 1080 · the original is kept`. `Start over` on an edited picture goes back to the original.
- It opens at once (2026-11-16): until the whole picture has come from the server the room shows the picture as it is shown elsewhere (its preview), its crop frame hidden, the tools and Before waiting, Cancel working and Save busy saying `Opening it…`; then the picture takes its place and Save takes the focus.
- On a phone (under 720 wide) the panel sits under the picture, the full width, corners 20 at the top only, at most 46% of the screen high, and its tabs scroll sideways.

### The parts as built, and the sample page

Every part above is one set of classes in the section of `galaxy.css` headed **SHARED PARTS**, written only with names from `tokens.css`. A feature's own styles hold layout and these class names; they never restyle a part.

| Part | Classes | Built by |
| --- | --- | --- |
| Button | `.btn` (plain) with `.btn-main`, `.btn-quiet` or `.btn-danger`; `.btn-small` or `.btn-large`; `.btn-round`. Busy: `.is-busy`. Held on: `.is-on`, or `aria-pressed` / `aria-expanded` | markup |
| Text box | `.field`; `.field.field-search` (a label that holds chips and a bare input); `.field-bare` | markup |
| Switch | `label.switch` > `input` + `.switch-track` > `.switch-knob`, then its words | markup |
| Segmented bar | `.seg` > `.seg-ind` + `.seg-btn` | `segmented()` in `ui.js` |
| Tabs | `.tabs` > `.tabs-ind` + `.tab` | `segmented(…, { tabs: true })` |
| Tick box | `label.tick` > `input` + `.tick-box`, then its words; or `.tick-box` alone in a row that is `.is-on`, or in a button that carries `aria-checked` | markup |
| Swatch | `button.swatch` with `--c` (`.swatch-large`, `.is-none`); chosen by `aria-pressed`, `aria-checked` or `.is-on` | markup |
| Bar glass for a feature's tool | `.bar-glass` on the tool's own element | markup |
| Room | `.room` on the place's own element | `enterRoom()`, `leaveRoom()` in `ui.js`; `transition(fn, { type: 'room' })` |
| Icon | `svg.ic` (`.ic-small`, `.ic-large`); a body part is `.b` | `icon(name, size)` in `icons.js` |
| Offer | `.lm-offer` > its drawing (`.offer-drawing`, from `drawing(name)` in `icons.js`), `.lm-offer-text` (`.lm-offer-title`, `.lm-offer-signs`, `.lm-offer-note`), `.lm-offer-btns` | `modeOffer()` in `offers.js` |
| Chip | `.chip` > `.chip-dot`, words, `.chip-x` | markup |
| Stepper | `.stepper` > `.stepper-btn` + `.stepper-value` + `.stepper-btn` | `stepper()` in `ui.js` |
| Slider | `.slider` > `.slider-head` (`.slider-label`, `.slider-value`), `.slider-track` > `.slider-fill` + `input.slider-input` | `slider()` in `ui.js` |
| Calendar | `.cal` > `.cal-head` (two `.btn-round`, `.cal-month`), `.cal-names`, `.cal-days` > `.cal-day` (`aria-selected`, `aria-current`) / `.cal-gap` | `calendar()` in `ui.js` |
| Time wheel | `.wheel` (`.is-off`) > `.wheel-col` > `.wheel-list` > `.wheel-item` (`.is-at`), `.wheel-colon`, `.wheel-band` | `timeWheel()` in `ui.js` |
| Menu | `.pop` > `.menu` > `.menu-item` (`.is-danger`) > `.menu-icon`, words, `.menu-hint`, `.menu-tick`; `.menu-sep`, `.menu-head` | `openMenu()`, `openContextMenu()` |
| Small panel | `.pop.pop-panel` | `openPopover(…, { className: 'pop-panel …' })` |
| Sheet | `.sheet` (`.sheet-settings`, `.sheet-person`) > `.sheet-head` (`.sheet-who`, `.sheet-sub`), `.set-row` (`.set-label`), `.sheet-deleted` (`.sheet-deleted-files`, `.sheet-deleted-more`), `.sheet-actions` | `sheet()`, `recentlyDeleted()` and `personBody()` in `statusbar.js` |
| Sheet page | `.sheet-pages` > `.sheet-page`; on the first, `.sheet-doors` > `.sheet-door` (`.sheet-door-name`, `.sheet-door-fact`, icon); on a page, `.sheet-head.sheet-page-head` > `.sheet-back`, `.sheet-page-name`, `.sheet-page-tools`; a fact with a button in a row `.sheet-fact-row` > `.sheet-fact` | `sheetPages()` in `ui.js` |
| Dialog | `.scrim` > `.dialog` (`.dialog-wide`) > `.dialog-title`, `.dialog-text`, `.dialog-msg`, `.dialog-actions` | `openDialog()`, `confirmDialog()` |
| Toast | `.toasts` > `.toast`; uploads `.toast.is-upload` > `.toast-void` | `toast()`; `uploads.js` |
| Tip | `.tip` > `.tip-title`, `.tip-text`, `.tip-btns` | markup |
| Comment note | `.cn-notes` > `.cn-note` > `.cn-open` (`.cn-lead`, `.cn-text` > `.cn-line` > `.cn-what` (`.cn-at`, `.cn-file`), `.cn-when`; `.cn-said`) + `.cn-x` | `commentNote()`, `commentNotes()` in `commentnotes.js` |
| Comet note | `.cn-notes.cm-notes` > `.cn-note.cm-note` (the comment note's parts, `.cm-lead`) + `.cm-acts` | `cometNote()`, `cometNotes()` in `remind.js` |
| Comet row | `.vw-comet` (`.vw-comet-*`) | `cometRow()` in `viewer.js` |
| Comet card | `.pop.pop-panel.cm-card-pop` > `.cm-card` > `.cm-card-row` (`.cm-card-tick` > `.tick-box`, `.cm-card-text`), `.cm-card-meta` (`.cm-card-when`, `.cm-card-on`), `.cm-card-acts` | `cometCard()` in `remind.js` |
| Comet: when | `.dialog.cm-ask` > `.cm-ask-picks` > `.btn.btn-small.cm-ask-pick`; `.cm-ask-fields` > `.cm-ask-field.cm-ask-day` (`.liv-label` + `.cal`) and `.cm-ask-field.cm-ask-time` (`.cm-ask-head` with `.liv-label` + `.cm-ask-notime`, then `.wheel`); `.cm-ask-note` (`.is-gone`); the dialog is `.dialog-wide` | `askWhen()` in `remind.js` |
| List comet mark | `.lm-comet` | `cometEl()`, `paintComet()` in `listmode.js` |
| Tooltip | `.tooltip` > `.tooltip-text`, `.tooltip-key` | `tooltip.js`, for anything with a `title` or `data-tip` |
| Drop hint | `.drop-word`, `.is-drop` on what takes the files, `.drop-ring` round the void (the drop ring) | `main.js` |
| Drop ring | `.is-target` on a planet, moon or star, `.is-picking` on a star, `.gx-ghost`; shows under `html.has-dust` | `dropring.js` |
| Section heading | `.sec-head` > `.sec-name`, `.sec-fact`, `.sec-tools` | `sectionHead()` in `ui.js` |
| File box | `.cell` > `.cell-box` > `.cell-fill` > a face (`.face-shape` > `.face-img`, or `.face-text`, `.face-link`, `.face-file`), `.cell-tag`, `.cell-actions`; then `.cell-cap` > `.cell-title`, `.cell-fact`. In its own section of `galaxy.css`, THE FILE BOX | `renderCell()` in `cells.js` |
| Add box | `.cell.cell-entry` > `.entry` | `entryCell()` in `entry.js` |
| Planet header | `.liv-head` > `.liv-world`, `.liv-info` (`.liv-title`, `.liv-desc`, `.liv-meta`), `.liv-tools`. With the planet's page in `galaxy.css` | `views/planet.js` |

Bar glass is the one rule at the top of that section; a new thing on bar glass joins its list. That rule also sets `--accent` and the five `--mutt-*` values back, which is what keeps Mutt's own things blue on a planet's page.

**The sample page** is `/parts` in the app: every part in every state, at any width. It is linked from nowhere and its code (`js/views/parts.js`) and layout (`parts.css`) are fetched only when that address is opened. Its "pointed at", "pressed" and "keyboard" samples are not drawn by hand: when the page opens it copies every rule that has one of those states from the live stylesheets, so a sample can't drift from the app.

**To add a part:** (1) draw it on `/parts` as one more `section(...)` in `js/views/parts.js`, with each state (`held(el, 'hover' | 'active' | 'focus')`, `off(el)`); (2) show the user, with options where there is a real choice; (3) add it to this section with its sizes and states, and to the table above; (4) add its rules to the SHARED PARTS section of `galaxy.css`, using only names from `tokens.css` (a value that has no name gets one here and there first); (5) use it. `tests/run.sh browser sample_page` opens the page at both widths.

### Icons

One set, in one file: `public/assets/js/icons.js`. `icon(name)` is the only way to put an icon on the page. Every icon is on the sheet at `/parts`, which reads the file itself.

**Using one**

- `icon('lock')` gives the icon at 16. `icon('close', 12)` inside a chip, a tag or a caption. `icon('back', 20)` in the editor's and the reader's bars, for the back arrow in the corner of a page, an empty photo slot and Stop cooking. No other size.
- The name must be one from the list below. A name the file doesn't have draws the three dots and writes an error to the console, so a wrong name shows up in the browser checks; when a name is built from a value (`align-${k}`), check each one it can make.
- It takes the colour of the words beside it (`currentColor`). In a menu row it is `--ink-3`; in a dangerous row, red with the words. Don't colour an icon on its own.
- Beside a word in a button, the button's own gap spaces it: `h('button', { class: 'btn' }, icon('plus'), 'New card')`. An icon that says what a button makes or does leads the word (`plus`, `check`, `pot`); one that says where the button takes you ends it (`out` on a button that opens outside Mutt, `caret` on one that opens a menu or a panel).
- A button that is only an icon is a round button (`.btn-round`) and always has both `aria-label` and `title`, so it has a name for a screen reader and a tooltip.
- **Never a keyboard character.** × + − ✓ ••• ← → ↗ ▾ are not icons. Never a second way of drawing either: no SVG typed into a feature, no mark made of CSS borders.
- **A tail to leave, a chevron to step.** `back` (an arrow with a tail) takes you somewhere else: to the galaxy, out of the editor. `chevron-left` and `chevron-right` step to the next thing of the same kind: the next file, the next recipe card. `chevron-up` and `chevron-down` step through matches. `caret` only ever means "this opens a menu".
- **It lights when pointed at.** A part of an icon marked as its body (the inside of a lock, a page, a speech bubble) is empty at rest and fills with `--icon-lit` of its own colour when its button or menu row is pointed at, and stays filled while the button is held on (`.is-on`, `aria-pressed`, `aria-expanded`). This is automatic; a feature writes nothing for it.

**The names** (105)

- *Everyday:* `plus` `minus` `close` `check` `more` `grip` `caret` `chevron-left` `chevron-right` `chevron-up` `chevron-down` `back` `forward` `up` `down` `out` `search` `zoom` `undo` `redo` `upload` `download` `sort` `link` `copy` `trash` `edit` `open` `play` `pause` `shuffle`
- *Pictures:* `turn-left` `turn-right` `mirror` (side to side) `mirror-down` (top to bottom)
- *Mutt's own things:* `planet` `moon` `star` (a file on no planet) `lock` (private, locked) `key` (opened with a code) `people` `globe` (public) `comment` `move` (to a planet) `onto` (put on a planet, save) `takeoff` (take off a planet, leave a planet kept together) `beam` (send a file to someone: a small star leaving on two trails) `pair` (a planet two people keep together: two rings overlapping) `files` (show as files) `board` (a board: cards laid loosely, and words) `page` `book` `bookmark` `note` `pot` `chapter` `camera` `picture` `colour` `tick` `untick`
- *In menus:* `history` `print` `setup` (options) `replace` `count` `spell`
- *Writing:* `side` `bold` `italic` `underline` `strike` `align-left` `align-center` `align-right` `justify` `bullets` `dashes` `numbers` `letters` `roman` `checklist` `outdent` `indent` `spacing` `clear` `type` `highlight` `heading` `quote` `table` `rule` `pagebreak` `code` `auto` `prose` `poem` `script` `journal` `letter` `scene` `sign` `date` `pen` (draw by hand) `textbox` (a box of words placed on a page)

In Mutt's own things a circle is a planet: an arrow into a circle moves a file to one, a plus in a circle puts it on one, a minus in a circle takes it off.

**Drawing a new one**

1. Look for it first. Most things a feature needs are already here under a plainer name (`setup` for any options, `edit` for rename, `open` for open).
2. Draw it in `icons.js`, in the table, in the manner of its neighbours: a 16 by 16 grid, kept inside 1.75 to 14.25; lines only, for a 1.5 line with round ends and joins; frames with corners of about 1.75; coordinates on quarters. An icon is a list of parts joined by `|`: a plain part is a line; `b:` is a closed outline that is the body of the thing (one outline per part; it is what lights); `d:` a solid dot; `s:` a solid shape.
3. Keep it to what reads at 16. If it needs more than about four strokes, it is a drawing, not an icon.
4. Open `/parts`: it appears on the sheet by itself. Look at it at 16 beside its neighbours and on a menu row.
5. Show the user, add its name to the list above, then use it. The user approved every icon here as a sheet (session 6); a new one is shown the same way.

**What looks like an icon and isn't** (leave these as they are)

- The tick inside a tick box: part of the box, drawn in the stylesheet at `--tick-line`, so it can spring in.
- A list's bullets (•, →, *, –): the owner's choice of bullet, set as type.
- The names of keys beside a menu row (`⌘F`): Facts.
- The × in a picture's size and in a recipe's `×2`: a word.
- A file's own sign in its box (a song's bars, a page, a cover): pictures of the file ("File box").
- The small void that leads a toast: the void itself.
- An offer's drawing: a drawing, from the same file ("Offer").

## 5. How to style a new feature

Follow these in order. For a mode, this is step 6 of "How to add a mode" in `CLAUDE.md`.

1. **Read this file and open `design/look-board.html`.** Find the nearest thing already drawn.
2. **Say what each piece is**, then take its material from the table in section 3. The owner's things and what a feature shows them on a planet: box glass (`.fglass`). Mutt speaking (menus, sheets, dialogs, toasts) and Mutt's own tools inside a room: bar glass (`.bar-glass`). Writing: paper. A thing you press: gloss. A thing you type in or slide: a well. If nothing fits, the piece is probably one too many. If the feature takes the whole screen, it is a room: follow "Room" in section 4, and read the nearest mode under "The modes".
3. **Build it from the parts in section 4.** A feature's file contains layout and the parts' class names. It does not contain a button, a menu or a box of its own, and its icons come from `icon()` in `icons.js` (section 4, "Icons"): never a keyboard character, never a drawing of its own. If a part is missing, stop: draw it on `/parts`, show the user, add it to this file and to the shared parts, then use it (section 4, "To add a part").
4. **Set the words.** Each line of text takes one role from the type table and the grey that goes with its job. Words straight on the sky get `--sky-shadow`. A serif only on paper.
5. **Space it** with the eight spaces, the three heights and the five corners. A corner inside a corner is the outer one minus the padding.
6. **Colour it** only with named colours. On a planet's page, box-glass things take `--pc` and their main button takes `--pa`; nothing on bar glass does. Signals only where they mean it.
7. **Frame less.** A caption, a heading or a row doesn't get a box. Only a thing someone would pick up (a file, a card, a panel) is boxed. When in doubt, set it straight on the sky.
8. **Make it move by the rules in section 2, "Motion".** Find the nearest thing in its list of everything that moves and do as it does. Opening: the box slides up 16px while its parts fade in and come into focus (`--dur-arrive`, `--ease-settle`, parts one `--stagger` apart, at most 14 of them). Closing: the same backwards over `--dur-change` on `--ease-leave`. Pointing and pressing: `--dur-quick` and `--dur-change`. Never type a length or a curve: a name from `tokens.css`, or `DUR` / `EASE…` / `STAGGER` / `BEAT` from `util.js`. Put fades and blurs on the box's parts, never on a parent of glass. Fill entrances `backwards`, never `both`. Add the new thing's line to the list.
9. **Make it sound by the rules in section 2, "Sound".** Most of a feature sounds by itself: buttons, menus, sheets, dialogs, switches, rooms and page changes made from the shared parts already do. For each thing it adds that a person moves or finishes (carrying, rearranging, something landing, opening, something done), find the nearest sound in that section's table and call `sound(name)` from `sound.js` at the moment the movement starts (a page change: `moving` in `transition`; a room: `whenMoving`), or as it lands when the sound is a landing. A sweep sweeps, a landing is a soft pat, only a real click clicks. Nothing that happens by itself sounds. A truly new sound is made in `soundbank.js` from the parts there as its movement, measured, and played to the user first.
10. **Keep it calm at rest.** A new feature adds nothing that moves while idle. Only the sky, planets turning and the slow float of file boxes may. No endless animation without the user's yes.
11. **Make it work without a pointer.** Every control is reachable by keyboard and shows the outline (`:focus-visible`: 2px `--blue-ink`, 2 away; round things carry it as a ring: a planet, the void). Tab stays inside whatever is open on top (a dialog, a menu or panel, a room, a sheet): `topLayer` in `ui.js` does that for those four, and a new kind of layer is added there. Inside a layer Mutt moves Tab from stop to stop itself, every button included, so it works the same in Safari, whose own Tab skips buttons. Anything closed but still on the page (a sheet, the void's box) is `inert`. On touch screens controls are 40 high; one that must keep a small look gets a 40 tap area by joining the list under "Room for a fingertip" in `galaxy.css`. Nothing appears only on hover.
12. **Make it work under Motion: Still.** Every animation ends on its last frame, in no time. Never pause an animation to stop it (a paused entrance stays invisible).
13. **Keep it light.** It meets "What Mutt may cost" in section 2 (nothing new runs at rest; nothing makes the page wait). Its styles go in its own stylesheet, fetched together with its code, and waited for: `Promise.all([import('./name.js'), styles('name.css')])` (`styles` is in `util.js`; copy the `documents` entry in `modes.js`). Only what must show before its code arrives (an offer's drawing) goes in `galaxy.css`. A plain planet loads none of it.
14. **Look at it** in the hidden browser at 1280 and 375 wide (`tests/run.sh browser`, pictures in `tests/shots/latest`), before and after. Give the user a short list of what to watch at real speed.
15. **Write it down**: anything new or changed goes into this file in the same session.

Checklist before calling it done:

- [ ] Every piece is one of the five materials, and glass is `.fglass` or bar glass, not a fill of its own.
- [ ] No colour, size, corner, shadow or speed typed by hand; no new text size or weight. `tests/run.sh drift` passes.
- [ ] Only parts from section 4; anything new was added here first.
- [ ] Every icon is `icon(name)` from the set; no character or hand-made mark stands in for one; every icon-only button has `aria-label` and `title`; a menu's rows all have icons or none do.
- [ ] Planet colour only on box-glass things on that planet's page; nothing on bar glass took it.
- [ ] A full-screen place is a `.room`: it paints no background of its own, the page steps away, it arrives through `transition(…, { type: 'room' })`, and a dialog opened from it shows.
- [ ] Paper is `--paper`, flat, corners 4; a serif only on it.
- [ ] Nothing new glows, leans or moves at rest.
- [ ] A file is shown in the file box (`renderCell`), a group of files under a section heading (`sectionHead`); nothing on a planet's page is inset on its own.
- [ ] Opens and closes on the shared lengths and curves; leaving is `--dur-change` on `--ease-leave`; no fade or blur on a parent of glass; its line is in the list of everything that moves.
- [ ] What a person moves or finishes sounds with a name from "Sound" (none of its own), starting with its movement; nothing that happens by itself sounds; its line is in the Sound table.
- [ ] Keyboard outline visible everywhere; Tab stays inside what is open; nothing hover-only; 40 to tap on touch.
- [ ] No sideways scroll at 375 wide; no console errors; Motion: Still shows everything.
- [ ] A plain planet loads none of its files.
- [ ] `DESIGN.md` updated, and the "where the app stands" table if this changed it.

## 6. What was decided, and what is still open

Decided by the user, 2026-11-11 (the alternatives are on the boards in `design/`):

- A planet's colour is for the planet's own things only; shared controls stay Mutt blue.
- Comets (2026-11-16, design board idea 12): reminders you can see. A note with a day is offered as a comet (never made one by itself); it crosses your sky in print with two tails, from when it was made to its day, hotter and redder as it nears, waits burning on its day until Done or Later, and reminds you by notification and a note under the clock (an hour or the evening before, then at its time). Not built, on purpose: a comet gliding along its path while you watch (it is placed where it is today), and repeats other than yearly. Any file can be a comet from its menu, with its day picked by hand.
- Comets, 2026-11-23: ticked off or done, a comet burns up into the void (no more leaving over two days); each reminds you once, with no heads-up; its notification is titled Mutt with Mutt's icon.
- Quotes (2026-11-16, from `design/quote-board.html`): the user chose the commonplace book with a slideshow. A quote's own voice is the italic serif, on its card and in the slideshow. Not built, on purpose: a quote's look in an ordinary file box and in the file view, and saving a quote as a picture (all on the board).
- Boxes are calm at rest: the slow float stays; glow and lean only on the box pointed at or typed in.
- Small words: brighter greys, the faintest never for words, and the soft shadow under words on the sky.
- A box at rest carries a faint edge of the planet's colour and no halo.
- Small labels stay as spaced mono capitals (plain words were offered and turned down).
- Glass: the deeper frost; bar glass one flat dark fill.
- Gloss: one light from above on everything pressed (the softened Vita sheen, not satin and not gel).
- Serif on paper: Newsreader, everywhere.
- One logo, the Wonky. Four skies, tuned alike.
- The sky: print dust in a river over a deeper floor, many mixed stars with a few fringed flares, a hint of liquid light, old film grain, slow movement; threads in the universe. The user found the first print sky "boring and repetitive and static" and the first stars "a bit too much", and wants it "evolving but not too distracting": keep it that side of the line.
- Throw to Sort and Speak to the Void (2026-11-16, ideas 06 and 19 on `design/concepts/`): stars **and** file boxes can be thrown (a box at a moon or its planet); voice notes are read by the small English reader on the device; a voice note follows the void's "To"; a voice star's rays are its sound. Not built, on purpose: throwing with the keyboard (the menu's "Put on…" does it), reading other languages, and a sound for either (the Mutt Sounds work may add them: the moments are a throw landing, the void starting to listen, and letting go).
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

Decided by the user, 2026-11-12 (design session 4; the page with the alternatives is `/Users/edan/Mutt-notes/design/session4/planet-page-2026-11-12.html`):

- The planet's header sits on the sky with no box (a glass panel and a large centred world were offered).
- A picture keeps its own shape in its frame (cropping to fill, and a glass mount, were offered).
- The frame is a little taller than wide, four to five (my pick of a square was turned down).
- Files that aren't pictures, notes or links each get a small sign of their own (all alike was offered).
- The caption is the name and one fact (my pick of the name alone, centred, was turned down).
- The add box is a sunken slot, not glass like a file.
- A section heading shows only where a page has more than one group.

Decided by the user, 2026-11-12 (design session 5; the page with the alternatives is `/Users/edan/Mutt-notes/design/session5/modes-2026-11-12.html`):

- Behind a full-screen place: the real sky, stepped back (one flat night was offered).
- The file view: its words on the sky with no pane (a glass pane, and the file alone with a Details button, were offered).
- A list's items: a strip of glass each (my pick of one ruled pane was turned down; written on the sky was offered).
- A list's tick: the shared tick box (my pick of keeping the pen stroke was turned down).
- Recipe cards: the box of index cards with chapter tabs, tidied (cards in the file grid were offered).
- Cooking: kept large, for arm's length, with two named sizes of its own.
- A desk keeps its serif for the planet's name and the names under pages (my pick of serif only on the paper was turned down).
- The shelf: covers standing (the file frame, and a glass ledge, were offered).
- The reader: its bar and panels take the page's colour (my pick of a page lying on the sky was turned down; Mutt's dark glass over the page was offered).

Decided by the user, 2026-11-12 and 13 (design session 6; the page with the alternatives is `/Users/edan/Mutt-notes/design/session6/icons-2026-11-12.html`):

- The line is 1.5 (1.25 and 1.75 were offered).
- An icon is line only at rest and its body lights when pointed at or held on (line only always, and a faint fill always, were offered).
- Icons are 20 in the editor's and the reader's bars (my pick of 16 everywhere was turned down).
- Menus of things to do carry icons; menus of choices carry a tick.
- A tail to leave, a chevron to step (all chevrons, and all tails, were offered).
- A word that carried a character keeps an icon beside it (the word alone was offered).
- All 93 icons approved as drawn; the star added after as a point of light with four rays (a five-point star, and the four-point star that now reads as an AI mark, were offered).
- An offer's drawing: of the four first shown, only the cookbook's was liked, so all four are panes in its manner, with a glass fill (line only was offered).
- Split into moons' drawing: a planet with its moon on one pane (a pane lifting off, and two moons stepping out from behind, were offered).

Decided by the user, 2026-11-13 (design session 7; the page with the alternatives is `/Users/edan/Mutt-notes/design/session7/worlds-and-sky-2026-11-13.html`):

- The sky, built the cheap way: yes, as it is.
- "Recenter the design of planets" means around the world itself: better worlds first, files modest on them.
- Files on a planet: cards in a belt, each drawn as what it is (three big faces, and one face at a time facing you, which was my pick, were turned down).
- All eight kinds are redrawn, Moon rock goes, and there are **twelve kinds**, each with its own effects and weather, keeping the charm of today's style. All twelve approved as drawn. Their names are plain and descriptive (names after real space things, Hycean, Janssen, Coriolis and the like, were offered and turned down). Moon rock planets become Pearl mist.
- 2026-11-16: two more kinds, **Stardust** and **Twilight**, picked by the user from four offered (Crystal and Blue giant were the others). The same day the colour picker went into the type box: press the chosen type again for the next colour, press outside to leave.
- A planet shows its use. What counts: files added or changed on it. How long: calm after a week, dust from one month, full at three (my pick of a gentler scale was turned down). Who sees it: everyone who can open the planet (my pick of dust for the owner only was turned down).
- Coming back to a dusty planet: the dust blows off, as weather changing, not as a wipe (a bright edge sweeping across was shown first and turned down as too digital).
- Rings are on any planet with ten files or more, of any kind, never one kind's own mark.
- The void is drawn finest: full sharpness, evenly laid dots, smooth strands, a hairline of light on the near strands (a sharper and a finer print were offered).
- Pointing at a planet: lively. Opening one: a dive. Turning: about a minute a turn.
- The logo flickers when pointed at as well as when Mutt opens (my pick of only when Mutt opens was turned down).
- Built in two parts: the sky, the universe and the logo first; then the planets.

Decided by the user, 2026-11-13 (design session 8; the page with the alternatives and the measurements is `/Users/edan/Mutt-notes/design/session8/motion-and-speed-2026-11-13.html`):

- Things arrive at today's pace, tidied onto the names (a brisker pace was offered).
- Everything leaves in a fifth of a second (`--dur-change`), speeding up as it goes (a third of a second was offered).
- Every menu opens the lively way the right-click menu did: it grows from where you pressed, rows follow, one highlight glides (plain everywhere, and two kinds, were offered).
- The dive and the pull away stay as session 7 built them (a shorter, flatter one and a long fall were offered).
- A page flies open on the even glide, eight tenths of a second each way (the arriving curve, and the editor's old curve of its own, were offered).
- The phone note ("Mutt is in testing and not made for phones yet") was removed on 2026-11-16, when phones were redone at the user's word.
- The new names: `--dur-grand`, `--ease-leave`, `--stagger`, the three beats.

Decided by the user, 2026-11-16 (the drawings are in `/Users/edan/Mutt-notes/design/stars-2026-11-16/`):

- Stars (loose files) stuck out: flat, bright, rounded squares like app icons over a painted scene. They are now points of light that open into cards lit from the void as the pointer comes near ("Stars" in section 3). A stippled print, points alone, Vita bubbles and lit cards alone were offered.
Decided by the user, 2026-11-16 (Constellations; the choices were put as questions in the session):

- A constellation sits out in the sky as its own figure among the planets (staying inside the cluster round the void was offered).
- Its lines are wisps of dust like the threads (fine straight hairlines were offered).
- It offers to become a planet at 4 stars (my pick of 6, and 8, were offered).
- Its name box starts empty, and an unnamed one is called "Constellation" (my pick of a name suggested from its files was turned down).
- Not yet seen by the user: the `sky` drawing on `/parts`.

Decided by the user, 2026-11-16 (the drop ring; three drawings were shown in the session):

- The dashed circles round a thing being dropped onto were "too perfect". They are now a loop of dust ("Drop ring" in section 3), and so is the void's blue ring for files from the computer ("Yes, match it"). Dust drawn in toward the thing, and its air lighting up in dots, were offered.

Decided by the user, 2026-11-16 (the board; asked as questions in the session, from `design/concepts/18-board.html`):

- A file's name on a board shows only while it is pointed at, chosen or reached by keyboard (always, and never, were offered).
- A board's own words are in Mutt's face, Red Hat Text (the serif, and the mono, were offered).
- Of the extras, lines between files only (frames round a group were offered and left out).
- The ground is faint dots that move with the board (plain sky, and a grid of lines, were offered).
- A board is laid out for you as a collage of mixed sizes shaped like the screen, with an Arrange menu of orders and sizes, ⌘Z, and it always opens fitted to its files (2026-11-16, the user's words, after a board became a long line of pictures).
- After trying it: any planet can become a board from its ••• menu (2 files or more), without waiting to be offered; the offer comes after 8 moves in two weeks on any days, 4 files or more (it was 12 moves on 3 different days, 6 files, which nobody could reach on the day it went live).

Decided by the user, 2026-11-16 (a planet kept together and beaming, asked in the session; "Kept together and beaming" in section 3):

- Anyone can beam anyone; from someone never met here it waits quietly (a pile with no ring and no note) and goes after a month.
- A beamed file arrives as a star by the void with one ring of dust, tagged "from Sam", plus a note under the clock. It isn't yours until Keep, Put on a planet or Let go.
- Making a planet shared is offered for people who already share it, or by starting from the person ("Make a planet with Rae", 2026-11-16), which shares it with them by name as it is made.
- Leaving, and deleting an account, leave both people with everything.
- In the universe the two galaxies sit side by side and the kept planet is drawn once between them.
- Autosort never puts a file on a kept planet.
- The `beam` and `pair` icons ("Both are fine"; the first `pair` looked like ♋ and was redrawn).

Still open: whether every move feels right at real speed (the user's eye: the watch list on session 8's page); the three things under "Not finished, and known" in section 2, "Motion".

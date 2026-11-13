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
| Icons | **Done (session 6).** One set of 94 in `public/assets/js/icons.js`, drawn the same way everywhere and got with `icon(name)`; no keyboard character stands in for an icon; menus of things to do carry icons; the four offer drawings are panes from the same file. Section 4, "Icons". | Session 6 ✓ |
| The sky, the universe, the logo | **Done (session 7, part one).** The sky of section 3, built to its cost rules in `js/sky.js`; the universe is black with no stars, and beads of light travel the threads of its web; one logo, the Wonky. | Session 7 ✓ |
| Planets, the files on them, how they show their use, their motion | **Done (session 7, part two).** Twelve kinds each with its own weather and effect, files as cards in a belt each drawn as what it is, use shown as weather or dust, rings on any planet with ten files, the dive on opening a planet. Section 3, "Planets". | Session 7 ✓ |
| Motion, speed, the keyboard and phone sizes | **Done (session 8).** Six lengths, four curves, one step and three beats, all named; no stylesheet or script types a length or a curve (`tests/run.sh drift` counts 0 of each). Every menu opens one way. Section 2 "Motion" has the rules, the list of everything that moves, what Mutt may cost and how to measure it. Not done, and named there: the sign-in hang seen twice, the editor's word count on a phone, Safari and a real phone. | Session 8 ✓ |

### Values that still hold yesterday's number

Session 2 changed nothing a person can see. So where this file asks for a different value than the app had, the name exists but still holds the old value. Each line in `tokens.css` that does this ends with `WANTS <value> (session N)`. This is the to-do list; when a session switches one, it deletes the `WANTS` note and the row here.

None are left: the sky was the last, switched in session 7.

One name kept from before that is not in this file (`--bg`) sits in a marked block at the foot of `tokens.css`. Don't use it in new work.

### What sessions 2 to 6 left for later, on purpose

- **Values off the scales stay hand-typed** until their part is rebuilt: a few 12.5 and 11.5 text sizes, 14 and 10 corners, 0.3 and 0.25 second motion. They are what `tests/run.sh drift` counts. In the stylesheets, after sessions 2, 3, 4, 5 and 6: colours 501 → 448 → 432 → 189 → 180, text sizes 204 → 176 → 163 → 74 → 73, corners 168 → 141 → 137 → 90 → 82, shadows 97 → 94 → 93 → 64 → 62, speeds 279 → 254 → 243 → 191 → 191. After session 7's first part: colours 177, text sizes 69, corners 80, shadows 62, speeds 187 (the old sky's and the four other logos' rules went). After session 8: speeds 0, in stylesheets and in scripts.
- **`galaxy.css` still opens with "the older base"**: what is left of the old white site's stylesheet (the top bar, page heads, sign-in, the markdown rules, settings). The file view's rules left it in session 5. Nothing new goes in that section.
- **A setting is not a palette.** The editor and the reader keep a few names of their own for what the owner has chosen, set by their scripts: `--de-size`, `--de-lh`, `--de-face` (a document's type size, line height and face) and `--rd-size`, `--rd-lh`, `--rd-font`, `--rd-h`, `--rd-vw` (the reader's, and the size of its page). They hold no colour.
- **A document's own colours are typed where they are used**: the eleven inks a writer can choose and the six rhyme colours of a poem (`doceditor.js`, `docs.css`), and the colours a `::highlight()` paints (find, spelling, rhyme, comments), which can't read a named value in every browser.
- The planet colour picker's dots are the planet's own kind of world painted in each colour (`worldDot`, `.planet-swatch`), not the shared swatch. The lock drawn on a locked world is the set's lock at whatever size the world asks for (`icon('lock', n)` in `planets.js`), the one place an icon is not 12, 16 or 20.
- Mutt keeps no icon for a link's site, so a link's caption is the site's name alone. Search's planet picker rows (`.cx-row`) are their own.

## 1. Principles

1. **The sky is the page.** Nothing paints its own page background. Everything sits on the one sky.
2. **Five materials, no sixth.** Sky, glass (two kinds), gloss, paper, print. Section 3 says what each is for.
3. **Your files are the brightest thing.** Chrome is dim and thin. Pictures, pages and covers carry the colour.
4. **A planet lends its colour to its own things only.** If it sits on box glass on that planet's page, it may take the planet's colour. If it sits on bar glass, it is Mutt's and stays Mutt blue on every page.
5. **Two typefaces, two jobs.** Red Hat Text for words, Red Hat Mono for small facts and small labels. A serif only on paper, and for a desk's own names (see "Documents").
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

| `--mark-yellow` `--mark-green` `--mark-blue` `--mark-pink` `--mark-purple` | `#f2c43a` `#5cc86e` `#50a0ff` `#ff69a0` `#aa6ef0` | The five highlighters, shared by the reader and documents. Yellow is also a comment's colour (its count on a page, the edge of the comment in hand); words on it are `--mark-ink` `#2a2108`. A highlight on words is the marker at 36 to 40%. |
| `--room-veil` | `rgba(5,8,24,.62)` | What a room lays over the sky (section 4, "Room"). |
| `--page` `--page-ink` `--page-ink-3` `--page-line` `--page-raised` `--page-bar` `--page-accent` `--page-gutter` | Night: `#0f1530` `#dfe3ee` `#7f89a6` `rgba(220,228,255,.1)` `#182046` `rgba(16,22,52,.86)` `#86a9ff` `rgba(0,0,10,.32)` | The reader's page: its fill, words, faint words, lines, the fill of a panel floating over it, the bar's fill, its links and outline, the fold between two pages. One of four; Quiet, Sepia and Paper redefine the eight in `tokens.css` (`.rd[data-theme]`). The four fills and their words are also `--page-night`, `--page-quiet`, `--page-sepia` (each with `-ink`) and `--paper`. |
| `--ribbon-red` | `#e0574a` | A bookmark's ribbon and an underlined highlight in the reader. |
| `--light` `--light-ink` `--light-ink-3` `--light-line` `--light-line-on` `--light-tint` | `rgba(255,255,255,.94)` `#15171f` and four see-through steps of it | The add box that opens inside the void: ink on the void's white light. Nothing else uses them. |

Signals mean something or they aren't used. No other colour may be typed anywhere; a picture's own colours are the exception (and a document's, listed under "left for later").

### Type

Families: `--sans` Red Hat Text (400, 500, 700 only), `--mono` Red Hat Mono (400, 500), `--serif` `"Newsreader", "Iowan Old Style", Georgia, serif` (paper only, documents and the book reader alike), `--typewriter` `"Courier Prime", "Courier New", Courier, monospace` (a script, and a document its writer set in Typewriter). The two paper faces are fetched by `paperFaces()` in `util.js` the first time paper is about to show (a desk, a document, a book); call it from anything new that shows paper.

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
| Reach | `--text-reach` | 22 to 40 with the window / 1.3 | 500 | Words read from across a room: the step while cooking. Nothing else. |

Set a line of text with the whole role: `font: var(--type-label)`. It carries weight, size, line height and family; letter-spacing and capitals are added beside it where the table gives them. When only the size is wanted (inside a `calc`, or beside the owner's text-size setting), each role's size is also `--text-display`, `--text-page`, `--text-title`, `--text-lead`, `--text-body`, `--text-label`, `--text-caption`, `--text-fact`, `--text-small`. The old stylesheets use the sizes; new work uses the roles.

The user kept the spaced capitals for small labels on purpose; don't turn them into plain words. They are for labels only: never a sentence, a button or a heading. The owner's text-size setting (S 0.93, M 1, L 1.1) multiplies the sizes of their own words; keep it.

### Space, heights, corners

- **Space** (`--space-2` … `--space-48`): 2, 4, 8, 12, 16, 24, 32, 48. 4 inside a control, 8 between related things, 16 inside a box, 24 between boxes, 48 between parts of a page.
- **Reach** (`--h-reach` 52): a button pressed at arm's length, with messy hands: Back and Next while cooking. Only a room made to be used from a distance may use it.
- **Control heights** (`--h-small` 24, `--h-regular` 32, `--h-large` 40): small on tiles and in rows; regular everywhere; large for the one main action. On touch screens regular controls become 40 high; a small control keeps its 24 look and gets an unseen 40-high area to tap (decided in session 3: a 40-high button on a file box is a third of the box). The top bar is 36 (`--bar`; 44 on a phone). Inside a well that holds choices (segmented bar, stepper) the padding is `--inset` 3 and a choice or round button is `--h-inner` 26. The ring round a text box being typed in, and round a place files can be dropped, is `--ring` 3 wide.
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
| `--z-sheet` | 60 | Sheets (account, search), the phone note, a box while it is being dragged. |
| `--z-room` | 70 | A room: a place that covers the page and its bar (the file view, the editor, cooking, the reader). Above sheets, so nothing of the page shows over it; dialogs, menus and toasts open above it. |
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
- **Painters rest while the screen is changing.** The void and the planets keep their picture for the length of a page change (`html[data-vt]`): the dive, the pull away, a room arriving. A new painter does the same.
- **Nothing runs out of sight.** A painter rests when its thing is off screen, when the tab is hidden and under Still. The universe's beads rest until you scroll out to them.
- **A mode's code and styles are fetched only when a planet uses them** (`CLAUDE.md`, "How to add a mode").
- **Starting the sound engine costs about 60.** It happens while sign-in's light has the whole screen, the one place it cannot be seen. Leave it there.
- Sign-in at rest is the heaviest screen because the void fills it at the fineness the user chose; it is no heavier than before that choice. Don't lighten it by drawing it less finely.

- **An entrance switched off only while a page change runs comes back when it ends.** A rule such as `html[data-vt] .thing { animation: none }` hands the animation back the moment `data-vt` is removed, and the thing plays its entrance then: the file view blinked out and in after every opening. Mark the thing itself instead (`.is-carried`).

**How to measure** (the tools are in `/Users/edan/Mutt-notes/design/session8/`; the hidden test browser can draw with this Mac's real graphics chip, nothing on screen, at a true sixty pictures a second: `GL_REAL` in `kit.py`):

- `measure.py <repo> <out.json> [many]`: each screen at rest and each big move: pictures a second, late pictures (a gap over 25 thousandths), long tasks, processor share. `compare.py a b` sets two runs side by side.
- `census.py <repo> <out.json> fluid|smooth|off|calm`: walks about thirty-five things and writes down what the browser was really animating (lengths, curves) and whether a picture was late; `off` and `calm` use the account's real Motion setting. Use `smooth` for late pictures: the others sample while things move, and the sampling itself makes pictures late.
- `deeper.py`: where script time goes. `audit.py <repo> <dir> keyboard|phone`: walks every screen with Tab, and at 375 and 320 wide.
- A late picture at the very start of a page change is the new page being built (50 to 80), once; the browser shows a still picture meanwhile. That one is expected.
- **Safari**: `safari_measure.py <repo> <out.json>` (every screen at rest and moving), `safari_probe.py <repo>` (what repaints, how often, what each costs, and any error), `safari_bench.py` (small trials of one way of drawing). Safari cannot run hidden: a window opens, is brought to the front, and must be left alone; ask the user first. A change to a painter is measured in both browsers: what is free in Chrome can be ruinous in Safari.
- `edge_check.py <repo>`: whether the void's strands slide or jump (the amount of strand in front of the light, picture by picture). `film_photo.py <repo> <out.jpg> <picture>`: a photo opening from its box, as a strip of pictures with how bright the photo is in each (it must not dip).
- `scroll_probe.py`: the scroll out to the universe, driven as a trackpad drives it (steady, a flick, letting go halfway): stand-stills mid-trip and the sharpest change of speed between two pictures. `film.py <repo> <out.jpg> void-open|void-close|void-send`: a strip of pictures of one move on one sheet, to see a jump or a part arriving out of turn.
- What these cannot tell: whether a move feels right. Give the user a short list to watch.

**Everything that moves.** A new thing that moves is added here, beside the thing it is most like, and does as that one does. Lengths are the names without `--dur-`; "leaves" always means `change` on `--ease-leave`.

| Thing | How it moves |
| --- | --- |
| *Shared parts* | |
| A button, a stepper | pressed and pointed at: quick and change, on the spring |
| A text box taking the keyboard, an icon lighting, a swatch, a tick | change |
| A switch | its track change; its knob move on the spring |
| The segmented bar's bead, the tabs' sliding light | move, on the glide |
| A menu (•••, right-click, the editor's, the reader's) | grows from where it was asked for, move on the spring; rows half a step apart, move; highlight glides, change; a chosen row blinks, quick; leaves |
| A small panel (Share, a list's settings, Aa) | grows like a menu; leaves |
| A sheet (account, search) | arrive (its fade move); leaves |
| A dialog | arrive (its veil move); leaves |
| A toast; the upload toast's void filling | arrive; leaves; the fill move, steady |
| The tooltip | waits 500, fades quick |
| The drop hint | change, move and arrive |
| A tip (the sharing tip, the phone note) | arrive; leaves |
| An offer | move (the user found arrive a little slow); it is looked for `--dur-move` after the page is up; leaves |
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
| A box picked up, carried, dropped | lifts change; lands move or change |
| *The screen changing* | |
| One page to another | the old fades in move on the leaving curve; the new fades in over arrive. No blur. |
| Opening a planet: the dive | galaxy leaves over arrive; the planet travels and swells over scene on the glide; its page fades in over arrive after move |
| Coming back: the pull away | page fades change; the galaxy closes in over scene; the planet glides scene |
| A mode switching on or off | leaves; arrives over arrive |
| A room arriving and going; a file gliding from its box | move each way, evenly. A picture, page or cover keeps its old self whole underneath while the opened one fades in over it (`view-transition-class: pic`), so it never dims part-way; the file travels above the room's dark veil (`z-index` on its group), and the room, carried in by the page change, has no fade of its own (`.viewer.is-carried`) |
| Signing out | the dark comes over arrive, lifts over scene |
| *Rooms* | |
| File view: side panel, connections, comments | arrive |
| Editor and recipe card: the page flying open and back | scene each way, on the glide |
| Editor: bars dropping in; the sky rising behind | arrive; scene |
| Editor: bars stepping back while you write | out over grand, back in move |
| Editor: panels, the bubble, the "/" menu | move (the bubble and "/" on the spring) |
| Reader: opening, closing | move; leaves |
| Reader: a page turning, its bars, panels, ribbon | move |
| Cooking: the next step | move |
| *Modes* | |
| List: an item ticked and sinking to Done | scene on the glide, however far |
| List: items arriving, one added, one removed | arrive, one step apart; move; leaves |
| Cookbook, desk, shelf: cards, pages, covers arriving | arrive, one step apart |
| A desk's page or a shelf's cover lifting | arrive (the cover on the spring) |
| *The galaxy and its planets* | |
| The galaxy arriving | planets rise over arrive, one step apart; the hint over scene |
| A planet pointed at | rises 3 and swells to 1.09 over arrive on the spring; spins up, then coasts |
| Planets turning, weather, effects | painted (rule 10) |
| Planets moved to new places; stars with them | scene; the ghost and guide change |
| A planet dropped on an orbit | arrive on the spring |
| A file dropped on a planet | the bubble arrive on the spring; the gulp scene |
| Moons | bob on the rest beat; born over scene; plumes on the slow beat |
| Stars (loose files) arriving, leaving | arrive; leaves |
| *The void* | |
| Turning | painted (rule 10): about 30 pictures a second, every picture when it is big (sign-in); rests while the screen is changing; fades in over move once its pictures are worked out |
| Opening, closing | scene open, arrive closed; its box arrives over arrive after move, and leaves |
| Swallowing | the file spirals in over scene (several: one step apart); the void gulps |
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
| Beads, dust, stars | painted (rule 10) |
| Changing sky | scene |
| *The top bar* | |
| The search box widening; the account's caret; the sky picker | arrive; move; move on the spring |
| The corner back arrow; the logo's letters landing | change; arrive |

**Not finished, and known:** in Safari sign-in drops to about 52 pictures a second while you type (its dust alone makes thousands of strokes a second), and the planets' copies cost the page about a tenth of every second; a new star being born lays the whole galaxy out again, which drops one picture (about 33) as it appears; after the right code, sign-in's white light held for most of a second in 2 of 14 measured runs and could not be made to do it again; the cause is not found. On a phone the editor's word count sits over the page's words. Safari and a real phone are unmeasured.

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
- Type on paper is `--serif`: titles 600, text 400, at the reader's or document's own size. The serif is used nowhere else, with one exception the user chose in session 5: on a desk, the planet's name and note and the names under the pages are serif too (section 4, "Documents").

### Print: the void

The best-realised piece in Mutt, and the bar for everything else. Don't restyle it. What it is: a stippled black-and-white print: a bright white light caged by dark, sinewy strands that web together where they cross, turning in 3D; stippled cells, bright at their rims and dim in the middle; faint rays; only a faint mauve tint. Bright places are dotted more densely, like a print. Sized in proportion to the planets, sitting straight on the sky with no dark halo. No crosshair lines, no orange, no pixel sparks, no realistic or painted light. Add boxes that open from it are flat and plain like Are.na's: spacious, no glass, gloss or glow, not paper.

How it is drawn (`js/voidart.js`; session 7 drew it finer at the user's word, the idea untouched). These are rules for anyone who touches it:

- **Sharp.** Painted at the screen's own sharpness, up to 2 pixels a point (`SHARP`). Never stretch a smaller picture to fit.
- **Dots laid evenly, never scattered at random.** The stipple is one small tile of dots spaced evenly (`evenPoints`, 1.12 points apart) and punched through each layer of light; random scatter clumps and leaves bald patches. A dot is 0.26 to 0.64 points in radius, the same on every sharp screen; on a plain screen (under 1.5 pixels a point) dots and spacing grow by half so no dot is smaller than a pixel. All four numbers are `DOT`.
- **Brighter places get more dots, not bigger ones**: each layer (cells, rims and rays, the light's glow, its core) is punched with the same tile, shifted, so where layers overlap the dots add up.
- **Strands are smooth curves** (`ribbon`), never straight pieces: at sign-in the void fills the screen and corners show.
- **A hairline of light on the near strands** (`edges`): 0.6 wide, on the side toward the light, brightest beside it and gone by the edge of the cage. It is the only light on the strands; no gradients, no glow.
- **Cost.** It is redrawn about thirty times a second at rest and every frame only while opening, closing, hungry or swallowing; it rests when off screen, when the tab is hidden and under Motion: Still. Keep that. Its cells and its tile of dots are slow sums, so they are worked out off the page's own thread (`js/voidmake.js` has the sums and may not touch the page; `js/void-worker.js` runs them; `voidart.js` falls back to doing them itself), once, and kept for every void on every page. Until they are in, a void draws nothing; then it fades in over `--dur-move`. Opening takes `--dur-scene`, closing `--dur-arrive`.
- **It is a stack of canvases, and nothing is ever copied from one canvas onto another.** `el` is a box holding seven canvases, bottom to top: `body`, `cells`, `rims`, `halo`, `core`, `behind` (the strands behind the light, then the light), `front` (the strands in front, their hairlines, the open light). Each layer of light is painted on its own canvas and the dots are punched through it there; the browser lays the seven over each other. It was once one picture with hidden canvases copied onto it six times a redraw, and Safari pays for the whole of a canvas each time it is copied from: that held the void to 13 to 27 pictures a second there and made its strands jump. A layer is only as big as what is on it (the ball's square; for `halo` and `core`, which reach past the ball when the void is open, the wider `box`), and the dots keep their places on the picture wherever a layer's corner is. `copyTo(target, r)` makes a still picture when one is truly needed (the universe's). A new layer of light is a new canvas in the stack, never a copy.
- **A strand changes sides exactly at the ball's edge.** Each strand is drawn from 120 points, black where it is in front of the light and grey where it is behind. Where it passes from front to back, between two of its points, the run is cut at a point worked out where the strand's depth is nothing (`runs` in `voidart.js`), never at the nearest of its points: cut at the points, the black and grey changed over a whole piece at a time and jumped along the edges as the cage turned (the user saw it; measured at sign-in as 30 sudden steps in five seconds, now 1). Anything else that splits a turning shape into near and far does the same.
- **A big void is redrawn every picture.** On a galaxy it turns by a fraction of a pixel a picture and thirty a second is smooth; at sign-in it fills the screen, its strands travel further between pictures, and thirty looked jagged (the user, session 8). `BIG` in `voidart.js` is the size above which it is drawn every picture.
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
- **The universe.** Black (`--night-*`), with grain and **no stars**. Mutt's stippled web joins the galaxies (`js/uvweb.js`, painted once for a layout), each galaxy in its own halo of dots, and **beads of light** travel the threads that reach a galaxy: at most 14, one to a thread, 22 pixels a second, fading at both ends (`beads()` in `uvweb.js`, `.uv-bead`).
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

**Twelve kinds**, each with ground, weather and one effect that is its own. Their order is the painter's (looks 0 to 11); names are plain and say what you see.

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

- **A planet's kind** is its owner's pick (`drawers.look`), or one from its id. Planets made before there were twelve draw from the first eight, so none changed by itself (`twelve` from the server, `lookOf`). Moon rock is gone; those planets are Pearl mist. Moons are their own ten real moons and did not change.
- **Colour.** A kind is four colours (`PALETTES`), each leaning a set amount toward the planet's own colour, then pushed (`rich`). This is the one place raw colours are typed outside `tokens.css`.
- **Light.** One sun, upper left. A crisp edge between day and night, a warm last light along it, and a thin glow of air on the lit side only, painted in a picture 1.12 times the ball (`AIR`) so nothing clips it. No highlight laid over the ball, no halo behind it, no drop shadow: those belong to the plain painter only (below).
- **Sharp.** Painted at the screen's own sharpness, up to 2 pixels a point.
- **It turns** once in about a minute (40 to 75 seconds). Pointed at, it rises 3 and swells to 1.09 on `--ease-spring` and spins up a little (`nudge`), then coasts down. Each world's weather keeps its own clock, faster on a busy world.
- **Rings** are on any kind of planet that holds ten files or more, and on no other. They lie round its middle, lean as it leans, and the painter casts their shadow on the world.
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

**Moving planets.** A planet is carried by its name to a free place on an orbit (the ghost and the guide show where). Carried over another planet, the two change places when you let go: the other one lights as a planet does when something is about to land on it, and the ghost sits on its place (`planetOver`, `place(…, also)` in `views/galaxy.js`).

**Opening a planet** from a galaxy is a dive: the galaxy rushes past from where the planet is, the planet swells toward you and settles at the top of its page. Coming back is a pull away. Between two planets, pages just change. (`router.js`, the rules headed "Opening a planet" in `galaxy.css`; its lengths and curves are the named ones: the galaxy leaves over `--dur-arrive` on `--ease-leave`, the planet travels and swells over `--dur-scene` on `--ease-glide`, its page fades in over `--dur-arrive` after `--dur-move`; coming back the page fades over `--dur-change` and the galaxy closes in over `--dur-scene`. The user watched a sketch of it in session 8 and kept it as built.)

**Without the painter** (no WebGL2, or `?flat=1`): the plain painter wraps a flat picture round a ball, with the same cards. It has no kinds beyond colour, no weather and no use. Keep it working; don't grow it.

**To add a kind of planet** (show the user a sheet first: the kind large, at galaxy size and at the smallest, beside its neighbours):
1. Add `{ id, label }` at the END of `LOOKS` in `planets.js` (the order is the painter's) and its four colours to `PALETTES`.
2. Add its branch to the painter's chain in `planetgl.js`, before the moons, with the next number, and move the moons' numbers up by one (they follow the planets; `LOOK_INDEX` in `planets.js` counts them the same way). A branch sets `col` and may set `cloud`, `cloudC`, `spec`, `atmo`, `atmoC`, `glow` (light of its own), `nightGlow` (light only in the dark), `limb`. Use `busy` and `calm` for what should follow use. Give it one effect no other kind has.
3. Add the id to `PLANET_LOOKS` in `mutt/api.py`.
4. Raise the two colour lines in `tests/expected/drift.txt` by hand (a palette is the one allowed place), after telling the user.
5. Add its row to the table above.

**To give a new kind of file, or a new mode, its drawing on a world**: add a drawing to `FACES` in `planets.js` (map pixels; bars, not words; colours from `INK`), a line to `faceOf` saying which files get it (a mode decides through `planet.modes`), and, if the cards should be taller than wide, its name to `UPRIGHT`. If the mode changes what the galaxy must know, add that mode's flag to the texture's key in `textureFor`. Add its row to the table above.

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

Underlined words are not buttons: "Upload", "Retry", "Take off", "Delete", "Delete account" are small quiet buttons. A word that deletes is grey like any quiet button; red waits for the "are you sure" dialog and a menu's last row (decided in session 3).

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
- **Swatch**: a colour to pick. A dot of the colour, 20 across (24, `.swatch-large`, in a panel of nothing but colours), with a 1px inner edge of `--edge`. Pointed at, 10% larger; pressed, 6% smaller. The chosen one wears a ring: 2 of the surface behind it (`--swatch-gap`, `--bg` unless the part sets it), then 1.5 of `--ink`. "No colour" is the paper dot with a red stroke across it (`.is-none`). On touch screens it keeps its size and gets a larger area to tap. One swatch for the highlighters, a document's inks and search's colours; the planet colour picker's small worlds are their own drawing.
- **Tabs**: for switching what a panel shows (a segmented bar picks a setting). A row of words 32 high, 16 apart, 13px 500, `--ink-3` (`--ink` pointed at and chosen), over a 1px `--line`. A 2px line of `--blue-ink` with a soft glow of itself sits on that hairline under the chosen word and slides to the next over `--dur-move` on `--ease-glide`. Any number of tabs; the row scrolls sideways when it must.

### Menu

One menu for the ••• button, right-click, the editor and the reader, and it opens one way (below). Bar glass, corners 12, padding 4, at least 220 wide, `--shadow-float`. Rows 32 high, corners 8, 8 side padding, 8 gap, 13px `--ink`; icon 16 in `--ink-3`; a fact on the right in mono 11 `--ink-3`.

- **A menu of things to do gives every row an icon** (a file's menu, a planet's •••, a list item's, a recipe card's, a book's, the editor's Insert and More): `{ icon: 'trash', label: 'Delete', … }`. A planet you can move a file to shows its colour dot in the icon's place.
- **A menu that picks one of a list gives none** (Sort, the text style, a chapter, a format to download as). Pass `on: true` or `on: false` on each row and the chosen one ends in the `check` icon.
- A menu never mixes rows with and without icons. If one row would need an icon that doesn't exist, draw it (see "Icons") or give the menu none.
 Pointed at: `--tint-2`. A dangerous row is `--danger` (words and icon), washed 15% `--danger` when pointed at, and is last, below a divider (1px `--line`, margin 4/8). A group's heading is a small label with 8/8/4 padding. A row's keyboard outline is drawn 2 inside the row so the menu's edge doesn't cut it. On touch screens rows are 40 high with 14px words.

- **How every menu opens** (the user's pick in session 8, "lively, everywhere"): it grows from where it was asked for (0.84 to full size about `--origin`: the corner at the button, or the pointer) over `--dur-move` on `--ease-spring`; its rows follow one after another, half a step apart (`--stagger` / 2, because a menu is small), each over `--dur-move` on `--ease-settle`; one highlight glides between rows over `--dur-change` instead of each row lighting; a chosen row blinks once (`--dur-quick`) before the menu leaves. Pressed again while its own menu or panel is open, a button closes it; it never opens a second one (`openPopover` does this for every caller). It leaves as everything leaves: `--dur-change` on `--ease-leave`. `openMenu`, `openContextMenu` and any `.menu` handed to `openPopover` get all of this from `glideLight` in `ui.js`; a feature never animates a menu itself. Never a blur on the menu's glass.

- **A planet's right-click menu** on its owner's galaxy: `Open`, then `Planet type…`, `Planet colour…`, `Add a moon…` and, last and red, `Delete planet…`; on someone else's galaxy, `Open` alone. The four are done on the planet's own page, so they open it and carry on there (`askThen` in `views/planet.js`): a thing only a page can do is never built a second time for a menu.

**Small panel**: a menu that holds controls instead of rows (Share, a list's settings, the editor's Aa). The same glass and shadow, corners 20, padding 16, 12 between its parts. It opens and closes like a menu (it grows from its button; its controls do not arrive one by one).

### Sheet, dialog, toast

- **Sheet** (account, search): arrives over `--dur-arrive` on `--ease-settle` (its fade `--dur-move`), leaves over `--dur-change` on `--ease-leave`. Closed, it is `inert`. Bar glass, corners 20, padding 20, 16 between groups, `--shadow-overlay`, `min(440px, 100vw - 20px)` wide. Name in Title; under it a Fact line. A settings row is a 96-wide label (13px `--ink-2`) and its control, at least 32 high. A foot row of buttons sits above a 1px `--line` with 16 above them.
- **Dialog**: arrives over `--dur-arrive` (its veil `--dur-move`), leaves over `--dur-change`. Bar glass, corners 20, padding 20, 340 wide (560 when it must be), `--shadow-overlay`, over `--scrim`, which also blurs the page behind by 10px. Title in Lead 700, words in Body `--ink-2`, buttons right-aligned 8 apart with 12 above. The quiet or plain button comes first, the main or danger one last.
- **Toast**: arrives over `--dur-arrive`, leaves over `--dur-change`. Bar glass, corners 20 (full at one line), at least 40 high, padding 8 16 8 14, 12 gap, 13px/16. A long message wraps to a second line and the toast grows; it is never cut short. A black 8px dot with a pale ring leads it (the void, small). Its one action is `--blue-ink` 500, not underlined: `Sent to Recipes · Move`.
- **Uploads** are a toast, not a tray: `Uploading 3 of 7`, then `Added 7 files`, or `2 uploads failed · Retry` with a red ring. Its void is 16 and fills with white light from the middle as the files go in (black at none, bright with a soft glow at all); when the last file lands the same toast says what was added. Under Motion: Still the light steps without easing.
- **Tip** (the sharing tip, the phone note): Mutt speaking once. The phone note sits at the foot of the screen, where toasts sit, so it covers nothing (the user's pick in session 8); a toast that arrives meanwhile stands above it. Bar glass, corners 20, padding 16, 300 wide at most, `--shadow-float`: a line in Label `--ink`, one or two sentences in 13/18 `--ink-2`, then small buttons (main first when there is something to do, quiet "Got it").
- **Tooltip**: what an icon button or a cut-off name is called. Bar glass, corners 8, 24 high, padding 0 8, Caption in `--ink`; a key beside it as a Fact in `--ink-3`, 8 apart. It appears 8 below the thing (above when there is no room), centred and kept inside the window, half a second after pointing (at once when moving from one to the next) and on keyboard focus; it fades over `--dur-quick`. Never on touch screens. The browser's own labels are not used: anything with a `title` gets this instead.
- **Drop hint**: while files are dragged over the window nothing frames the page. The thing that will take them lights up: on a planet the add box (edge `--blue-ink`, a ring of `--accent` at 32% and a soft glow), on the galaxy a ring opens round the void, just outside its cage (1.5px `--blue-ink` with the same ring and glow; the void itself is not redrawn). One label sits where toasts sit, shaped like a main button: `Drop to add to Postcards`, `Drop into the void`, and over a planet on the galaxy `Drop onto Postcards`. Where nothing can take files the label is clear glass and says why. A page says what takes files through its view's `dropTarget()`: `label`, `el` (the thing to light), `lit(on)` and what `over(e)` returns (main.js).

### File box

One frame for every kind of file, wherever files are shown (a planet's page, search). Built by `renderCell` in `cells.js`; styled only in the section of `galaxy.css` headed THE FILE BOX. Drawn in every kind at `/parts`.

- **The frame**: a box four wide to five tall (`.cell-box`), corners 12, and 12 under it one line, the caption. Four boxes to a row, 24 apart each way; on a phone two to a row, 12 apart across and 16 down.
- **The rule**: the box shows what is in the file and the caption says what it is called. Nothing is said twice: a name is never repeated inside its box, and a fact is never in both places.
- **The caption** (`.cell-cap`): the name on the left in Caption `--ink-2` (`--ink` when the box is pointed at), cut with "…", and one fact on the right in Fact `--ink-3`; both carry `--sky-shadow`. The name is the file's own name; a link's title is in its box, so a link's caption is its site. The fact is the date for a note or a link, pages for a page or a book that knows them, and otherwise the size. Someone else's file adds `@name` after the name; a file with comments shows their count before the fact.
- **A face is one of three things.** To add a kind of file, decide which and build it from that:
  1. *It has a shape of its own* (a picture, a video, a page, a cover): it keeps that shape, in the middle of the box, never cropped (`shaped()` in `cells.js`). Corners 12, a 1px edge of `--box-edge`, `--shadow-rest`. Pointed at: 1.5% larger, edge `--pic-edge-on`, `--shadow-raised`.
     - *A page* (a PDF or a document with a first page): paper. Corners 4, `--paper-shadow`, at most 94% of the box so it reads as a sheet lying in it.
     - *A book* (an EPUB with a cover): its cover, the same way, with the left corners 2 and the `--spine` band.
  2. *It is words* (a note, a link): box glass (`.fglass`'s recipe) filling the box, padding 16 (12 on a phone).
     - *A note*: its words from the top in Body `--ink` (13/20 on a phone), fading out over the last 40px through a mask (never a painted fade: it shows as a dark band on glass).
     - *A link*: set to the foot: the title in Lead (16/22, four lines) and what the page says in Caption `--ink-2` (three lines). If the link has a picture it runs across the top of the box, edge to edge, above a 1px `--line`, and the title keeps two lines and the description one.
  3. *It is neither* (a song, a zip, code, anything else): box glass, set to the foot: one bold word in Title (what kind of file it is: `ZIP`; for a song, how long it is: `3:42`) and under it, only if the bold word wasn't the kind, the kind as a Fact. Above the word, its sign if it has one:
     - *A song*: 40 level bars, 1px wide in `--ink-4`, their heights made from the file's id so they never change; they take the planet's tint when the box is pointed at.
     - *Code or text with words to show*: its first lines in mono 10.5/1.6 `--ink-2`, fading out; code is numbered in `--ink-4`. Then only the kind as a Fact (no bold word).
     - *Any other file*: nothing above the word. Don't invent a picture for a kind; a new sign is drawn on `/parts` and shown to the user first.
- **The tag** (`.cell-tag`): a fact that sits on a picture, 8 in from its top-left corner: 20 high, corners 4, padding 0 8, Fact in `--ink`, on `--bar-fill` under `--tag-frost`. A video's (or a song with a cover's) length always shows, after a small play triangle. What a page or a cover is (`PDF · 12 pp`, `Book`) shows only when the box is pointed at.
- **The buttons on a box** (`.cell-actions`): two small plain buttons (`.btn.btn-small.pill`), 12 above the foot of the box, on the same dark see-through glass as the tag. They appear when the box is pointed at or focused, and never on touch screens (right-click and a long press open the same menu).
- **At rest** a box floats: 2.5px up and down, 8 to 12 seconds, each on its own beat. Nothing else: no glow, no lean.
- **Pointed at or typed in**: the edge, glow and fill of box glass, plus a lean toward the pointer (up to 3° and 2.4°). Only that one box leans; it settles back when the pointer leaves (`drift.js`, which writes the lean on that box alone).
- **Arriving**: the box slides up 16px over `--dur-arrive` while its parts fade in and come into focus, one `--stagger` apart (at most 14 steps).
- **Being added**: the box at 55% with a 2px line under it filling left to right; red when it fails, with the reason and "Retry" as the caption.
- **The add box** (`.entry`, `entry.js`) is the first box on a planet you can add to. It is a sunken slot, not a file: a well with corners 12 and a 1px `--line-2` edge (`--line-3` pointed at), the placeholder "Type, paste or drop" in `--ink-3`, "Upload" as a small quiet button at the foot, and a small main button "Add" in the planet's colour once there are words. While you type in it, or drag files over it, its edge is the planet's paled colour and it has the 3px ring of a text box being typed in.

### Planet header, section heading, small text

- **Planet header** (`.liv-head`): no box. It sits straight on the sky, and the files below are the only glass on the page. The world (124 across; 84 on a phone), with its moons beside it, then the name in Page, the note in Body `--ink-2`, and a Fact line; every word carries `--sky-shadow`. The name and the note are bare text boxes (`.field-bare`); on someone else's planet they are read-only and are plain words. Its buttons (Share, •••) are plain, level with the middle of the world, at the far end; on a phone they sit under the Fact line. 24 between the world, the words and the buttons; 32 under the header.
- **One column**: the header and everything under it share the same left and right edges, 48 in from the page's own gutter above 720 wide, so the back arrow sits in the margin beside them. Nothing on a planet's page is inset on its own.
- **Section heading** (`.sec-head`, built by `sectionHead()` in `ui.js`): one for every mode. The name in Label `--ink-2` and one Fact beside it (`Books 2`, `Documents 4 · 518 words`), 8 apart, straight on the sky with `--sky-shadow`, in a row 32 high with 12 under it; the group's own buttons (Sort, New document) at the far end. **Only where a page has more than one group, or the group has its own buttons**: a plain planet has no heading, because its header already says how many files it holds.
- **Small text**: one Caption and one Fact. Anything you could count or date is a Fact (mono); everything else small is a Caption.

### Offer

An offer (a mode's "This planet looks like …") is box glass with corners 20 and padding 16: its small drawing (below), then a line in Lead 700, the signs it noticed as Body `--ink-2` behind small `--ink-4` dots, one line of Caption `--ink-3` saying nothing is lost, and at the far end a quiet "Not now" then a main button in the planet's colour whose words match the menu's. It is the one box in `offers.js` (`modeOffer`); a mode only supplies words and the name of its drawing. On a phone the buttons sit under the words.

**An offer's drawing** is one of four in `icons.js` (`drawing(name)`: `list`, `shelf`, `cards`, `desk`), and they are all made the same way: a pane of glass in front (an outline in the icons' line, faintly filled) with the planet's paled colour along its top edge, another pane behind it, and a few marks that say which mode it is. A list is two strips with ticks, a bookshelf two covers, a cookbook a card behind its tab, a desk two pages. Drawn on a 24 grid, shown at 28 in a 40 well with corners 11. A new mode's drawing is made this way and no other: add it to `DRAWINGS` in `icons.js`, name it in the mode's page entry (`drawing: '…'` in `modes.js`), and show the user first.

### Room

A room is a place that covers the page and its bar: the file view, the document editor, cooking, the reader. Build a new full-screen place this way and no other.

- Its own element has the class `.room` (fixed, edge to edge, on `--z-room`). Call `enterRoom()` (`ui.js`) when it is put on the page and `leaveRoom()` when it is taken off.
- **The page steps away and the sky stays.** While a room is open the page, the top bar and the back arrow fade out (`html.in-room`); what shows behind the room is the real sky, dimmed by `--room-veil`. A room never paints a background of its own, and never blurs the page behind it.
- **It arrives as one even fade**: put it on the page inside `transition(fn, { type: 'room' })` (`transitions.js`), which fades from a picture of the page to a picture of the room, so the page's glass keeps its frost while it goes. Leave the same way. The file view does this with its own type, `viewer`, so the file can glide from its box.
- Words set straight on a room's veil carry `--sky-shadow`, like words on the sky.
- What Mutt gives you to work with in a room is bar glass (`.bar-glass`) holding shared parts, and stays Mutt blue; the owner's things in it are box glass or paper and may take the planet's colour.
- Dialogs, menus and toasts open above a room. A sheet can't: `/` does not open search while a room is up.
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
- A card opened sits in the page above the cards: box glass, corners 20, padding 16/24/24. Its name in Page; the stepper and segmented bar for servings and measures; "Ingredients", "Method" and "Notes" as small labels; amounts in 700 `--ink`; step numbers as Facts in 24 wells; its photo 252 wide with corners 12.
- Editing a card keeps its layout, with shared text boxes that keep the card's own type; "Add an ingredient" (led by the `plus` icon) and the row's `close` are small quiet buttons.
- A photo looked at closely opens over the dialog's scrim, on the dialog's layer.
- **Cooking is a room, sized for arm's length**: the recipe's name in Title; ingredients down the side in Lead with the tick box at 24; the step in `--text-reach` under a small label (`STEP 2 OF 5`); Back (plain) and Next (main, the planet's colour) at `--h-reach`; a dot for every step, the ones passed in the planet's paled colour. On a phone the ingredients open over the step from a button.

**Documents** (`docs.js`, `doceditor.js`; `docs.css`).
- The desk is the shared heading (`Documents`, how many, how many words; Sort as a quiet button, "New document" plain) over a grid of pages, 24 apart across and 32 down, at least 220 wide.
- **A page on the desk is paper**: flat cream, corners 4, `--paper-shadow`, the proportions of a real sheet, its first words set small on it and fading out at the foot. No rim and no glow at rest. Pointed at, it lifts 7, tilts half a degree and takes `--paper-shadow-on`; it leans toward the pointer like a file box.
- **A desk keeps its own voice** (chosen by the user): the planet's name (600) and note (italic), and the name under each page (Lead size, 600), are `--serif`. Under the name, one Fact line (`Letter · 142 words · just now`). Nowhere else is a serif used off paper.
- "Continue writing" is one strip of box glass with a small page, a small label, the name and a main button.
- **The editor is a room.** Its pages are paper with `--paper-shadow`. The document's name in the top row is a bare text box in the desk's serif (Title size, 600).
- Everything it gives you to write with is bar glass holding shared parts, and stays Mutt blue: the toolbar (one pill, shared quiet buttons 32 high; a button that opens a menu has a caret), the Aa panel (a small panel: each row a 72-wide label and its control; a group that picks one is a segmented bar; a group of things to do is quiet round buttons; colours are swatches), the bubble beside selected words (a pill of quiet round buttons), the "/" menu (shared menu rows under small labels), find, the outline, history.
- Comments in the margin are people's words: box glass, with a marker-yellow edge on the one in hand. Inside the panel they sit on bar glass, so they are washes.
- The word count is a fact on a tag (`--bar-fill` under `--tag-frost`), bottom left.

**Reading** (`reading.js`, `reader.js`; the sections headed READING).
- The shelf is the shared heading (`Books`, how many) over covers standing with their feet level, straight on the sky: each at its own shape (two to three), at least 132 wide, 24 apart across and 32 down. A cover is paper's shadow with the left corners 2 and the `--spine` band; a book without one gets a flat cloth cover with its name in the serif. Pointed at, it lifts 4.
- Under a cover: its name in Label `--ink`, then its author in Caption `--ink-3` with one Fact at the far end (`34%`, `New`, `PDF`; a finished book's in `--good`). How far through is also a 2px line under the cover in the planet's paled colour.
- "Continue reading" is one strip of box glass: the cover, a small label, the name in Title, a 4px track, a Fact, a main button.
- **The reader is a room whose page fills the screen**, in one of four page colours: Night, Quiet, Sepia and Paper (the one cream). Each is flat. Books are set in `--serif` (sans is the other choice) at the reader's own size.
- **Its bar, panels and menus are cut from the page's colour** (chosen by the user), in the shared parts' shapes. Inside `.rd` the usual names (`--ink`, `--ink-3`, `--line`, `--tint`, `--well`, `--edge`, `--blue-ink`) are read from the page's eight values, so a shared button, tab, stepper, text box or swatch is right on all four with nothing written twice. This is the one place Mutt's controls take a colour that isn't Mutt's; don't copy it elsewhere.
- A panel is the small panel's shape (corners 20) filled with `--page-raised`; its settings are a small label over each control; a row of choices is the segmented bar's shape with the chosen one a bead of the page itself; page colours are four tiles showing "Aa" on each fill; contents are rows 32 high.
- Words you pick get a pill of `--page-raised`: the five marker swatches and an underline, then small quiet buttons (Note, Copy).
- The foot's two lines are Facts (`10%`, `6 pages left in chapter`).

**File view** (`viewer.js`; the section headed THE FILE VIEW).
- A room. The file is as large as it can be on the left; a picture or a video keeps its shape with corners 12, a 1px `--box-edge` and `--shadow-raised`; a PDF's pages are white paper with `--paper-shadow`; a note is its words on the sky at the size of a list's items; a link is its address in a well, a picture of the page, then its title in Title; a file with nothing to show is a card of box glass.
- **Its name, note, facts, planets and comments are a column of words straight on the sky** to the right, 360 wide, with `--sky-shadow`: no pane and no line between it and the file. The name (Title) and note (Body `--ink-2`) are bare text boxes. Then its buttons (plain "Download", quiet "Original" ending in the `out` icon), a hairline, its facts as a two-column list of Facts, a hairline, a small label (`ON 1 PLANET`) with a small plain "Planets" ending in a caret, each planet as a 32-high row, the comments, and last the small quiet "Take off …" and "Delete".
- Top left, two chevrons (the file before, the next one) and `1 / 4` as a Fact; top right, a quiet "Close".
- On a narrow screen it is one page to scroll, the file then its words, with the top row staying put on Mutt's bar glass.

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
| Menu | `.pop` > `.menu` > `.menu-item` (`.is-danger`) > `.menu-icon`, words, `.menu-hint`, `.menu-tick`; `.menu-sep`, `.menu-head` | `openMenu()`, `openContextMenu()` |
| Small panel | `.pop.pop-panel` | `openPopover(…, { className: 'pop-panel …' })` |
| Sheet | `.sheet` > `.sheet-head` (`.sheet-who`, `.sheet-sub`), `.set-row` (`.set-label`), `.sheet-actions` | `sheet()` in `statusbar.js` |
| Dialog | `.scrim` > `.dialog` (`.dialog-wide`) > `.dialog-title`, `.dialog-text`, `.dialog-msg`, `.dialog-actions` | `openDialog()`, `confirmDialog()` |
| Toast | `.toasts` > `.toast`; uploads `.toast.is-upload` > `.toast-void` | `toast()`; `uploads.js` |
| Tip | `.tip` > `.tip-title`, `.tip-text`, `.tip-btns` | markup |
| Tooltip | `.tooltip` > `.tooltip-text`, `.tooltip-key` | `tooltip.js`, for anything with a `title` or `data-tip` |
| Drop hint | `.drop-word`, `.is-drop` on what takes the files, `.drop-ring` round the void | `main.js` |
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

**The names** (94)

- *Everyday:* `plus` `minus` `close` `check` `more` `grip` `caret` `chevron-left` `chevron-right` `chevron-up` `chevron-down` `back` `forward` `up` `down` `out` `search` `zoom` `undo` `redo` `upload` `download` `sort` `link` `copy` `trash` `edit` `open` `play`
- *Mutt's own things:* `planet` `moon` `star` (a file on no planet) `lock` (private, locked) `key` (opened with a code) `people` `globe` (public) `comment` `move` (to a planet) `onto` (put on a planet, save) `takeoff` (take off a planet) `files` (show as files) `page` `book` `bookmark` `note` `pot` `chapter` `camera` `picture` `colour` `tick` `untick`
- *In menus:* `history` `print` `setup` (options) `replace` `count` `spell`
- *Writing:* `side` `bold` `italic` `underline` `strike` `align-left` `align-center` `align-right` `justify` `bullets` `dashes` `numbers` `letters` `roman` `checklist` `outdent` `indent` `spacing` `clear` `type` `highlight` `heading` `quote` `table` `rule` `pagebreak` `code` `auto` `prose` `poem` `script` `journal` `letter` `scene` `sign` `date`

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
9. **Keep it calm at rest.** A new feature adds nothing that moves while idle. Only the sky, planets turning and the slow float of file boxes may. No endless animation without the user's yes.
10. **Make it work without a pointer.** Every control is reachable by keyboard and shows the outline (`:focus-visible`: 2px `--blue-ink`, 2 away; round things carry it as a ring: a planet, the void). Tab stays inside whatever is open on top (a dialog, a menu or panel, a room, a sheet): `topLayer` in `ui.js` does that for those four, and a new kind of layer is added there. Anything closed but still on the page (a sheet, the void's box) is `inert`. On touch screens controls are 40 high; one that must keep a small look gets a 40 tap area by joining the list under "Room for a fingertip" in `galaxy.css`. Nothing appears only on hover.
11. **Make it work under Motion: Still.** Every animation ends on its last frame, in no time. Never pause an animation to stop it (a paused entrance stays invisible).
12. **Keep it light.** It meets "What Mutt may cost" in section 2 (nothing new runs at rest; nothing makes the page wait). Its styles go in its own stylesheet, fetched together with its code, and waited for: `Promise.all([import('./name.js'), styles('name.css')])` (`styles` is in `util.js`; copy the `documents` entry in `modes.js`). Only what must show before its code arrives (an offer's drawing) goes in `galaxy.css`. A plain planet loads none of it.
13. **Look at it** in the hidden browser at 1280 and 375 wide (`tests/run.sh browser`, pictures in `tests/shots/latest`), before and after. Give the user a short list of what to watch at real speed.
14. **Write it down**: anything new or changed goes into this file in the same session.

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
- [ ] Keyboard outline visible everywhere; Tab stays inside what is open; nothing hover-only; 40 to tap on touch.
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

Decided by the user, 2026-11-13 (design session 7; the page with the alternatives is `/Users/edan/Mutt-notes/design/session7/worlds-and-sky-2026-11-13.html`):

- The sky, built the cheap way: yes, as it is.
- "Recenter the design of planets" means around the world itself: better worlds first, files modest on them.
- Files on a planet: cards in a belt, each drawn as what it is (three big faces, and one face at a time facing you, which was my pick, were turned down).
- All eight kinds are redrawn, Moon rock goes, and there are **twelve kinds**, each with its own effects and weather, keeping the charm of today's style. All twelve approved as drawn. Their names are plain and descriptive (names after real space things, Hycean, Janssen, Coriolis and the like, were offered and turned down). Moon rock planets become Pearl mist.
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
- The phone note sits at the foot (a slim line under the top bar, and the top with the page below it, were offered).
- The new names: `--dur-grand`, `--ease-leave`, `--stagger`, the three beats.

Still open: whether every move feels right at real speed (the user's eye: the watch list on session 8's page); the three things under "Not finished, and known" in section 2, "Motion".

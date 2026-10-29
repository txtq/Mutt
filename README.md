# Mutt

A personal place to keep things and connect them, like Are.na with only
what's needed, dressed up as a little galaxy in PS Vita blues.

- **Accounts**: a username and a 4-digit code.
- **Your galaxy** is the whole app. A thin bar along the top says whose
  galaxy it is; tap your name for your account (files, planets and stars)
  and settings, or the magnifier (or press `/`) to search.
- **The void** in the middle is how you add things. Click it and it opens
  wide, and a sheet of paper rises out of the dark: write a note, paste a
  link or upload, and pick where it goes: **Star** (loose, by the void),
  **Autosort**, a **Planet** you choose, or a **New planet** you name right
  there. You can also drop files straight onto the void.
- **Planets** are collections (drawers, in the code). Each one is a slowly
  turning world with your files laid across its surface, bigger the more it
  holds; full ones get thin rings, and some have small moons. Hover for a
  peek at what's on it; drag a file from your computer, or a star, onto a
  planet to put it there. Open a planet to see and edit everything in it,
  and use **Share** there to choose who can see it.
- **Kinds of planet**: every planet is one of eight worlds (ocean, green,
  gas giant, lava, ice, desert, moon rock, storm), each with its own ground
  and weather: drifting clouds, sliding bands, slowly glowing lava seams,
  dust storms, now-and-then lightning. A new planet gets one picked for it;
  change it with **Planet type…** in the planet's ••• menu. The planet's
  colour tints whichever kind it is.
- **Arranging**: drag your planets anywhere in your galaxy (on a phone,
  hold one for a moment first; with the keyboard, Shift and the arrow
  keys). Everyone who opens your galaxy sees them where you put them, and
  your little galaxy in the universe keeps the same shape. Phones squeeze
  the arrangement to fit. **Tidy planets** in your account sheet lets them
  spread out on their own again.
- **Stars** are files that aren't on a planet yet. They sit as small
  thumbnails clustered round the void, newest closest in. Click to open,
  drag onto a planet, or drag back into the void to autosort it.
- **Autosort** sends new things to a planet by itself: one whose name
  matches the words, one named after the kind of file (Images, Links,
  Notes, Reading...), or one that's mostly that kind. If none fits, a new
  planet is born.
- **Who can see a planet**: Private (only you), Code (anyone who has your
  4-digit code, the default), People (the usernames you list) or Public
  (everyone signed in). A public planet can also let others add files.
- **The universe**: keep scrolling down and your galaxy shrinks away into a
  dark universe of everyone's galaxies (or go straight to `/universe`).
  Click one to visit it. Planets you can't open yet look frosted; type
  their code to thaw them. Wrong codes count toward the same lockout as
  signing in; changing your code locks everyone out again. **Save** a file
  you like to keep your own copy.
- **Going home**: away from your galaxy, a little spaceship waits in the
  top-left corner, nose toward the wordmark. Tap it and it takes off, swings
  out across the page and flies you home.
- **Files**: text (light Markdown; click your text to edit it in place),
  links, images, video, audio, PDFs, documents, code, archives. Links open
  with a picture of the site (taken by WordPress.com's free mShots service,
  so the link's address is sent there); YouTube and Vimeo play inline; PDFs
  scroll inside Mutt, drawn with pdf.js. One file can sit on many planets.
- **Settings**: mode (Auto, Light or Dark), sky (Vita, Nebula, Aurora,
  Dusk), logo, autosort, text size, and motion (Lively, Calm or Still).
  Mutt also respects your system's reduce-motion setting.

The pre-galaxy Mutt is kept on the `classic` branch and the `classic-v1`
tag. Both read the same database, so you can switch back and forth; the
classic version just ignores who-can-see settings, planet kinds and where
you've put planets, and treats every planet as Code.

## Run it

Needs Python 3.9 or newer, and nothing else: no packages to install.

```bash
python3 server.py
```

Then open http://localhost:8080 and make an account.

Everything lives in `data/`: `mutt.db` (SQLite), `files/` (uploads, one folder
per user) and `secret.key`. Back up that folder to back up Mutt.

### Settings (environment variables)

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` / `HOST` | `8080` / `127.0.0.1` | Where to listen. Use `HOST=0.0.0.0` to let other devices on your network in. |
| `MUTT_DATA_DIR` | `./data`, or a volume at `/data` | Where the database and files go. |
| `MUTT_ALLOW_SIGNUPS` | `1` | Set to `0` to stop new accounts (existing ones keep working). |
| `MUTT_MAX_UPLOAD_MB` | `512` | Largest single file. |
| `MUTT_TRUST_PROXY` | off (on in the Docker image) | Trust the hosting proxy's headers, so cookies are marked Secure and client IPs are read correctly. Only turn on behind a proxy. |
| `MUTT_SECRET` | from `data/secret.key` | Extra secret mixed into PIN hashes. Set it if your data folder isn't private. |

## Put it online

Mutt runs anywhere that builds a `Dockerfile` from GitHub and can attach a
storage volume. Mount the volume at **`/data`** and Mutt finds it by itself;
the Docker image already trusts the host's HTTPS proxy. Without a volume,
everything is erased on each deploy, and the logs say so loudly.

Check `https://<your-address>/api/health`: `"persistentStorage": true` means
your data is on the volume.

### Northflank (free sandbox)

1. Link GitHub under **Integrations → Git → Link GitHub**, and allow this repo.
2. **Create new → Service → Combined.** Pick this repo and the `main` branch,
   build type **Dockerfile** (repo root).
3. Under networking, make port **8080** **HTTP** and **Public**.
4. On the service, **Volumes → Add volume**, container mount path `/data`.
5. The public address is shown at the top of the service page.

### Railway

**New Project → Deploy from GitHub repo**, attach a volume (any mount path),
then **Settings → Networking → Generate Domain**. `railway.json` handles the
rest.

### Any Docker host

```bash
docker build -t mutt .
docker run -p 8080:8080 -v mutt-data:/data mutt
```

Every push to the deployed branch redeploys; your data stays on the volume.
Once your friends have accounts, set `MUTT_ALLOW_SIGNUPS=0` if you want to
keep it closed.

## About 4-digit PINs

A 4-digit code only has 10,000 options, so Mutt slows guessing down hard:

- Each PIN is hashed with scrypt plus a server-side secret.
- After 5 wrong PINs an account locks for 30 seconds, then the lock doubles
  with each miss (up to an hour). Guessing every PIN would take years.
- Each IP address also gets 30 misses per 15 minutes across all accounts.
- Sessions are HttpOnly cookies; changing your PIN signs out other devices.

It's fine for a personal archive. Don't keep anything in it you'd lose sleep
over if someone guessed right.

## Layout

```
server.py            starts the server
mutt/                Python: app, api, auth, db, links (link previews), kinds (bundles)
public/index.html    the single page
public/assets/       mutt.css + galaxy.css, and js/ (galaxy, planets, the void, sky, viewer…)
tests/               API test suites: tests/run.sh [smoke|galaxy|preview]
```

Previews (image thumbnails, video posters, PDF first pages) are made in the
browser during upload, so the server never decodes media. PDF previews load
pdf.js from cdnjs; fonts come from Google Fonts (Red Hat Text and Red Hat Mono).

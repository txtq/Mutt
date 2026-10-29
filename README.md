# Mutt

A personal place to keep things and connect them, like Are.na with only
what's needed. On load the wordmark flicks through two dozen typefaces
before settling on one of five logos (pick yours in Settings).

- **Accounts**: a username and a 4-digit code.
- **Filing cabinet**: your drawers, one per row with a strip of what's inside.
  Each drawer has a pixel critter you can redraw.
- **Files**: text (light Markdown; click your text to edit it in place),
  links, images, video, audio, PDFs, documents, code, archives. The first
  box in every drawer adds: type, paste, drop or upload. Drag files to
  rearrange a drawer.
- **Links** open like a page: the address along the top (click to visit), a
  picture of the site, and the site's own description. YouTube and Vimeo
  play inline. The picture is taken by WordPress.com's free mShots service a
  few seconds after you add the link, so the link's address is sent there.
- **PDFs** open and scroll inside Mutt, page by page (drawn with pdf.js), with
  zoom, on phones as well.
- **Connections**: one file can live in many drawers ("Connect →").
- **Everything**: every file you've added, sortable by New, Old, Color,
  Vibes, Format, A–Z and Size. Color and Vibes use each picture's colours,
  measured in the browser and saved with the file.
- **Community**: a shared feed. Anything you add there (or share from a
  file's viewer or ••• menu) is visible to everyone signed in; the drawers it
  sits in stay private. **Save** someone's shared file to keep your own
  copy in Everything or a drawer (it records who it came from and survives
  the original being unshared or deleted). **Drawers** are community
  drawers: anyone can add to them, the person who made one can rename it,
  rearrange it and take other people's files out (they stay with their
  owner). Any drawer can be switched to a community drawer and back from its
  ••• menu. **People** lists everyone with their critters and what
  they've shared; type someone's code to look inside their drawers (view
  only). Wrong codes count toward the same lockout as signing in; changing
  your code locks everyone out again.
- **Settings**: logo, font (nine presets or upload your own woff2/woff/ttf/otf),
  size, accent colour, paper tint, corners, spacing, captions, motion, and
  colorful mode (critters everywhere, candy colours, dotted paper).

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
public/assets/       mutt.css and js/ (views, grid, viewer, uploads, pixel critters…)
```

Previews (image thumbnails, video posters, PDF first pages) are made in the
browser during upload, so the server never decodes media. PDF previews load
pdf.js from cdnjs; fonts come from Google Fonts (Geist).

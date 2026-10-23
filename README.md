# Mutt

A personal place to keep things and connect them. Like Are.na, trimmed to
what's needed: drawers, blocks, connections, and bundles that sort everything
by kind automatically.

- **Accounts**: a username and a 4-digit PIN. Anyone with the link can make
  an account (you can turn that off).
- **Drawers**: Mutt's channels. Each one gets a pixel critter you can redraw.
- **Blocks**: text (light Markdown), links (title and preview pulled in;
  YouTube and Vimeo play inline), images, video, audio, PDFs (first-page
  preview), documents, code, archives: any file.
- **The grid**: four wide, newest first. The first box always adds: type,
  paste a link, paste an image, drop files, or choose files. Drag blocks to
  reorder a drawer.
- **Connections**: one block can live in many drawers ("Connect →").
- **Bundles**: a Grid ⇄ Bundles switch on every drawer (and on Everything)
  sorts blocks into boards by kind: Images, Videos, Audio, PDFs, Text, Links,
  Documents, Code, Archives, Other. The filter chips do the same inline. The
  **Bundles** page does it across everything, can narrow by file type (PNG,
  JPG…), and can save any bundle as a real drawer.

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
| `MUTT_DATA_DIR` | `./data`, or the Railway volume | Where the database and files go. |
| `MUTT_ALLOW_SIGNUPS` | `1` | Set to `0` to stop new accounts (existing ones keep working). |
| `MUTT_MAX_UPLOAD_MB` | `512` | Largest single file. |
| `MUTT_TRUST_PROXY` | off (on for Railway) | Set to `1` behind other HTTPS hosting (Render, Fly, nginx) so cookies are marked Secure and client IPs are read correctly. |
| `MUTT_SECRET` | from `data/secret.key` | Extra secret mixed into PIN hashes. Set it if your data folder isn't private. |

## Put it online (Railway)

Mutt is set up for [Railway](https://railway.com): `railway.json` tells it to
build the `Dockerfile` and check `/api/health` before switching to a new deploy.

1. In Railway: **New Project → Deploy from GitHub repo →** pick this repo.
2. On the service: **right-click → Attach Volume** (or **+ Create → Volume**),
   mount path `/data`. Without a volume, everything is erased on each deploy.
3. **Settings → Networking → Generate Domain** for a public address.
4. Open `https://<your-domain>/api/health`: `"persistentStorage": true` means
   the volume is in use.

Mutt finds the volume by itself (`RAILWAY_VOLUME_MOUNT_PATH`) and trusts
Railway's HTTPS proxy automatically. Every push to the deployed branch
redeploys; your data stays on the volume.

Any other Docker host works too. Give it a persistent disk and point Mutt at it:

```bash
docker build -t mutt .
docker run -p 8080:8080 -e MUTT_DATA_DIR=/data -v mutt-data:/data mutt
```

Behind HTTPS on other hosts, also set `MUTT_TRUST_PROXY=1`. Once your
friends have accounts, set `MUTT_ALLOW_SIGNUPS=0` if you want to keep it closed.

## About 4-digit PINs

A 4-digit PIN only has 10,000 options, so Mutt slows guessing down hard:

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

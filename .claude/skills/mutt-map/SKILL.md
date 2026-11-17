---
name: mutt-map
description: How each Mutt feature is built (its routes, tables, server and front-end files, settings and checks), one file per feature. Read the matching file before changing, debugging or explaining a feature (comets, beams, shared planets, board, cookbook, documents, reading, search, sound, phones, the galaxy and sky, autosort, sharing and sign-in, and the rest), and update it when the feature changes.
user-invocable: false
---

# The map of Mutt

`CLAUDE.md`, under **Architecture**, lists every file here with a line saying what it covers. Each file is the paragraph that used to sit in `CLAUDE.md` for that feature.

- **Before** changing a feature: read its file (and the files of any feature it touches). `grep -l 'word' .claude/skills/mutt-map/*.md` finds which files mention a function, table or route.
- **After** changing it: update its file in the same change, in the same style (what it is, where it lives, which names to look for, which checks cover it). Replace stale words rather than piling on.
- **A new feature** gets a new file here and a one-line entry in the list in `CLAUDE.md`, beside the one it is most like.
- A rule that reaches across features (like `deleted_at IS NULL`) also goes in the short "Rules that reach across features" list in `CLAUDE.md`.
- How things look and move is not here: that is `DESIGN.md`.

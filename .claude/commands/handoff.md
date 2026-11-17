---
description: Update the shared PROGRESS.md (and CLAUDE.md preferences) so the next session can pick up where this one left off
---

Update the handoff notes for this repository.

The notes are one shared file, `/Users/edan/Mutt-notes/PROGRESS.md`, in a folder beside the project. The repo's own `PROGRESS.md` is only a pointer to it: don't write notes there. Finished work lives in `/Users/edan/Mutt-notes/history/` (files under 200 KB each, newest first, listed in `/Users/edan/Mutt-notes/HISTORY.md`); search it with `grep -rn 'word' /Users/edan/Mutt-notes/history/`.

1. Read `/Users/edan/Mutt-notes/PROGRESS.md` (on its own) and `CLAUDE.md`, and check `git status`, `git log --oneline -10` and `git worktree list` so the notes match reality.
2. In `/Users/edan/Mutt-notes/PROGRESS.md`:
   - Update **Where things stand**: your entry, with today's date, your branch, its latest commit and whether it is merged and deployed. Other sessions edit this file too, so keep their entries.
   - If your work is now live (or was dropped), move its entry out of **Where things stand** to the top of the newest file in `history/`, cut to a few lines (past 150 KB, start a new file and list it in `HISTORY.md`). Do the same for any other entry you can see has gone live (its work is in `main`).
   - Rewrite **Next** as a short ordered list of what's left, including anything unfinished or unverified from this session. Name the branch for work that isn't merged yet.
   - Add any new preferences the user gave this session to **Preferences the user has given**.
3. If a preference should hold for all future work, also add it to the **User preferences** section of `CLAUDE.md`. Update any other part of `CLAUDE.md` this session made out of date (commands, branches), and the feature's file in `.claude/skills/mutt-map/` for any feature it changed (a new feature: a new file there and its line in the list under Architecture in `CLAUDE.md`).
4. Keep both files short. Replace stale lines rather than piling on. Check `wc -c /Users/edan/Mutt-notes/PROGRESS.md`: over 100 KB means finished entries were left behind, so move them to the history.
5. Commit only if the user has asked for commits in this project, otherwise leave the files uncommitted and say so. `CLAUDE.md` is committed on your branch. The shared notes are outside git, so there's nothing to commit for them.

$ARGUMENTS

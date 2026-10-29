---
description: Update PROGRESS.md (and CLAUDE.md preferences) so the next session can pick up where this one left off
---

Update the handoff notes for this repository.

The notes are one shared file, `/Users/edan/Mutt/PROGRESS.md`, in the main checkout. If you are in a worktree, its own `PROGRESS.md` is a stale copy: don't read or edit it.

1. Read `/Users/edan/Mutt/PROGRESS.md` (on its own) and `CLAUDE.md`, and check `git status`, `git log --oneline -10` and `git worktree list` so the notes match reality.
2. In `/Users/edan/Mutt/PROGRESS.md`:
   - Update **Where things stand**: today's date, and for your branch its latest commit and whether it is merged and deployed.
   - Rewrite **Next** as a short ordered list of what's left, including anything unfinished or unverified from this session. Name the branch for work that isn't merged yet. Other sessions edit this file too, so keep their lines.
   - Add a dated entry at the top of **Done**: what changed in this session, in plain words, a few bullets.
   - Add any new preferences the user gave this session to **Preferences the user has given**.
3. If a preference should hold for all future work, also add it to the **User preferences** section of `CLAUDE.md`. Update any other part of `CLAUDE.md` this session made out of date (commands, architecture, branches).
4. Keep both files short. Replace stale lines rather than piling on.
5. Commit only if the user has asked for commits in this project, otherwise leave the files uncommitted and say so. `CLAUDE.md` is committed on your branch. The shared `PROGRESS.md` is committed from the main checkout on `galaxy`, usually alongside a merge or deploy.

$ARGUMENTS

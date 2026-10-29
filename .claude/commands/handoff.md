---
description: Update PROGRESS.md (and CLAUDE.md preferences) so the next session can pick up where this one left off
---

Update the handoff notes for this repository.

1. Read `PROGRESS.md` and `CLAUDE.md`, and check `git status` and `git log --oneline -10` so the notes match reality.
2. In `PROGRESS.md`:
   - Rewrite **Where things stand** with today's date, the current branch, the latest commit, and whether it is merged and deployed.
   - Rewrite **Next** as a short ordered list of what's left, including anything unfinished or unverified from this session.
   - Add a dated entry at the top of **Done**: what changed in this session, in plain words, a few bullets.
   - Add any new preferences the user gave this session to **Preferences the user has given**.
3. If a preference should hold for all future work, also add it to the **User preferences** section of `CLAUDE.md`. Update any other part of `CLAUDE.md` this session made out of date (commands, architecture, branches).
4. Keep both files short. Replace stale lines rather than piling on.
5. Commit only these files, with a message like `Update handoff notes`, if the user has asked for commits in this project. Otherwise leave them uncommitted and say so.

$ARGUMENTS

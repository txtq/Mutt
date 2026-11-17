---
name: deploy
description: Take this branch's finished work live on Mutt (fast-forward main and galaxy on GitHub, which Northflank deploys), after the whole check run passes. Only when the user asks to go live.
disable-model-invocation: true
---

# Go live

The user typed `/deploy`, so they want this branch's work live. Stop and tell them at the first step that fails; never go live on a failure.

1. **What goes live.** `git status`, `git log --oneline origin/main..HEAD`. If there are changes not yet committed, list them in a line and commit them (message ending with the `Co-Authored-By` line from `CLAUDE.md`). Anything that looks unrelated to this branch's work (scratch files, another feature's files): ask before including it.
2. **Up to date.** `git fetch origin`. If `origin/main` has moved past where this branch started, `git rebase origin/main`; on a conflict, read both sides and keep both features, then run the suites the conflicting files belong to.
3. **Every check.** `tests/run.sh` (the whole run, about two minutes; run it in the background). It must end `ALL PASSED`. A failure: report it with its lines and stop. Never `--accept` to get past one.
4. **Looked at.** The user's rule is to check changes in the browser at desktop and phone width before going live. If this session changed anything visible and hasn't looked at it at 1280 and 375 wide, do that now (the hidden browser, `tests/run.sh browser --keep` or a path's pictures in `tests/shots/latest`).
5. **Push.** Local `main` is checked out in the main folder, so don't switch to it: push this branch straight to both:
   ```bash
   git push origin HEAD:main
   ```
   ```bash
   git push origin HEAD:galaxy
   ```
   Both must be fast-forwards. If either is refused, someone went live meanwhile: go back to step 2. Never force-push. Leave `classic` and the `classic-v1` tag alone.
6. **Live.** Northflank rebuilds in about a minute. Then check that a new asset address from this change answers 200 on https://p01--mutt--cxklgp67kgsx.code.run, and that `/api/health` shows `persistentStorage: true`.
7. **Written down.** In `/Users/edan/Mutt-notes/PROGRESS.md`, move this work's entry to the top of the newest file in `/Users/edan/Mutt-notes/history/` (a few lines: the commit, what went live, what wasn't checked), and update the "Live now" line. Keep it under 100 KB.
8. **Sidebar.** Move the chats whose work is now on `main` (this one too) out of the "working" group into the ungrouped Mutt section; leave unfinished ones there.
9. Tell the user in plain words what went live, the commit, and anything not checked (real Safari, a real phone).

$ARGUMENTS

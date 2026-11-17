#!/bin/bash
# When Claude is about to stop: if this checkout has work (changes not committed,
# or commits not yet in origin/main) that is newer than the shared handoff notes,
# or the notes never name this branch, ask once to bring the notes up to date.
# It asks at most once per stop (stop_hook_active), so it can never loop.
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = true ] && exit 0
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
notes=/Users/edan/Mutt-notes/PROGRESS.md
[ -f "$notes" ] || exit 0

branch=$(git branch --show-current 2>/dev/null)
[ -n "$branch" ] || exit 0

# Newest piece of work here: a changed file's time, or a commit not in main.
newest=0
while IFS= read -r path; do
  [ -e "$path" ] || continue
  t=$(stat -f %m "$path" 2>/dev/null || echo 0)
  [ "$t" -gt "$newest" ] && newest=$t
done < <(git status --porcelain --untracked-files=all 2>/dev/null | cut -c4- | sed 's/.* -> //')
if git rev-parse -q --verify origin/main >/dev/null; then
  t=$(git log -1 --format=%ct origin/main..HEAD 2>/dev/null)
  [ -n "$t" ] && [ "$t" -gt "$newest" ] && newest=$t
fi
[ "$newest" -gt 0 ] || exit 0   # nothing done here

noted=$(stat -f %m "$notes")
if [ "$newest" -gt "$noted" ] || ! grep -qF "$branch" "$notes"; then
  jq -n --arg b "$branch" '{decision: "block", reason: ("Handoff check: this checkout (branch " + $b + ") has work newer than /Users/edan/Mutt-notes/PROGRESS.md, or the notes never name the branch. If the task is finished, update the notes as CLAUDE.md'"'"'s Handoff rule says (or follow /handoff), then stop. If you are only pausing to ask the user something, stop now without changing anything.")}'
fi
exit 0

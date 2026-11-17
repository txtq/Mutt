#!/bin/bash
# After Claude edits a file: a syntax check for Python and scripts, and the drift
# count for stylesheets and scripts. Quiet when all is well; on a problem it
# prints it and exits 2, so Claude sees it and fixes it in the same step.
f=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[ -n "$f" ] && [ -f "$f" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
here=$(dirname "$0")
problem=""

case "$f" in
  *.py)
    out=$(python3 -c '
import ast, sys
try:
    ast.parse(open(sys.argv[1]).read(), sys.argv[1])
except SyntaxError as e:
    print("line %s: %s" % (e.lineno, e.msg))
    print("    " + (e.text or "").rstrip())
    sys.exit(1)' "$f" 2>&1) || problem="Python syntax error in $f, $out"
    ;;
  */public/*.js)
    jsc=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
    if [ -x "$jsc" ]; then
      out=$("$jsc" "$here/js-syntax.js" -- "$f" 2>&1)
      [ "$out" = ok ] || problem="Script syntax error in $f (line after the colon): $out"
    fi
    ;;
esac

case "$f" in
  */public/assets/*.css|*/public/assets/*.js|*/public/assets/js/*)
    out=$(tests/run.sh drift 2>&1) || problem="${problem:+$problem\n\n}$out\n(See \"Drift\" under Checks in CLAUDE.md: use the named value from tokens.css / util.js.)"
    ;;
esac

if [ -n "$problem" ]; then
  printf '%b\n' "$problem" >&2
  exit 2
fi
exit 0

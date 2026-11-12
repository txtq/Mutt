#!/bin/bash
# One command for every check. Prints a few lines; details only for failures.
#   tests/run.sh            everything (API suites, then the browser paths in Safari)
#   tests/run.sh api        API suites only        tests/run.sh browser   browser only
#   tests/run.sh galaxy     one suite              tests/run.sh -v galaxy  ...and print all it said
#   tests/run.sh --accept galaxy   save its answers as the right ones (read the changes first)
#   tests/run.sh drift      the count of hand-typed colours, sizes, corners, shadows and speeds (must not go up)
exec python3 "$(dirname "$0")/runner.py" "$@"

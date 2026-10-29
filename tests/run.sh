#!/bin/bash
# Runs API test suites against a fresh server on port 8099 with a throwaway
# data folder. Usage: tests/run.sh [smoke|galaxy|preview ...]  (default: all)
# The suites print what the API answered; read the output for wrong values.
cd "$(dirname "$0")/.." || exit 1
SUITES=("$@"); [ ${#SUITES[@]} -eq 0 ] && SUITES=(smoke galaxy preview)
for N in "${SUITES[@]}"; do
  WORK=$(mktemp -d)
  MUTT_DATA_DIR="$WORK/data" PORT=8099 python3 server.py > "$WORK/server.log" 2>&1 &
  PID=$!
  for i in $(seq 1 30); do curl -s -o /dev/null localhost:8099/api/health && break; sleep 0.2; done
  echo "== $N"
  bash "tests/$N.sh" "$WORK"
  kill $PID 2>/dev/null; wait $PID 2>/dev/null
  if grep -q Traceback "$WORK/server.log"; then echo "!! server errors:"; grep -A20 Traceback "$WORK/server.log"; fi
  rm -rf "$WORK"
done

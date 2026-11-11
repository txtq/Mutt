# Helpers for the API suites: source "$(dirname "$0")/lib.sh"
#
# rule "what went wrong, in plain words" "$got" "$should_be"
#   For the promises that must never break (privacy, sign-in). Prints one line;
#   when broken, the runner shows the plain sentence as the failure.
rule() {
  if [ "$2" = "$3" ]; then echo "rule holds: $1 -> no"
  else echo "RULE BROKEN: $1 (got $2, should be $3)"; fi
}
# status <curl args...>  -> just the HTTP status
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

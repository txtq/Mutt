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
# old_code <scratch dir> <username> <4 digits>
#   Gives an account the kind of 4-digit code made before codes were 6 digits.
old_code() {
  MUTT_DATA_DIR="$1/data" python3 -c "
import sys; from mutt import auth, db
c = db.connect(); h, s = auth.new_pin_hash(sys.argv[2])
c.execute('UPDATE users SET pin_hash = ?, pin_salt = ? WHERE username = ?', (h, s, sys.argv[1])); c.commit()" "$2" "$3"
}

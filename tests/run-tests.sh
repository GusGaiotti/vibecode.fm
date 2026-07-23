#!/usr/bin/env bash
# Test suite for scripts/vibecode.sh. No real mpv or socat needed: the mocks in
# tests/mocks simulate both, so this runs anywhere bash runs.

set -u

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$TESTS_DIR")"
SCRIPT="$ROOT/scripts/vibecode.sh"
BASE_PATH="/usr/bin:/bin"

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

assert_eq() { # actual expected message
  if [ "$1" = "$2" ]; then pass; else fail "$3 (expected [$2], got [$1])"; fi
}

assert_exists() { # path message
  if [ -e "$1" ]; then pass; else fail "$2 ($1 missing)"; fi
}

assert_missing() { # path message
  if [ ! -e "$1" ]; then pass; else fail "$2 ($1 should not exist)"; fi
}

setup() {
  SANDBOX="$(mktemp -d)"
  export VIBECODE_STATE_DIR="$SANDBOX/state"
  export VIBECODE_TEST_LOG="$SANDBOX/log"
  mkdir -p "$VIBECODE_TEST_LOG"
  SOCK="$VIBECODE_STATE_DIR/mpv.sock"
}

teardown() {
  rm -rf "$SANDBOX"
}

run() { # action, using full mocks (mpv + socat)
  env PATH="$TESTS_DIR/mocks:$BASE_PATH" bash "$SCRIPT" "$@"
}

launches() {
  if [ -f "$VIBECODE_TEST_LOG/mpv.launches" ]; then
    wc -l < "$VIBECODE_TEST_LOG/mpv.launches" | tr -d ' '
  else
    printf '0'
  fi
}

player_state() {
  cat "$SOCK.state" 2>/dev/null || printf 'none'
}

# --- play starts the player unpaused -----------------------------------------
setup
out="$(run play)"
assert_eq "$?" "0" "play exits 0"
assert_eq "$out" "" "play is silent"
assert_eq "$(launches)" "1" "play launches mpv once"
assert_eq "$(player_state)" "false" "play unpauses the player"
grep -q -- '--pause' "$VIBECODE_TEST_LOG/mpv.launches" \
  && pass || fail "mpv starts paused (--pause) before the unpause command"
teardown

# --- play twice is idempotent ------------------------------------------------
setup
run play >/dev/null
run play >/dev/null
assert_eq "$(launches)" "1" "second play reuses the running player"
assert_eq "$(player_state)" "false" "player still unpaused after second play"
teardown

# --- pause without a player does not start one -------------------------------
setup
out="$(run pause)"
assert_eq "$?" "0" "pause exits 0 with no player"
assert_eq "$out" "" "pause is silent"
assert_eq "$(launches)" "0" "pause never launches mpv"
assert_missing "$SOCK" "pause does not create a socket"
teardown

# --- play then pause ---------------------------------------------------------
setup
run play >/dev/null
run pause >/dev/null
assert_eq "$(player_state)" "true" "pause pauses the player"
run pause >/dev/null
assert_eq "$(player_state)" "true" "pause is idempotent"
teardown

# --- stale socket is cleaned up and the player restarted ---------------------
setup
mkdir -p "$VIBECODE_STATE_DIR"
touch "$SOCK" # socket file with no live player behind it
run play >/dev/null
assert_eq "$(launches)" "1" "stale socket triggers a fresh mpv launch"
assert_eq "$(player_state)" "false" "player is unpaused after restart"
teardown

# --- disabled flag wins ------------------------------------------------------
setup
mkdir -p "$VIBECODE_STATE_DIR"
touch "$VIBECODE_STATE_DIR/disabled"
run play >/dev/null
assert_eq "$(launches)" "0" "play respects the disabled flag"
assert_eq "$(run status)" "" "status is empty while disabled"
teardown

# --- status reflects the player state ----------------------------------------
setup
assert_eq "$(run status)" "" "status is empty with no player"
run play >/dev/null
assert_eq "$(run status)" "▶" "status shows play icon while playing"
run pause >/dev/null
assert_eq "$(run status)" "⏸" "status shows pause icon while paused"
teardown

# --- off kills and disables, on re-enables -----------------------------------
setup
run play >/dev/null
run off >/dev/null
assert_missing "$SOCK" "off removes the socket"
assert_exists "$VIBECODE_STATE_DIR/disabled" "off drops the disabled flag"
assert_eq "$(run status)" "" "status is empty after off"
run on >/dev/null
assert_missing "$VIBECODE_STATE_DIR/disabled" "on clears the disabled flag"
assert_eq "$(launches)" "2" "on starts the player again"
assert_eq "$(player_state)" "false" "player is unpaused after on"
teardown

# --- no mpv installed: everything degrades silently --------------------------
setup
mkdir -p "$SANDBOX/only-socat"
cp "$TESTS_DIR/mocks/socat" "$SANDBOX/only-socat/socat"
chmod +x "$SANDBOX/only-socat/socat"
out="$(env PATH="$SANDBOX/only-socat:$BASE_PATH" bash "$SCRIPT" play)"
assert_eq "$?" "0" "play exits 0 without mpv"
assert_eq "$out" "" "play is silent without mpv"
assert_missing "$SOCK" "no socket is created without mpv"
teardown

# --- broken IPC transport: still silent, still exit 0 ------------------------
setup
mkdir -p "$SANDBOX/broken"
cp "$TESTS_DIR/mocks/mpv" "$SANDBOX/broken/mpv"
for tool in socat nc python3; do
  printf '#!/usr/bin/env bash\nexit 1\n' > "$SANDBOX/broken/$tool"
done
chmod +x "$SANDBOX/broken"/*
out="$(env PATH="$SANDBOX/broken:$BASE_PATH" bash "$SCRIPT" play)"
assert_eq "$?" "0" "play exits 0 with a broken IPC transport"
assert_eq "$out" "" "play is silent with a broken IPC transport"
teardown

# --- unknown action is a silent no-op ----------------------------------------
setup
out="$(run bogus)"
assert_eq "$?" "0" "unknown action exits 0"
assert_eq "$out" "" "unknown action is silent"
teardown

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

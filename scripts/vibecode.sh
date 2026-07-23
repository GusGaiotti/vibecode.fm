#!/usr/bin/env bash
# vibecode.fm - drives a shared mpv instance over its JSON IPC socket.
# Usage: vibecode.sh <play|pause|status|track|on|off>
#
# Invoked by Claude Code hooks, so the contract is strict: never block, never
# write to stdout (except `status`), always exit 0.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

STATE_DIR="${VIBECODE_STATE_DIR:-${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/vibecode-fm-$(id -u)}"
SOCK="$STATE_DIR/mpv.sock"
DISABLED_FLAG="$STATE_DIR/disabled"
SOURCE="${VIBECODE_SOURCE:-$PLUGIN_ROOT/playlists/default.m3u}"
VOLUME="${VIBECODE_VOLUME:-70}"

ipc_send() {
  # Sends one JSON command to the mpv socket, prints the raw response.
  local json="$1"
  if command -v socat >/dev/null 2>&1; then
    printf '%s\n' "$json" | socat -t 1 - "UNIX-CONNECT:$SOCK" 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "$SOCK" "$json" 2>/dev/null <<'PY'
import socket, sys
try:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(1.0)
    s.connect(sys.argv[1])
    s.sendall((sys.argv[2] + "\n").encode())
    print(s.recv(4096).decode(), end="")
except Exception:
    pass
PY
  elif command -v nc >/dev/null 2>&1; then
    printf '%s\n' "$json" | nc -U -w 1 "$SOCK" 2>/dev/null
  fi
}

player_alive() {
  [ -e "$SOCK" ] || return 1
  ipc_send '{"command":["get_property","mpv-version"]}' | grep -q '"error":"success"'
}

start_player() {
  command -v mpv >/dev/null 2>&1 || return 1
  rm -f "$SOCK"
  nohup mpv --no-video --no-terminal --really-quiet --idle=yes \
    --loop-playlist=inf --volume="$VOLUME" --pause \
    --input-ipc-server="$SOCK" "$SOURCE" </dev/null >/dev/null 2>&1 &
  disown 2>/dev/null || true
  # Give the socket a moment to come up; bail quietly if it never does.
  for _ in $(seq 1 30); do
    player_alive && return 0
    sleep 0.1
  done
  return 1
}

do_play() {
  [ -f "$DISABLED_FLAG" ] && return 0
  mkdir -p "$STATE_DIR"
  player_alive || start_player || return 0
  ipc_send '{"command":["set_property","pause",false]}' >/dev/null
}

do_pause() {
  [ -e "$SOCK" ] || return 0
  ipc_send '{"command":["set_property","pause",true]}' >/dev/null
}

do_off() {
  [ -e "$SOCK" ] && ipc_send '{"command":["quit"]}' >/dev/null
  rm -f "$SOCK"
  mkdir -p "$STATE_DIR"
  touch "$DISABLED_FLAG"
}

do_on() {
  rm -f "$DISABLED_FLAG"
  do_play
}

do_status() {
  [ -f "$DISABLED_FLAG" ] && return 0
  [ -e "$SOCK" ] || return 0
  local resp
  resp="$(ipc_send '{"command":["get_property","pause"]}')"
  case "$resp" in
    *'"data":false'*) printf '▶' ;;
    *'"data":true'*)  printf '⏸' ;;
  esac
}

do_track() {
  [ -f "$DISABLED_FLAG" ] && return 0
  [ -e "$SOCK" ] || return 0
  ipc_send '{"command":["get_property","media-title"]}' \
    | sed -n 's/.*"data":"\([^"]*\)".*/\1/p' | cut -c 1-48 | tr -d '\n'
}

main() {
  local action="${1:-}"
  case "$action" in
    status|track) ;;
    *) exec >/dev/null ;;
  esac
  case "$action" in
    play)   do_play ;;
    pause)  do_pause ;;
    status) do_status ;;
    track)  do_track ;;
    on)     do_on ;;
    off)    do_off ;;
  esac
  exit 0
}

main "$@"

#!/usr/bin/env bash
# Example Claude Code statusline showing the current model and the player state.
# Point your settings.json at it:
#   "statusLine": { "type": "command", "command": "/path/to/examples/statusline.sh" }
# Or just append `$(/path/to/scripts/vibecode.sh status)` to the statusline you already have.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

input="$(cat)"
model="$(printf '%s' "$input" | sed -n 's/.*"display_name":[[:space:]]*"\([^"]*\)".*/\1/p')"
icon="$("$SCRIPT_DIR/../scripts/vibecode.sh" status)"

printf '%s' "${model:-Claude}"

if [ -n "$icon" ]; then
  track="$("$SCRIPT_DIR/../scripts/vibecode.sh" track)"
  # Two-frame note "animation": each statusline refresh picks a frame off the clock.
  if [ "$icon" = "▶" ] && [ $(( $(date +%s) % 2 )) -eq 0 ]; then
    note='♪'
  else
    note='♫'
  fi
  printf ' | %s %s %s' "$icon" "$note" "${track:-vibecode.fm}"
fi
exit 0

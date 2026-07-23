#!/usr/bin/env bash
# Example Claude Code statusline: model on the left, and on the far right the
# player state (flat ► / ❚❚ glyph), a bouncing musical note, and the track title.
#
# Point your settings.json at it:
#   "statusLine": { "type": "command", "command": "/path/to/examples/statusline.sh" }
# Or just append `$(/path/to/scripts/vibecode.sh status)` to your own statusline.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIBE="$SCRIPT_DIR/../scripts/vibecode.sh"

input="$(cat)"
model="$(printf '%s' "$input" | sed -n 's/.*"display_name":[[:space:]]*"\([^"]*\)".*/\1/p')"
left="${model:-Claude}"

icon="$("$VIBE" status)"

right=""
if [ -n "$icon" ]; then
  track="$("$VIBE" track)"
  note=""
  if [ "$icon" = "►" ]; then
    # Three-frame note animation; advances once per second whenever the
    # statusline repaints (which happens while the agent is working).
    frames=('♪' '♫' '♬')
    note="${frames[$(( $(date +%s) % 3 ))]} "
  fi
  right="$icon ${note}${track:-vibecode.fm}"
fi

if [ -n "$right" ]; then
  width="${COLUMNS:-$(tput cols 2>/dev/null || echo 80)}"
  pad=$(( width - ${#left} - ${#right} ))
  [ "$pad" -lt 1 ] && pad=1
  printf '%s%*s%s' "$left" "$pad" "" "$right"
else
  printf '%s' "$left"
fi
exit 0

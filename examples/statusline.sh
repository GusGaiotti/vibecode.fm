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
[ -n "$icon" ] && printf ' | %s vibecode.fm' "$icon"

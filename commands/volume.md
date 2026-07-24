---
description: Set vibecode.fm volume (up, down, or 0-100)
allowed-tools: Bash
argument-hint: [up|down|0-100]
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/vibecode.js" volume "$ARGUMENTS"`

The volume was adjusted ("$ARGUMENTS" = up, down, or a number 0-100) and saved.
If the user gave nothing or something invalid, tell them the accepted values.

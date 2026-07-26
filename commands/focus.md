---
description: Focus mode — pause when it's your turn (on), or play non-stop (off)
allowed-tools: Bash
argument-hint: [on|off]
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/vibecode.js" focus "$ARGUMENTS"`

Focus mode was set to "$ARGUMENTS". With focus ON (default) the music pauses
when it's your turn; with focus OFF it plays continuously. Tell the user which
mode is now active.

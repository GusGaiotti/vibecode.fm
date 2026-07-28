---
description: Minimal status line — just the track name, no sprites or splash phrase
allowed-tools: Bash
argument-hint: [on|off]
---

!`"${CLAUDE_PLUGIN_ROOT}/bin/vibecode-fm" minimal "$ARGUMENTS"`

Minimal mode was toggled ("$ARGUMENTS" may be on, off, or empty to flip it). On: the status
line shows only the track name. Off: sprites and the splash phrase come back. Tell the user, in
one short line, which way it went.

---
description: Toggle vibecode.fm debug logging (event + audio-state trace)
allowed-tools: Bash
argument-hint: [on|off]
---

!`"${CLAUDE_PLUGIN_ROOT}/bin/vibecode-fm" debug "$ARGUMENTS"`

Debug logging was turned on ("$ARGUMENTS" empty or `on`) or off (`off`). When on, every hook
event and audio-state change is written to `vibecode.log` in the state directory — useful for a
bug report. Tell the user which way it went, and where the log lives if they turned it on.

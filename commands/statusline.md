---
description: Turn the vibecode.fm status line on or off (writes settings.json for you)
allowed-tools: Bash
argument-hint: [on|off]
---

!`"${CLAUDE_PLUGIN_ROOT}/bin/vibecode-fm" setup-statusline "$ARGUMENTS"`

The vibecode.fm status line was turned on ("$ARGUMENTS" empty or `on`) or off (`off`) by
writing the `statusLine` command into the user's `settings.json`. Tell the user which way it
went and that they need to **restart Claude Code** (or reload settings) for it to take effect.
If they had their own status line, `on` replaced it — mention they can get it back with `off`.

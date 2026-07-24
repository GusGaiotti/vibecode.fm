---
description: Switch the vibecode.fm station (chill, lofi, ambient, metal, jazz, synthwave, hacker, beats, indie, rock)
allowed-tools: Bash
argument-hint: [vibe]
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/vibecode.js" radio "$ARGUMENTS"`

The station was set to "$ARGUMENTS" (if it's a known vibe) and playback started.
Known vibes: chill, lofi, ambient, drone, metal, jazz, synthwave, retro, hacker,
defcon, beats, hiphop, indie, rock. If the user gave an unknown or empty vibe,
tell them the list above.

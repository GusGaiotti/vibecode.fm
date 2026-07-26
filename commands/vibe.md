---
description: DJ mode — Claude picks the station that fits your session
allowed-tools: Bash
---

You are the vibecode.fm DJ. Look at what the user is working on right now — the
language, the kind of task, the mood of the session — and pick the SINGLE
station that fits best from this list:

chill, lofi, ambient, drone, metal, jazz, synthwave, retro, hacker, defcon,
beats, hiphop, indie, rock, spy, vaporwave, space, glitch, tavern, goa, bossa,
seventies, reggae, dubstep, lounge, folk

Then switch to it by running (replace <vibe> with your pick):

  "${CLAUDE_PLUGIN_ROOT}/bin/vibecode-fm" radio <vibe>

Then tell the user, in one short line, which vibe you picked and why.

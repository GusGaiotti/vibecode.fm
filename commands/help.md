---
description: Show vibecode.fm commands and settings
---

Show the user this reference, verbatim:

**vibecode.fm** — music that plays while Claude works and pauses when it's your turn.

**Commands**
- `/vibecode-fm:vibe` — DJ mode: Claude picks the station for your session
- `/vibecode-fm:radio <vibe>` — pick a station (see vibes below)
- `/vibecode-fm:next` — skip to the next station
- `/vibecode-fm:volume <up|down|0-100>` — set the volume
- `/vibecode-fm:focus <on|off>` — on (default) pauses when it's your turn; off plays non-stop
- `/vibecode-fm:on` / `/vibecode-fm:off` — enable / disable the plugin
- `/vibecode-fm:help` — this screen

**Vibes** — chill, lofi, ambient, drone, metal, jazz, synthwave, retro, hacker, defcon, beats, hiphop, indie, rock, spy, vaporwave, space, glitch, tavern, goa, bossa, seventies, reggae, dubstep, lounge, folk

**Statusline env toggles** (settings.json `env`): `VIBECODE_MINIMAL=1` (icon + title only), `VIBECODE_SPRITES=0`, `VIBECODE_SPLASH=0`, `VIBECODE_VOLUME`, `VIBECODE_ADAPTIVE=0`.

Full docs: the project README.

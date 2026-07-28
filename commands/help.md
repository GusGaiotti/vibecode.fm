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
- `/vibecode-fm:minimal <on|off>` — status line shows only the track name (no sprites/phrase)
- `/vibecode-fm:on` / `/vibecode-fm:off` — enable / disable the plugin
- `/vibecode-fm:help` — this screen

**Vibes** — chill, ambient, metal, jazz, synthwave, hacker, beats, indie, spy, vaporwave, space, glitch, tavern, goa, bossa, seventies, reggae, dubstep, lounge, folk (synonyms like lofi, retro, defcon also work)

**Statusline env toggles** (settings.json `env`): `VIBECODE_MINIMAL=1` (icon + title only), `VIBECODE_SPRITES=0`, `VIBECODE_SPLASH=0`, `VIBECODE_VOLUME`.

Full docs: the project README.

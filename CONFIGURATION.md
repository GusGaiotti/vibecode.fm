# Configuration

vibecode.fm works with zero configuration. Everything below is optional.

## Commands

| Command | What it does |
|---|---|
| `/vibecode-fm:vibe` | DJ mode — Claude reads your session and picks the fitting station |
| `/vibecode-fm:radio <vibe>` | Jump to a specific station |
| `/vibecode-fm:next` | Skip to the next station in the carousel |
| `/vibecode-fm:volume <up\|down\|0-100>` | Set and persist the base volume |
| `/vibecode-fm:on` / `:off` | Enable / disable the plugin |

### Vibes for `radio`

`chill`, `lofi`, `ambient`, `drone`, `metal`, `jazz`, `synthwave`, `retro`,
`hacker`, `defcon`, `beats`, `hiphop`, `indie`, `rock`, `spy`, `vaporwave`,
`space`, `glitch`, `tavern`, `goa`, `bossa`, `seventies`, `reggae`, `dubstep`,
`lounge`, `folk`.

## Environment variables

| Variable | Default | Effect |
|---|---|---|
| `VIBECODE_VOLUME` | `70` | Base volume (0–100) when nothing was set via `/volume` |
| `VIBECODE_ADAPTIVE` | on | Set to `0` to keep a fixed volume instead of swelling with work intensity |
| `VIBECODE_SPRITES` | on | Set to `0` to drop the drifting icons in the statusline (keep the phrase) |
| `VIBECODE_SPLASH` | on | Set to `0` to drop the splash phrase (keep the icons) |
| `VIBECODE_SOURCE` | — | Override the audio source (a URL, file, or `.m3u`) |
| `VIBECODE_STATIONS` | `~/.vibecode-fm/stations.json` | Path to your custom stations file |
| `VIBECODE_IDLE_TIMEOUT` | `600` | Seconds with no activity before the watchdog stops an abandoned player (a long janitor, never a mid-work pause) |
| `VIBECODE_MPV_BIN` | `mpv` | Path to the mpv binary if it isn't on `PATH` |
| `VIBECODE_MPV_ARGS` | — | Extra flags passed to mpv (e.g. `--ao=pulse`) |
| `VIBECODE_DEBUG` | off | Set to `1` to log hook timing to `<state>/vibecode.log` |

The statusline toggles (`VIBECODE_SPRITES`, `VIBECODE_SPLASH`) go in the
`env` block of your Claude Code `settings.json` so the statusline process
inherits them.

## Custom stations

Create `~/.vibecode-fm/stations.json` (or point `VIBECODE_STATIONS` elsewhere).
Each entry is a plain URL, or an object with a friendly `label` and a `theme`
(a colour gradient plus statusline `sprites`):

```json
{
  "focus": "https://stream.example/focus.mp3",
  "night": {
    "url": "https://stream.example/night.mp3",
    "label": "Night Drive",
    "theme": {
      "stops": [
        { "p": 0.0, "c": [80, 80, 180] },
        { "p": 1.0, "c": [220, 220, 255] }
      ],
      "sprites": ["✦", "★", "·", "♪"]
    }
  }
}
```

Custom names win over the built-ins; a malformed entry is ignored rather than
breaking the plugin.

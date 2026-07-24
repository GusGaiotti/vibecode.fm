# vibecode.fm

> 🇧🇷 [Leia em português](README.pt-BR.md)

Music that plays while Claude Code works and pauses when it's your turn.

Your agent starts crunching — the music starts. It asks for permission or finishes
the task — the music stops. A ▶ / ❚❚ indicator in the status line tells you which
state you're in without looking up from your prompt.

<!-- TODO: demo.gif here — the music pausing exactly when Claude asks a question. -->

## How it works

The plugin wires [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks)
to a background [mpv](https://mpv.io) instance over its JSON IPC channel:

| Event | Action |
|---|---|
| You submit a prompt | play |
| Claude runs a tool | play |
| Claude asks for permission / input | pause |
| Claude finishes the turn | pause |
| Session ends | pause |

It's a single, zero-dependency Node script. Hooks never block the agent: every call
backgrounds its work and exits 0. If mpv isn't installed the plugin does nothing, silently.

## Requirements

- **Node.js 18+** (you already have it — Claude Code runs on Node)
- **[mpv](https://mpv.io)** on your `PATH`

```sh
# macOS
brew install mpv
# Debian / Ubuntu / Raspberry Pi OS
sudo apt install mpv
# Windows
winget install shinchiro.mpv
```

Runs on **Windows, macOS, Linux and WSL** — one codebase, verified on all three in CI.

## Install

In Claude Code:

```
/plugin marketplace add GusGaiotti/vibecode.fm
/plugin install vibecode-fm@vibecode-fm
```

Submit a prompt and the music starts.

## Status line

`node bin/vibecode.js status` prints `►`, `❚❚` or nothing; `... track` prints the
current title. Append them to your own status line, or use the ready-made example:
while the agent works it shows a full-width equalizer whose colour tracks how hard
Claude is working — green (light) → amber → orange → red (heavy); when it's your
turn it shows the track title. Point `settings.json` at it:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/plugins/marketplaces/vibecode-fm/examples/statusline.js"
  }
}
```

## Commands

- `/vibecode-fm:radio <vibe>` — switch station. Vibes: `chill`, `lofi`, `ambient`,
  `drone`, `metal`, `jazz`, `synthwave`, `retro`, `hacker`, `defcon`, `beats`,
  `hiphop`, `indie`, `rock` (curated [SomaFM](https://somafm.com) channels).
- `/vibecode-fm:on` — enable (playback resumes on the next agent event)
- `/vibecode-fm:off` — stop the player and keep it off until turned back on

Volume fades in and out on play/pause instead of cutting.

## Configuration

All optional, via environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `VIBECODE_SOURCE` | bundled playlist | Any file, URL or playlist mpv can open |
| `VIBECODE_VOLUME` | `70` | Initial volume (0–100) |
| `VIBECODE_MPV_BIN` | `mpv` | Path to the mpv binary, if it isn't on your `PATH` |
| `VIBECODE_MPV_ARGS` | _(none)_ | Extra mpv flags (e.g. `--ao=pulse` on WSL) |
| `VIBECODE_DEBUG` | _(off)_ | Log hook decisions and mpv output under the state dir |

The default playlist streams [SomaFM](https://somafm.com) (Groove Salad, Drone Zone,
DEF CON Radio) — listener-supported, so [consider donating](https://somafm.com/support/)
if it becomes your soundtrack. To use your own library instead:

```sh
export VIBECODE_SOURCE=~/music/focus/
```

## WSL

On WSL, mpv often defaults to a broken PipeWire output and plays silently. Force the
PulseAudio output WSLg provides:

```sh
echo 'export VIBECODE_MPV_ARGS="--ao=pulse"' >> ~/.bashrc
```

Windows and Linux hosts need none of this — it's a WSL quirk, not the plugin.

## Notes

- One player is shared across sessions: with several Claude Code sessions open, the
  last event wins. Closing a session pauses the music; `/vibecode-fm:off` stops it.
- Ctrl+C to interrupt a turn does not pause the music — Claude Code has no hook for
  interrupts, so playback resumes/pauses on the next real event.
- No sound? Check mpv plays the source on its own first:
  `mpv --no-video https://ice1.somafm.com/groovesalad-128-mp3`

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: `node --test` runs the suite against
a fake mpv, so no audio hardware is needed.

## License

[MIT](LICENSE)

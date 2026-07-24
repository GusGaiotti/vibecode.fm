# vibecode.fm

Music that plays while Claude Code works and pauses when it's your turn.

Your agent starts crunching — the music starts. It asks for permission or finishes
the task — the music stops. That's it. A ▶/⏸ icon in the status line tells you
which state you're in without looking up from your prompt.

## How it works

The plugin wires [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks)
to a background [mpv](https://mpv.io) instance over its JSON IPC socket:

| Event | Action |
|---|---|
| You submit a prompt | play |
| Claude runs a tool | play |
| Claude asks for permission / input | pause |
| Claude finishes the turn | pause |
| Session ends | pause |

Hooks never block the agent: every call backgrounds its work and exits 0 no matter
what. If mpv isn't installed the plugin does nothing, silently.

## Requirements

- Linux or macOS
- `mpv`
- `socat` (or `python3`, or a `nc` with unix socket support — first one found wins)

```sh
# debian/ubuntu/raspberry pi os
sudo apt install mpv socat
# macos
brew install mpv socat
```

## Install

In Claude Code:

```
/plugin marketplace add GusGaiotti/vibecode.fm
/plugin install vibecode-fm@vibecode-fm
```

Submit a prompt and the music starts.

## Status line

`scripts/vibecode.sh status` prints `▶`, `⏸` or nothing, and `scripts/vibecode.sh track`
prints the current stream title. Append them to your existing status line, or use the
ready-made example (icon + bouncing note + track title):

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/plugins/marketplaces/vibecode-fm/examples/statusline.sh"
  }
}
```

## Commands

- `/vibecode-fm:on` — enable and start playing
- `/vibecode-fm:off` — stop the player and keep it off until turned back on

## Configuration

Everything is optional, via environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `VIBECODE_SOURCE` | bundled playlist | Any file, URL or playlist mpv can open |
| `VIBECODE_VOLUME` | `70` | Initial volume (0-100) |
| `VIBECODE_MPV_ARGS` | _(none)_ | Extra flags appended to the mpv command (e.g. `--ao=pulse`) |
| `VIBECODE_STATE_DIR` | `$XDG_RUNTIME_DIR/vibecode-fm-<uid>` | Socket and state location |
| `VIBECODE_DEBUG` | _(off)_ | When set, logs hook decisions and mpv output under the state dir |

The default playlist streams [SomaFM](https://somafm.com) (Groove Salad, Drone Zone,
DEF CON Radio). SomaFM is listener-supported — if it becomes your soundtrack,
[throw them a donation](https://somafm.com/support/). To use your own library instead:

```sh
export VIBECODE_SOURCE=~/music/focus/
```

## WSL

On WSL, mpv often defaults to a broken PipeWire output and plays silently while
everything else looks fine. Force the PulseAudio output that WSLg provides:

```sh
echo 'export VIBECODE_MPV_ARGS="--ao=pulse"' >> ~/.bashrc
```

`PULSE_SERVER` is set by WSLg automatically. Verify audio works at all with:
`mpv --ao=pulse --no-video https://ice1.somafm.com/groovesalad-128-mp3`

## Notes

- One player is shared across sessions: if you run several Claude Code sessions,
  the last event wins. Closing one session pauses the music, it doesn't kill the
  player — `/vibecode-fm:off` does.
- No sound? Check that `mpv` can play the source on its own first:
  `mpv --no-video https://ice1.somafm.com/groovesalad-128-mp3`

## License

MIT

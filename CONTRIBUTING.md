# Contributing

Thanks for your interest in vibecode.fm.

## Development

No dependencies to install — the plugin is plain Node stdlib. The test suite runs the real
controller against a fake mpv (a local net server), so no audio hardware is needed:

```sh
node --test
```

To try it against real audio without installing the plugin, point the CLI at your mpv and
drive it by hand:

```sh
VIBECODE_MPV_BIN=/path/to/mpv node bin/vibecode.js play
node bin/vibecode.js pause
node bin/vibecode.js radio synthwave
```

Set `VIBECODE_DEBUG=1` (or drop a `debug` file in the state dir) to trace every event and
audio-state change in `<state>/vibecode.log`.

## Guidelines

- **Keep it dependency-free.** Only Node stdlib (`net`, `child_process`, `fs`, `os`, `path`).
- **Hooks must never break a session.** Always exit 0, never write to stdout except `status`
  and `track`, and keep work fast.
- **Add a test** for behaviour changes — the suite must stay green on Windows, macOS and Linux.
- Small commits, conventional messages.

## Reporting issues

Bug reports and station suggestions are welcome. For anything security-related, see
[SECURITY.md](SECURITY.md).

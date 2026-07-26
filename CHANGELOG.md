# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] — 2025-07-25

First public release.

### Added
- Music that plays while Claude Code works and pauses when it's your turn, driven by
  Claude Code hooks over mpv's JSON IPC.
- Themed status line: play/pause state, live track, per-station colour gradient, drifting
  sprites, and rotating splash phrases. `VIBECODE_MINIMAL`, `VIBECODE_SPRITES` and
  `VIBECODE_SPLASH` tune it down.
- 26 curated SomaFM vibes, each with its own colours, icons and phrases; user-defined
  stations via `~/.vibecode-fm/stations.json`.
- Commands: `/vibe` (DJ mode), `/radio`, `/next`, `/volume`, `/focus`, `/on`, `/off`,
  `/help`.
- Focus mode (`/focus off`) plays continuously; adaptive volume swells with how hard the
  agent is working; fades on every transition.
- Resilient streaming: transparent reconnects, a demuxer cache that hides brief drops, and
  a device-keep-alive flag so resume is instant.
- Zero runtime dependencies; Windows/macOS/Linux/WSL; test suite against a fake mpv, run on
  all three platforms in CI.

### Security
- Stream track titles (untrusted metadata) are stripped of control/escape characters before
  reaching the terminal.

# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0]

### Added
- `/statusline on|off` — sets up (or removes) the themed status line by editing `settings.json`
  for you, so there's no manual config step. Malformed settings are left untouched.
- `/debug on|off` — toggles the event/audio trace log from within Claude Code.

### Changed
- Permission prompts now pause the music (and resume when you answer); any attention pauses.
- The watchdog now quits the background mpv when a session is abandoned instead of leaving it
  muted; the next tool run brings it back.

## [0.6.0] — 2025-07-25

First public release.

### Added
- Music that plays while Claude Code works and pauses when it's your turn, driven by
  Claude Code hooks over mpv's JSON IPC.
- Themed status line: play/pause state, live track, per-station colour gradient, drifting
  sprites, and rotating splash phrases. `VIBECODE_MINIMAL`, `VIBECODE_SPRITES` and
  `VIBECODE_SPLASH` tune it down.
- 20 curated SomaFM stations, each with its own colours, icons and phrases (plus name
  synonyms); user-defined stations via `~/.vibecode-fm/stations.json`.
- Commands: `/vibe` (DJ mode), `/radio`, `/next`, `/volume`, `/focus`, `/on`, `/off`, `/help`.
- Focus mode (`/focus off`) plays continuously; smooth volume fades on every transition.
- Resilient streaming: transparent reconnects, a demuxer cache that hides brief drops, and
  a device-keep-alive flag so resume is instant.
- Self-contained native binary written in Rust — no runtime or interpreter required, one
  `serde_json` dependency. Windows/macOS/Linux/WSL; `cargo fmt`, `clippy` and the test suite
  run on all three platforms in CI.

### Security
- Stream track titles (untrusted metadata) are stripped of control/escape characters before
  reaching the terminal.

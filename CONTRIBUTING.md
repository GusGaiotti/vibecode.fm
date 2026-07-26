# Contributing

Thanks for your interest in vibecode.fm.

## Development

You need a [Rust toolchain](https://rustup.rs). The only dependency is `serde_json`. The test
suite exercises the controller logic directly, so no audio hardware is needed:

```sh
cargo test
cargo fmt --check
cargo clippy -- -D warnings
cargo build --release
```

To try it against real audio, build and drive the binary by hand:

```sh
VIBECODE_MPV_BIN=/path/to/mpv ./target/release/vibecode-fm play
./target/release/vibecode-fm pause
./target/release/vibecode-fm radio synthwave
```

Set `VIBECODE_DEBUG=1` (or drop a `debug` file in the state dir) to trace every event and
audio-state change in `<state>/vibecode.log`.

## Guidelines

- **Keep dependencies minimal.** Only `serde_json` and the Rust std library.
- **Hooks must never break a session.** Always exit 0, never write to stdout except `status`
  and `track`, and keep work fast.
- **Add a test** for behaviour changes — the suite must stay green on Windows, macOS and Linux.
- **Keep it clean:** `cargo fmt` and `cargo clippy -- -D warnings` must pass.
- Small commits, conventional messages.

## Reporting issues

Bug reports and station suggestions are welcome. For anything security-related, see
[SECURITY.md](SECURITY.md).

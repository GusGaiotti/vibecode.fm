# Security

## Reporting a vulnerability

Please open a private security advisory on GitHub, or email the maintainer, rather than
filing a public issue. You'll get a response within a few days.

## Security posture

vibecode.fm is a local audio plugin with a deliberately small attack surface:

- **One dependency** — `serde_json` for parsing mpv's IPC replies; everything else is the
  Rust standard library, so the supply chain is tiny.
- **No network listeners, no credentials, no telemetry, no dynamic code loading.**
- **Memory-safe** — the binary is safe Rust with no `unsafe` blocks.
- **IPC is local only** — a Unix socket (or Windows named pipe) namespaced per user in the
  runtime/temp directory. It is never exposed to the network.
- **Processes are spawned with argument arrays, never a shell string**, so there's no shell
  injection when launching mpv or the watchdog.
- **Hooks are fixed commands.** Claude Code invokes `bin/vibecode-fm <action> <event>` with
  constant strings from `hooks.json` — no user input reaches the dispatch.
- **Untrusted stream metadata is sanitized.** Track titles coming from the radio stream have
  control and escape characters stripped before they reach the terminal, preventing ANSI
  injection into your prompt.
- **All state lives in a per-user temp directory** (flags, logs, chosen station). No secrets
  are written.

## Notes for the security-conscious

- The `/radio`, `/volume` and `/focus` commands pass their argument through the shell. The
  value is only ever used as a dictionary key, an integer, or a flag-file name — it is never
  evaluated — but as with any slash command, it runs in your own shell.
- mpv plays whatever URL/file you configure (`VIBECODE_SOURCE`, custom stations). Point it
  only at sources you trust; mpv loads media, it does not execute it.
- mpv's JSON IPC has no authentication (by design). On a shared machine another local user
  who knows the pipe/socket name could send it playback commands. This only controls music.

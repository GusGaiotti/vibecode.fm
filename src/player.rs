use crate::ipc;
use crate::log::log;
use crate::paths;
use std::env;
use std::fs;
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, SystemTime};

fn mpv_bin() -> String {
    env::var("VIBECODE_MPV_BIN").unwrap_or_else(|_| "mpv".into())
}

pub fn alive() -> bool {
    ipc::send(&serde_json::json!({ "command": ["get_property", "mpv-version"] }))
        .and_then(|r| {
            r.get("error")
                .and_then(|e| e.as_str())
                .map(|s| s == "success")
        })
        .unwrap_or(false)
}

fn wait_alive() -> bool {
    for i in 0..30 {
        if alive() {
            log(&format!("  wait_alive: socket up after {}ms", i * 100));
            return true;
        }
        sleep(Duration::from_millis(100));
    }
    log("  wait_alive: TIMED OUT after 3000ms");
    false
}

fn build_args(source: &str, volume: i64) -> Vec<String> {
    let mut args: Vec<String> = [
        "--no-video",
        "--no-terminal",
        "--really-quiet",
        "--idle=yes",
        "--keep-open=yes",
        "--loop-playlist=inf",
        "--network-timeout=15",
        "--stream-lavf-o=reconnect=1,reconnect_at_eof=1,reconnect_streamed=1,reconnect_on_network_error=1,reconnect_delay_max=2",
        "--cache=yes",
        "--demuxer-max-bytes=1MiB",
        "--demuxer-readahead-secs=20",
        "--audio-stream-silence=yes",
        "--audio-wait-open=1",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    args.push(format!("--volume={volume}"));
    args.push("--pause".into());
    args.push(format!("--input-ipc-server={}", paths::ipc_path()));
    if paths::debug_enabled() {
        args.push(format!("--log-file={}", paths::mpv_log_file().display()));
        args.push("--msg-level=all=status".into());
    }
    if let Ok(extra) = env::var("VIBECODE_MPV_ARGS") {
        for flag in extra.split_whitespace() {
            args.push(flag.to_string());
        }
    }
    args.push(source.to_string());
    args
}

#[cfg(windows)]
pub fn spawn_detached(cmd: &mut Command) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0008); // DETACHED_PROCESS | CREATE_NO_WINDOW
    cmd.spawn().map(|_| ())
}

#[cfg(unix)]
pub fn spawn_detached(cmd: &mut Command) -> std::io::Result<()> {
    use std::os::unix::process::CommandExt;
    cmd.process_group(0);
    cmd.spawn().map(|_| ())
}

pub fn start(source: &str, volume: i64) -> bool {
    let lock = paths::state_dir().join("starting");
    if let Ok(meta) = fs::metadata(&lock) {
        if let Ok(modified) = meta.modified() {
            if SystemTime::now()
                .duration_since(modified)
                .is_ok_and(|d| d.as_secs() < 10)
            {
                return wait_alive();
            }
        }
    }
    let _ = fs::create_dir_all(paths::state_dir());
    let _ = fs::write(&lock, std::process::id().to_string());

    #[cfg(unix)]
    let _ = fs::remove_file(paths::ipc_path());

    log(&format!(
        "  start: spawning mpv ({}) source={}",
        mpv_bin(),
        source
    ));
    let mut cmd = Command::new(mpv_bin());
    cmd.args(build_args(source, volume))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let ok = spawn_detached(&mut cmd).is_ok();
    let result = if ok { wait_alive() } else { false };
    let _ = fs::remove_file(&lock);
    result
}

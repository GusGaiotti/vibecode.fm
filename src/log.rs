use crate::ipc;
use crate::paths;
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

fn stamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    format!(
        "{:02}:{:02}:{:02}.{:03}",
        (secs / 3600) % 24,
        (secs / 60) % 60,
        secs % 60,
        now.subsec_millis()
    )
}

pub fn log(message: &str) {
    if !paths::debug_enabled() {
        return;
    }
    let _ = fs::create_dir_all(paths::state_dir());
    let event = env::var("VIBECODE_EVENT").unwrap_or_else(|_| "-".into());
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(paths::log_file())
    {
        let _ = writeln!(f, "{} [{}] {}", stamp(), event, message);
    }
}

pub fn log_audio(message: &str) {
    if !paths::debug_enabled() {
        return;
    }
    let mute = ipc::get_prop("mute");
    let pause = ipc::get_prop("pause");
    let idle = ipc::get_prop("core-idle");
    log(&format!(
        "{message} | audio mute={mute:?} pause={pause:?} core-idle={idle:?}"
    ));
}

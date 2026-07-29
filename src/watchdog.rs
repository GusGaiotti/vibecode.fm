use crate::controller;
use crate::log::log;
use crate::paths;
use std::env;
use std::fs;
use std::thread::sleep;
use std::time::Duration;

const TICK_MS: u64 = 30000;

fn idle_timeout_ms() -> i64 {
    let secs = env::var("VIBECODE_IDLE_TIMEOUT")
        .ok()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);
    (if secs > 0 { secs } else { 600 }) * 1000
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn run() {
    log(&format!("started (timeout {}s)", idle_timeout_ms() / 1000));
    loop {
        let _ = fs::create_dir_all(paths::state_dir());
        let _ = fs::write(paths::watchdog_file(), std::process::id().to_string());
        sleep(Duration::from_millis(TICK_MS));
        if controller::status().is_empty() {
            log("player gone, exiting");
            break;
        }
        let idle = now_ms() - controller::last_activity_ms();
        if idle >= idle_timeout_ms() {
            log(&format!("abandoned {}s, quitting mpv", idle / 1000));
            controller::quit_player();
            break;
        }
    }
    let _ = fs::remove_file(paths::watchdog_file());
}

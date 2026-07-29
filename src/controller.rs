use crate::ipc;
use crate::log::{log, log_audio};
use crate::paths;
use crate::player;
use crate::stations::{self, Theme};
use serde_json::json;
use std::env;
use std::fs;
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const FADE_MS: u64 = 180;
const FADE_STEPS: i64 = 6;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn action_token() -> i64 {
    env::var("VIBECODE_TOKEN")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(now_ms)
}

fn latest_token() -> i64 {
    fs::read_to_string(paths::intent_file())
        .ok()
        .and_then(|s| s.trim().split(' ').next().and_then(|t| t.parse().ok()))
        .unwrap_or(0)
}

fn record_intent(token: i64, action: &str) {
    if token < latest_token() {
        return;
    }
    let _ = fs::create_dir_all(paths::state_dir());
    let _ = fs::write(paths::intent_file(), format!("{token} {action}"));
}

fn superseded(token: i64) -> bool {
    latest_token() > token
}

fn is_disabled() -> bool {
    paths::disabled_flag().exists()
}

fn focus_on() -> bool {
    !paths::no_focus_flag().exists()
}

fn volume() -> i64 {
    if let Ok(s) = fs::read_to_string(paths::volume_file()) {
        if let Ok(v) = s.trim().parse::<i64>() {
            return v;
        }
    }
    env::var("VIBECODE_VOLUME")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(70)
}

fn source() -> String {
    if let Ok(s) = env::var("VIBECODE_SOURCE") {
        return s;
    }
    if let Ok(s) = fs::read_to_string(paths::station_file()) {
        let t = s.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    paths::default_source()
}

fn is_halted() -> Option<bool> {
    let pause = ipc::get_prop("pause")?;
    if pause.as_bool() == Some(true) {
        return Some(true);
    }
    Some(ipc::get_prop("mute").and_then(|m| m.as_bool()) == Some(true))
}

fn fade(from: i64, to: i64, guard: Option<i64>) -> bool {
    for i in 1..=FADE_STEPS {
        if let Some(g) = guard {
            if superseded(g) {
                return false;
            }
        }
        let v = (from as f64 + (to - from) as f64 * i as f64 / FADE_STEPS as f64).round() as i64;
        ipc::set_prop("volume", json!(v));
        sleep(Duration::from_millis(FADE_MS / FADE_STEPS as u64));
    }
    true
}

fn fade_to(target: i64) {
    fade(0, target, None);
}

fn record_activity() {
    let _ = fs::create_dir_all(paths::state_dir());
    let _ = fs::write(paths::activity_file(), now_ms().to_string());
}

pub fn last_activity_ms() -> i64 {
    fs::read_to_string(paths::activity_file())
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0)
}

fn ensure_watchdog() {
    if env::var("VIBECODE_NO_WATCHDOG").is_ok() {
        return;
    }
    if let Ok(meta) = fs::metadata(paths::watchdog_file()) {
        if let Ok(modified) = meta.modified() {
            if SystemTime::now()
                .duration_since(modified)
                .is_ok_and(|d| d.as_secs() < 45)
            {
                return;
            }
        }
    }
    let exe = match env::current_exe() {
        Ok(e) => e,
        Err(_) => return,
    };
    let mut cmd = Command::new(exe);
    cmd.arg("watchdog");
    cmd.env_remove("VIBECODE_TOKEN")
        .env_remove("VIBECODE_EVENT");
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let _ = player::spawn_detached(&mut cmd);
    log("watchdog: spawned");
}

pub fn play() {
    let token = action_token();
    log_audio(&format!("PLAY start token={token}"));
    if is_disabled() {
        log("PLAY skip: disabled flag set");
        return;
    }
    record_intent(token, "play");
    let t0 = now_ms();
    record_activity();
    let mut was_halted = true;
    if player::alive() {
        was_halted = is_halted() != Some(false);
    } else if !player::start(&source(), volume()) {
        return;
    }
    if superseded(token) {
        log("play: superseded by a newer event, not resuming");
        return;
    }
    if was_halted {
        let target = volume();
        ipc::set_prop("mute", json!(false));
        ipc::set_prop("pause", json!(false));
        let warm = ipc::get_prop("demuxer-cache-time")
            .and_then(|v| v.as_f64())
            .map(|c| c > 1.0)
            .unwrap_or(false);
        if !warm {
            ipc::command(json!(["loadfile", source()]));
            ipc::set_prop("mute", json!(false));
            ipc::set_prop("pause", json!(false));
        }
        if !fade((target as f64 / 2.0).round() as i64, target, Some(token)) {
            ipc::set_prop("mute", json!(true));
        }
    }
    log_audio(&format!("PLAY done in {}ms", now_ms() - t0));
    ensure_watchdog();
}

pub fn pause() {
    let token = action_token();
    let t0 = now_ms();
    log_audio(&format!("PAUSE start token={token}"));
    if !focus_on() {
        log("PAUSE skip: focus mode off");
        return;
    }
    record_intent(token, "pause");
    if !player::alive() {
        log("PAUSE skip: no live player");
        return;
    }
    ipc::set_prop("mute", json!(true));
    log_audio(&format!("PAUSE done in {}ms", now_ms() - t0));
    ensure_watchdog();
}

pub fn quit_player() {
    if player::alive() {
        ipc::command(json!(["quit"]));
    }
    #[cfg(unix)]
    let _ = fs::remove_file(paths::ipc_path());
}

fn current_station() -> Option<String> {
    fs::read_to_string(paths::station_file())
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn apply_station(url: &str) {
    let _ = fs::create_dir_all(paths::state_dir());
    let _ = fs::write(paths::station_file(), url);
    record_activity();
    if player::alive() {
        ipc::command(json!(["loadfile", url]));
        ipc::set_prop("volume", json!(0));
        ipc::set_prop("mute", json!(false));
        ipc::set_prop("pause", json!(false));
        fade_to(volume());
    } else {
        player::start(url, volume());
        ipc::set_prop("mute", json!(false));
        ipc::set_prop("pause", json!(false));
    }
    ensure_watchdog();
}

pub fn radio(vibe: Option<&str>) {
    if let Some(url) = vibe.and_then(stations::resolve) {
        apply_station(&url);
    }
}

pub fn next() {
    if let Some(url) = stations::next_station(current_station().as_deref()) {
        apply_station(&url);
    }
}

pub fn set_volume(arg: Option<&str>) {
    let base = volume();
    let v = match arg {
        Some("up") => base + 10,
        Some("down") => base - 10,
        Some(n) => match n.parse::<i64>() {
            Ok(x) => x,
            Err(_) => return,
        },
        None => return,
    }
    .clamp(0, 100);
    let _ = fs::create_dir_all(paths::state_dir());
    let _ = fs::write(paths::volume_file(), v.to_string());
    if player::alive() {
        ipc::set_prop("volume", json!(v));
    }
    log(&format!("volume: {v}"));
}

pub fn focus(arg: Option<&str>) {
    let _ = fs::create_dir_all(paths::state_dir());
    if arg == Some("off") {
        let _ = fs::write(paths::no_focus_flag(), "");
        log("focus: off");
        play();
    } else {
        let _ = fs::remove_file(paths::no_focus_flag());
        log("focus: on");
    }
}

pub fn minimal(arg: Option<&str>) {
    let _ = fs::create_dir_all(paths::state_dir());
    let on = match arg {
        Some("on") => true,
        Some("off") => false,
        _ => !paths::minimal_flag().exists(),
    };
    if on {
        let _ = fs::write(paths::minimal_flag(), "");
        log("minimal: on");
    } else {
        let _ = fs::remove_file(paths::minimal_flag());
        log("minimal: off");
    }
}

pub fn minimal_active() -> bool {
    paths::minimal_flag().exists()
}

pub fn status() -> String {
    if is_disabled() {
        return String::new();
    }
    match is_halted() {
        None => String::new(),
        Some(true) => "❚❚".into(),
        Some(false) => "►".into(),
    }
}

fn sanitize_title(data: &str) -> String {
    let cleaned: String = data
        .chars()
        .filter(|c| !c.is_control() && *c != '\u{9b}')
        .collect();
    cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(48)
        .collect()
}

pub fn track() -> String {
    if is_disabled() {
        return String::new();
    }
    match ipc::get_prop("media-title").and_then(|v| v.as_str().map(String::from)) {
        Some(s) if !s.is_empty() => sanitize_title(&s),
        _ => String::new(),
    }
}

pub fn station_label() -> Option<String> {
    stations::label(&current_station()?)
}

pub fn station_theme() -> Option<Theme> {
    stations::theme(&current_station()?)
}

pub fn on() {
    log("action=on");
    let _ = fs::remove_file(paths::disabled_flag());
}

pub fn off() {
    log("action=off");
    quit_player();
    let _ = fs::create_dir_all(paths::state_dir());
    let _ = fs::write(paths::disabled_flag(), "");
}

pub fn debug(arg: Option<&str>) {
    let _ = fs::create_dir_all(paths::state_dir());
    if arg == Some("off") {
        let _ = fs::remove_file(paths::debug_flag());
    } else {
        let _ = fs::write(paths::debug_flag(), "");
    }
}

pub fn setup_statusline(arg: Option<&str>) {
    let path = paths::settings_file();
    let mut root: serde_json::Value = match fs::read_to_string(&path) {
        Ok(s) => match serde_json::from_str(&s) {
            Ok(v) => v,
            Err(_) => {
                eprintln!("settings.json is not valid JSON; leaving it untouched");
                return;
            }
        },
        Err(_) => serde_json::json!({}),
    };
    let Some(obj) = root.as_object_mut() else {
        return;
    };
    if arg == Some("off") {
        obj.remove("statusLine");
    } else {
        let exe = env::current_exe()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "vibecode-fm".into());
        obj.insert(
            "statusLine".into(),
            json!({ "type": "command", "command": format!("\"{exe}\" statusline") }),
        );
    }
    if let Ok(pretty) = serde_json::to_string_pretty(&root) {
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let tmp = path.with_extension("json.tmp");
        if fs::write(&tmp, pretty).is_ok() {
            let _ = fs::rename(&tmp, &path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_control_and_escape_chars() {
        let out = sanitize_title("Evil\x1b[31m\x07\x00 Song");
        assert!(!out.chars().any(|c| c.is_control()));
        assert_eq!(out, "Evil[31m Song");
    }
}

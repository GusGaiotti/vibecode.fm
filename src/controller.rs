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
const ACTIVITY_WINDOW_MS: i64 = 8000;
const ACTIVITY_MAX: f64 = 6.0;
const ADAPTIVE_SPREAD: f64 = 15.0;

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

pub fn adaptive_volume(base: i64, level: f64) -> i64 {
    let v = (base as f64 - ADAPTIVE_SPREAD + 2.0 * ADAPTIVE_SPREAD * level).round() as i64;
    v.clamp(0, 100)
}

fn adaptive_enabled() -> bool {
    let v = env::var("VIBECODE_ADAPTIVE")
        .unwrap_or_default()
        .to_lowercase();
    !matches!(v.as_str(), "0" | "false" | "off" | "no")
}

fn target_volume() -> i64 {
    let base = volume();
    if !adaptive_enabled() {
        base
    } else {
        adaptive_volume(base, activity_level())
    }
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

fn fade_out() {
    if let Some(cur) = ipc::get_prop("volume").and_then(|v| v.as_f64()) {
        if cur > 0.0 {
            fade(cur as i64, 0, None);
        }
    }
}

fn record_activity() {
    let _ = fs::create_dir_all(paths::state_dir());
    let now = now_ms();
    let mut stamps: Vec<i64> = fs::read_to_string(paths::activity_file())
        .unwrap_or_default()
        .lines()
        .filter_map(|l| l.parse::<i64>().ok())
        .filter(|t| now - t < ACTIVITY_WINDOW_MS)
        .collect();
    stamps.push(now);
    let text = stamps
        .iter()
        .map(|t| t.to_string())
        .collect::<Vec<_>>()
        .join("\n");
    let _ = fs::write(paths::activity_file(), text);
}

pub fn activity_level() -> f64 {
    let now = now_ms();
    let count = fs::read_to_string(paths::activity_file())
        .unwrap_or_default()
        .lines()
        .filter_map(|l| l.parse::<i64>().ok())
        .filter(|t| now - t < ACTIVITY_WINDOW_MS)
        .count() as f64;
    (count / ACTIVITY_MAX).min(1.0)
}

pub fn last_activity_ms() -> i64 {
    fs::read_to_string(paths::activity_file())
        .unwrap_or_default()
        .lines()
        .filter_map(|l| l.parse::<i64>().ok())
        .max()
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
                .map(|d| d.as_secs() < 45)
                .unwrap_or(false)
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
    let _ = spawn_detached(&mut cmd);
    log("watchdog: spawned");
}

#[cfg(windows)]
fn spawn_detached(cmd: &mut Command) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0008);
    cmd.spawn().map(|_| ())
}

#[cfg(unix)]
fn spawn_detached(cmd: &mut Command) -> std::io::Result<()> {
    use std::os::unix::process::CommandExt;
    cmd.process_group(0);
    cmd.spawn().map(|_| ())
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
        let target = target_volume();
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
    } else if adaptive_enabled() {
        ipc::set_prop("volume", json!(target_volume()));
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

pub fn hard_pause() {
    if !player::alive() {
        return;
    }
    if is_halted() == Some(false) {
        fade_out();
    }
    ipc::set_prop("mute", json!(true));
    ipc::set_prop("pause", json!(true));
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
        fade_to(target_volume());
    } else {
        player::start(url, target_volume());
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

pub fn dance() -> String {
    let crews = [
        ["ヽ(⌐■_■)ノ♪", "♪ヽ(■_■⌐)ノ", "ヽ(⌐■_■)ノ♬"],
        ["♪┏(・o・)┛", "┗(・o・)┓♪", "♪┏(・o・)┛"],
        ["(♪)┏(＾0＾)┛", "┗(＾0＾)┓(♫)", "(♬)┏(＾0＾)┛"],
        ["⟨♪⟩ ᕕ( ᐛ )ᕗ", "ᕕ( ᐛ )ᕗ ⟨♫⟩", "⟨♬⟩ ᕕ( ᐛ )ᕗ"],
    ];
    let idx = (now_ms() as usize / 7) % crews.len();
    let label = station_label().unwrap_or_else(|| "vibecode.fm".into());
    format!(
        "\n   {}\n\n   dancing to {label} — keep coding ♪\n",
        crews[idx].join("   ")
    )
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adaptive_volume_scales_and_clamps() {
        assert_eq!(adaptive_volume(70, 0.0), 55);
        assert_eq!(adaptive_volume(70, 0.5), 70);
        assert_eq!(adaptive_volume(70, 1.0), 85);
        assert_eq!(adaptive_volume(95, 1.0), 100);
        assert_eq!(adaptive_volume(10, 0.0), 0);
    }

    #[test]
    fn sanitize_strips_control_and_escape_chars() {
        let out = sanitize_title("Evil\x1b[31m\x07\x00 Song");
        assert!(!out.chars().any(|c| c.is_control()));
        assert_eq!(out, "Evil[31m Song");
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
    if player::alive() {
        ipc::command(json!(["quit"]));
    }
    #[cfg(unix)]
    let _ = fs::remove_file(paths::ipc_path());
    let _ = fs::create_dir_all(paths::state_dir());
    let _ = fs::write(paths::disabled_flag(), "");
}

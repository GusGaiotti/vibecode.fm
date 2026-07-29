use std::env;
use std::path::PathBuf;

pub fn user_id() -> String {
    env::var("USER")
        .or_else(|_| env::var("USERNAME"))
        .unwrap_or_else(|_| "user".into())
}

pub fn state_dir() -> PathBuf {
    if let Ok(d) = env::var("VIBECODE_STATE_DIR") {
        return PathBuf::from(d);
    }
    let base = env::var("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| env::temp_dir());
    base.join(format!("vibecode-fm-{}", user_id()))
}

pub fn ipc_path() -> String {
    if let Ok(p) = env::var("VIBECODE_IPC_PATH") {
        return p;
    }
    if cfg!(windows) {
        format!(r"\\.\pipe\vibecode-fm-{}", user_id())
    } else {
        state_dir().join("mpv.sock").to_string_lossy().into_owned()
    }
}

pub fn disabled_flag() -> PathBuf {
    state_dir().join("disabled")
}

pub fn no_focus_flag() -> PathBuf {
    state_dir().join("nofocus")
}

pub fn minimal_flag() -> PathBuf {
    state_dir().join("minimal")
}

pub fn station_file() -> PathBuf {
    state_dir().join("station")
}

pub fn volume_file() -> PathBuf {
    state_dir().join("volume")
}

pub fn intent_file() -> PathBuf {
    state_dir().join("intent")
}

pub fn activity_file() -> PathBuf {
    state_dir().join("activity")
}

pub fn watchdog_file() -> PathBuf {
    state_dir().join("watchdog")
}

pub fn mpv_log_file() -> PathBuf {
    state_dir().join("mpv.log")
}

pub fn log_file() -> PathBuf {
    env::var("VIBECODE_LOG")
        .map(PathBuf::from)
        .unwrap_or_else(|_| state_dir().join("vibecode.log"))
}

pub fn debug_flag() -> PathBuf {
    state_dir().join("debug")
}

pub fn debug_enabled() -> bool {
    env::var("VIBECODE_DEBUG").is_ok() || debug_flag().exists()
}

pub fn settings_file() -> PathBuf {
    let home = env::var("HOME")
        .or_else(|_| env::var("USERPROFILE"))
        .unwrap_or_default();
    PathBuf::from(home).join(".claude").join("settings.json")
}

pub fn default_source() -> String {
    if let Ok(exe) = env::current_exe() {
        if let Some(root) = exe.parent().and_then(|b| b.parent()) {
            return root
                .join("playlists")
                .join("default.m3u")
                .to_string_lossy()
                .into_owned();
        }
    }
    "playlists/default.m3u".into()
}

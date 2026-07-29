#![forbid(unsafe_code)]

mod controller;
mod ipc;
mod log;
mod paths;
mod player;
mod stations;
mod statusline;
mod watchdog;

use std::env;
use std::io::Write;

fn main() {
    let args: Vec<String> = env::args().collect();
    let action = args.get(1).map(String::as_str).unwrap_or("");
    let arg = args.get(2).map(String::as_str);

    if let Some(event) = arg {
        if matches!(action, "play" | "pause") {
            env::set_var("VIBECODE_EVENT", event);
        }
    }
    if env::var("VIBECODE_TOKEN").is_err() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        env::set_var("VIBECODE_TOKEN", now.to_string());
    }

    match action {
        "play" => controller::play(),
        "pause" => controller::pause(),
        "status" => print!("{}", controller::status()),
        "track" => print!("{}", controller::track()),
        "radio" => controller::radio(arg),
        "next" => controller::next(),
        "volume" => controller::set_volume(arg),
        "focus" => controller::focus(arg),
        "minimal" => controller::minimal(arg),
        "on" => controller::on(),
        "off" => controller::off(),
        "debug" => controller::debug(arg),
        "setup-statusline" => controller::setup_statusline(arg),
        "watchdog" => watchdog::run(),
        "statusline" => statusline::render(),
        "segment" => statusline::segment(),
        _ => {}
    }
    let _ = std::io::stdout().flush();
}

use crate::controller;
use crate::stations::Theme;
use serde_json::Value;
use std::env;
use std::io::Read;
use std::time::{SystemTime, UNIX_EPOCH};

const RESET: &str = "\x1b[0m";
const BOLD: &str = "\x1b[1m";

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64
}

fn fg(c: [u8; 3]) -> String {
    format!("\x1b[38;2;{};{};{}m", c[0], c[1], c[2])
}

fn paint(s: &str, c: [u8; 3], bold: bool) -> String {
    format!("{}{}{s}{RESET}", if bold { BOLD } else { "" }, fg(c))
}

fn env_off(name: &str) -> bool {
    matches!(
        env::var(name).unwrap_or_default().to_lowercase().as_str(),
        "0" | "false" | "off" | "no"
    )
}

fn env_on(name: &str) -> bool {
    matches!(
        env::var(name).unwrap_or_default().to_lowercase().as_str(),
        "1" | "true" | "on" | "yes"
    )
}

fn sprites_enabled() -> bool {
    !env_on("VIBECODE_MINIMAL") && !env_off("VIBECODE_SPRITES")
}

fn splash_enabled() -> bool {
    !env_on("VIBECODE_MINIMAL") && !env_off("VIBECODE_SPLASH")
}

fn default_theme() -> Theme {
    Theme {
        tag: "chill".into(),
        stops: vec![
            (0.0, [80, 210, 170]),
            (0.5, [130, 205, 120]),
            (1.0, [240, 200, 95]),
        ],
        sprites: ["❀", "♪", "✿", "♫", "❁", "♬", "♩", "✧"]
            .iter()
            .map(|s| s.to_string())
            .collect(),
    }
}

fn gradient_color(stops: &[(f64, [u8; 3])], t: f64) -> [u8; 3] {
    let x = ((t % 1.0) + 1.0) % 1.0;
    for i in 1..stops.len() {
        if x <= stops[i].0 {
            let (ap, ac) = stops[i - 1];
            let (bp, bc) = stops[i];
            let k = (x - ap) / (bp - ap);
            return [
                (ac[0] as f64 + (bc[0] as f64 - ac[0] as f64) * k).round() as u8,
                (ac[1] as f64 + (bc[1] as f64 - ac[1] as f64) * k).round() as u8,
                (ac[2] as f64 + (bc[2] as f64 - ac[2] as f64) * k).round() as u8,
            ];
        }
    }
    stops.last().map(|s| s.1).unwrap_or([200, 200, 200])
}

fn gradient_text(text: &str, stops: &[(f64, [u8; 3])], animate: bool) -> String {
    let drift = if animate { now_ms() / 2200.0 } else { 0.0 };
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    let mut out = String::from(BOLD);
    for (i, ch) in chars.iter().enumerate() {
        let frac = if n > 1 {
            i as f64 / (n - 1) as f64
        } else {
            0.0
        };
        let c = gradient_color(stops, frac * 0.85 + drift);
        out.push_str(&fg(c));
        out.push(*ch);
    }
    out.push_str(RESET);
    out
}

fn phrases(tag: &str) -> Vec<&'static str> {
    match tag {
        "chill" => vec![
            "Compiling good vibes...",
            "Refactoring my feelings",
            "Lo-fi, high standards",
            "Merge conflicts of the heart",
            "while (alive) relax();",
            "git commit -m \"vibes\"",
        ],
        "hacker" => vec![
            "sudo make me a sandwich",
            "There's no place like 127.0.0.1",
            "It's not a bug, it's a 0-day",
            "chmod 777 your dreams",
            "The cake is a lie, root is real",
            "rm -rf /doubt",
        ],
        "synthwave" => vec![
            "Ride or die, mostly ride",
            "The future is retro",
            "Neon never dies",
            "Outrun your deadlines",
            "1985 called, it approves",
        ],
        "metal" => vec![
            "Segfault of the ancients",
            "Stack overflow of the damned",
            "kill -9 the weak",
            "Riff-driven development",
            "Compile in fire",
        ],
        "jazz" => vec![
            "Improvise your architecture",
            "Syncopated semicolons",
            "Cool as a nil pointer",
            "Blue notes, green builds",
        ],
        "vaporwave" => vec![
            "A E S T H E T I C undefined",
            "Nostalgia.exe has stopped",
            "Buy nothing, feel everything",
            "Vibes from a dead future",
        ],
        "space" => vec![
            "In space no one hears your typos",
            "Floating point in the void",
            "Lost in the async",
            "A cosmic ray flipped my bit",
        ],
        "glitch" => vec![
            "It's not a bug it's ▓ejfk",
            "Reality buffer underrun",
            "01100110 feelings",
            "Corrupt but honest",
        ],
        "tavern" => vec![
            "Roll for initiative",
            "A bard walks into a repo",
            "Quest: fix the merge",
            "Ye olde stack trace",
        ],
        "goa" => vec![
            "Consciousness not found (404)",
            "Trance-pile the universe",
            "Ego death, clean build",
            "One with the async",
        ],
        "beats" => vec![
            "Drop the bass, not the table",
            "Flow state, git rebase",
            "Bars over var",
        ],
        "indie" => vec![
            "You wouldn't get this build",
            "Twee-driven development",
            "Heartfelt and hardcoded",
        ],
        "spy" => vec![
            "This splash will self-destruct",
            "Shaken, not stack-traced",
            "License to kill -9",
            "The name's Null. Pointer Null.",
        ],
        _ => vec![],
    }
}

const UNIVERSAL: &[&str] = &[
    "I refactor, therefore I am",
    "To be, or not to be null",
    "Cogito ergo sum(array)",
    "This too shall pass tests",
    "The unexamined loop is not worth running",
];

fn pick_phrase(theme: &Theme) -> String {
    let mut pool = phrases(&theme.tag);
    pool.extend_from_slice(UNIVERSAL);
    if pool.is_empty() {
        return String::new();
    }
    let i = (now_ms() / 9000.0) as usize % pool.len();
    pool[i].to_string()
}

fn sprite_run(cols: i64, intensity: f64, theme: &Theme, moving: bool, phase: i64) -> String {
    if cols <= 0 {
        return String::new();
    }
    let dflt = default_theme();
    let sprites = if theme.sprites.is_empty() {
        &dflt.sprites
    } else {
        &theme.sprites
    };
    let stops = if theme.stops.is_empty() {
        &dflt.stops
    } else {
        &theme.stops
    };
    let gap = if moving {
        (3 - (intensity * 2.0).round() as i64).max(1)
    } else {
        3
    };
    let period = gap + 1;
    let speed = 3.0 + intensity * 12.0;
    let offset = (if moving {
        (now_ms() / 1000.0 * speed).floor() as i64
    } else {
        0
    }) + phase;
    let flow = now_ms() / 1400.0;
    let mut out = String::new();
    for i in 0..cols {
        let pos = i + offset;
        if pos.rem_euclid(period) != 0 {
            out.push(' ');
            continue;
        }
        let slot = (pos as f64 / period as f64).floor() as i64;
        let glyph = &sprites[slot.rem_euclid(sprites.len() as i64) as usize];
        if moving {
            out.push_str(&paint(
                glyph,
                gradient_color(stops, slot as f64 * 0.17 + flow),
                true,
            ));
        } else {
            out.push_str(&paint(glyph, [96, 104, 118], false));
        }
    }
    out
}

const TITLE_MAX: usize = 28;

fn marquee(text: &str, max: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= max {
        return text.to_string();
    }
    let loop_chars: Vec<char> = format!("{text}  ♪  ").chars().collect();
    let offset = (now_ms() / 400.0) as usize % loop_chars.len();
    let doubled: Vec<char> = loop_chars
        .iter()
        .chain(loop_chars.iter())
        .copied()
        .collect();
    doubled[offset..offset + max].iter().collect()
}

fn model_color(model: &str) -> [u8; 3] {
    let m = model.to_lowercase();
    if m.contains("opus") {
        [178, 140, 255]
    } else if m.contains("sonnet") {
        [120, 170, 255]
    } else if m.contains("haiku") {
        [120, 220, 150]
    } else if m.contains("fable") {
        [255, 200, 110]
    } else {
        [150, 158, 168]
    }
}

fn display_title() -> String {
    let raw = controller::track();
    if raw.chars().any(char::is_whitespace) {
        return raw;
    }
    controller::station_label().unwrap_or_else(|| "vibecode.fm".into())
}

fn centre_band(width: i64, phrase: &str, intensity: f64, theme: &Theme, moving: bool) -> String {
    if width <= 0 {
        return String::new();
    }
    let dflt = default_theme();
    let stops = if theme.stops.is_empty() {
        &dflt.stops
    } else {
        &theme.stops
    };
    let sprites = sprites_enabled();
    let splash = splash_enabled() && !phrase.is_empty();

    let mut l_anchor = String::new();
    let mut r_anchor = String::new();
    let mut inner = width;
    if sprites && width >= 4 {
        l_anchor = paint("♪", gradient_color(stops, 0.15), true);
        r_anchor = paint("♫", gradient_color(stops, 0.85), true);
        inner = width - 2;
    }

    let label = if splash {
        format!("\"{phrase}\"")
    } else {
        String::new()
    };
    let label_len = label.chars().count() as i64;
    let mid = if splash && inner >= label_len + if sprites { 6 } else { 2 } {
        let side = inner - label_len - 2;
        let left_w = side / 2;
        let right_w = side - left_w;
        let left = if sprites {
            sprite_run(left_w, intensity, theme, moving, 0)
        } else {
            " ".repeat(left_w.max(0) as usize)
        };
        let right = if sprites {
            sprite_run(right_w, intensity, theme, moving, 5)
        } else {
            " ".repeat(right_w.max(0) as usize)
        };
        format!("{left} {} {right}", gradient_text(&label, stops, moving))
    } else if splash && inner >= label_len {
        let pad = inner - label_len;
        let l = pad / 2;
        format!(
            "{}{}{}",
            " ".repeat(l.max(0) as usize),
            gradient_text(&label, stops, moving),
            " ".repeat((pad - l).max(0) as usize)
        )
    } else if sprites {
        sprite_run(inner, intensity, theme, moving, 0)
    } else {
        " ".repeat(inner.max(0) as usize)
    };
    format!("{l_anchor}{mid}{r_anchor}")
}

pub fn render() {
    let mut input = String::new();
    let _ = std::io::stdin().read_to_string(&mut input);
    let model = serde_json::from_str::<Value>(&input)
        .ok()
        .and_then(|v| {
            v.get("model")
                .and_then(|m| m.get("display_name"))
                .and_then(|d| d.as_str())
                .map(String::from)
        })
        .unwrap_or_else(|| "Claude".into());

    let width: i64 = env::var("COLUMNS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(80);
    let mc = model_color(&model);
    let icon = controller::status();

    let out = if icon == "►" || icon == "❚❚" {
        let moving = icon == "►";
        let theme = controller::station_theme().unwrap_or_else(default_theme);
        let stops = if theme.stops.is_empty() {
            default_theme().stops
        } else {
            theme.stops.clone()
        };
        let title = marquee(&display_title(), TITLE_MAX);
        let head = format!("📻 {}", paint(&title, gradient_color(&stops, 0.9), true));
        let head_len = 3 + title.chars().count() as i64;
        let mid_w = (width - head_len - model.chars().count() as i64 - 2).max(0);
        let band = centre_band(
            mid_w,
            &pick_phrase(&theme),
            controller::activity_level(),
            &theme,
            moving,
        );
        format!("{head} {band} {}", paint(&model, mc, false))
    } else {
        paint(&model, mc, false)
    };
    print!("{out}");
}

use serde_json::Value;
use std::env;
use std::fs;

const BASE: &str = "https://ice1.somafm.com";

pub struct Theme {
    pub tag: String,
    pub stops: Vec<(f64, [u8; 3])>,
    pub sprites: Vec<String>,
}

fn url(slug: &str) -> String {
    format!("{BASE}/{slug}-128-mp3")
}

const ALIASES: &[(&str, &str)] = &[
    ("chill", "groovesalad"),
    ("lofi", "groovesalad"),
    ("ambient", "dronezone"),
    ("drone", "dronezone"),
    ("metal", "metal"),
    ("jazz", "sonicuniverse"),
    ("synthwave", "u80s"),
    ("retro", "u80s"),
    ("hacker", "defcon"),
    ("defcon", "defcon"),
    ("beats", "fluid"),
    ("hiphop", "fluid"),
    ("indie", "indiepop"),
    ("rock", "indiepop"),
    ("bossa", "bossa"),
    ("bossanova", "bossa"),
    ("seventies", "seventies"),
    ("70s", "seventies"),
    ("reggae", "reggae"),
    ("dubstep", "dubstep"),
    ("dub", "dubstep"),
    ("lounge", "illstreet"),
    ("folk", "folkfwd"),
    ("spy", "secretagent"),
    ("agent", "secretagent"),
    ("vaporwave", "vaporwaves"),
    ("aesthetic", "vaporwaves"),
    ("space", "deepspaceone"),
    ("glitch", "cliqhop"),
    ("idm", "cliqhop"),
    ("tavern", "thistle"),
    ("bard", "thistle"),
    ("goa", "suburbsofgoa"),
    ("psy", "suburbsofgoa"),
];

const LABELS: &[(&str, &str)] = &[
    ("groovesalad", "Groove Salad"),
    ("dronezone", "Drone Zone"),
    ("metal", "Metal Detector"),
    ("sonicuniverse", "Sonic Universe"),
    ("u80s", "Underground 80s"),
    ("defcon", "DEF CON Radio"),
    ("fluid", "Fluid"),
    ("indiepop", "Indie Pop Rocks"),
    ("secretagent", "Secret Agent"),
    ("vaporwaves", "Vaporwaves"),
    ("deepspaceone", "Deep Space One"),
    ("cliqhop", "cliqhop idm"),
    ("thistle", "ThistleRadio"),
    ("suburbsofgoa", "Suburbs of Goa"),
    ("bossa", "Bossa Beyond"),
    ("seventies", "Left Coast 70s"),
    ("reggae", "Heavyweight Reggae"),
    ("dubstep", "Dub Step Beyond"),
    ("illstreet", "Illinois St. Lounge"),
    ("folkfwd", "Folk Forward"),
];

fn theme_for_slug(slug: &str) -> Option<Theme> {
    let s = |list: &[&str]| list.iter().map(|x| x.to_string()).collect::<Vec<_>>();
    let t = |tag: &str, stops: Vec<(f64, [u8; 3])>, sprites: &[&str]| {
        Some(Theme {
            tag: tag.into(),
            stops,
            sprites: s(sprites),
        })
    };
    match slug {
        "dronezone" => t(
            "space",
            vec![
                (0.0, [70, 130, 220]),
                (0.5, [110, 160, 240]),
                (1.0, [190, 210, 255]),
            ],
            &["✦", "♪", "✧", "⋆", "♫", "·", "○", "☆", "♩", "✩"],
        ),
        "metal" => t(
            "metal",
            vec![
                (0.0, [180, 60, 40]),
                (0.5, [235, 110, 40]),
                (1.0, [255, 200, 80]),
            ],
            &["◤", "♯", "▲", "♬", "◢", "♭", "▼", "◣", "♫", "✦"],
        ),
        "sonicuniverse" => t(
            "jazz",
            vec![
                (0.0, [160, 110, 60]),
                (0.5, [220, 160, 70]),
                (1.0, [255, 220, 130]),
            ],
            &["♪", "♫", "♬", "♩", "♭", "♮", "♪", "♫", "♬", "♩"],
        ),
        "u80s" => t(
            "synthwave",
            vec![
                (0.0, [66, 210, 230]),
                (0.5, [150, 100, 240]),
                (1.0, [255, 80, 180]),
            ],
            &["◢", "♫", "◣", "▲", "♪", "✦", "◆", "♬", "●", "★"],
        ),
        "defcon" => t(
            "hacker",
            vec![
                (0.0, [30, 140, 60]),
                (0.5, [60, 200, 90]),
                (1.0, [160, 255, 170]),
            ],
            &["0", "1", "{", "}", "<", ">", "/", "λ", "#", ";"],
        ),
        "fluid" => t(
            "beats",
            vec![
                (0.0, [70, 150, 235]),
                (0.5, [130, 120, 245]),
                (1.0, [200, 140, 255]),
            ],
            &["♪", "≈", "♫", "~", "♬", "○", "♩", "◦", "°", "♭"],
        ),
        "indiepop" => t(
            "indie",
            vec![
                (0.0, [240, 120, 130]),
                (0.5, [255, 150, 110]),
                (1.0, [255, 210, 120]),
            ],
            &["♥", "♪", "★", "♫", "✿", "♬", "☆", "❀", "♩", "✧"],
        ),
        "secretagent" => t(
            "spy",
            vec![
                (0.0, [110, 120, 140]),
                (0.5, [160, 170, 190]),
                (1.0, [230, 235, 245]),
            ],
            &["♠", "♪", "◆", "●", "♫", "✦", "◇", "♣", "♩", "·"],
        ),
        "vaporwaves" => t(
            "vaporwave",
            vec![
                (0.0, [255, 110, 200]),
                (0.5, [190, 130, 240]),
                (1.0, [90, 230, 230]),
            ],
            &["▲", "♪", "○", "✿", "♫", "☆", "◇", "♡", "◈", "✧"],
        ),
        "deepspaceone" => t(
            "space",
            vec![
                (0.0, [80, 80, 180]),
                (0.5, [130, 120, 220]),
                (1.0, [220, 220, 255]),
            ],
            &["✦", "♪", "★", "⋆", "♫", "✧", "○", "●", "♩", "◦"],
        ),
        "cliqhop" => t(
            "glitch",
            vec![
                (0.0, [40, 180, 200]),
                (0.5, [80, 220, 230]),
                (1.0, [220, 250, 255]),
            ],
            &["▓", "♪", "▒", "░", "♫", "▚", "▞", "█", "♩", "▟"],
        ),
        "thistle" => t(
            "tavern",
            vec![
                (0.0, [140, 100, 60]),
                (0.5, [200, 150, 80]),
                (1.0, [255, 215, 130]),
            ],
            &["♣", "♪", "❀", "⚜", "♫", "❦", "✿", "♧", "♩", "✤"],
        ),
        "suburbsofgoa" => t(
            "goa",
            vec![
                (0.0, [200, 80, 200]),
                (0.5, [240, 130, 120]),
                (1.0, [255, 210, 90]),
            ],
            &["◉", "♪", "❂", "✹", "♫", "✸", "❈", "⊛", "♩", "◎"],
        ),
        "bossa" => t(
            "jazz",
            vec![
                (0.0, [90, 200, 110]),
                (0.5, [220, 200, 90]),
                (1.0, [255, 230, 140]),
            ],
            &["♪", "♫", "♬", "♩", "❀", "✿", "·", "✦", "♭", "♮"],
        ),
        "seventies" => t(
            "indie",
            vec![
                (0.0, [200, 110, 50]),
                (0.5, [240, 160, 60]),
                (1.0, [255, 210, 120]),
            ],
            &["♪", "●", "♫", "◆", "♬", "☆", "♩", "✦", "○", "♭"],
        ),
        "reggae" => t(
            "chill",
            vec![
                (0.0, [40, 180, 70]),
                (0.5, [240, 210, 60]),
                (1.0, [220, 70, 50]),
            ],
            &["♪", "♫", "♬", "●", "♩", "◆", "✦", "·", "♭", "○"],
        ),
        "dubstep" => t(
            "beats",
            vec![
                (0.0, [120, 80, 220]),
                (0.5, [80, 180, 160]),
                (1.0, [180, 240, 120]),
            ],
            &["♪", "≈", "♫", "▓", "♬", "▒", "♩", "~", "█", "♭"],
        ),
        "illstreet" => t(
            "jazz",
            vec![
                (0.0, [170, 120, 70]),
                (0.5, [220, 170, 90]),
                (1.0, [245, 215, 150]),
            ],
            &["♪", "♫", "♬", "♩", "◆", "·", "♭", "♮", "✦", "○"],
        ),
        "folkfwd" => t(
            "tavern",
            vec![
                (0.0, [110, 140, 70]),
                (0.5, [160, 180, 90]),
                (1.0, [220, 210, 130]),
            ],
            &["♪", "❀", "♫", "♣", "♬", "❦", "♩", "✿", "♭", "·"],
        ),
        _ => None,
    }
}

fn slug_of(url: &str) -> Option<&str> {
    url.strip_prefix(&format!("{BASE}/"))
        .and_then(|s| s.strip_suffix("-128-mp3"))
}

struct Custom {
    stations: Vec<(String, String)>,
    labels: Vec<(String, String)>,
    themes: Vec<(String, Theme)>,
}

fn custom_file() -> String {
    env::var("VIBECODE_STATIONS").unwrap_or_else(|_| {
        let home = env::var("HOME")
            .or_else(|_| env::var("USERPROFILE"))
            .unwrap_or_default();
        format!("{home}/.vibecode-fm/stations.json")
    })
}

fn parse_theme(v: &Value) -> Option<Theme> {
    let stops: Vec<(f64, [u8; 3])> = v
        .get("stops")?
        .as_array()?
        .iter()
        .filter_map(|s| {
            let p = s.get("p")?.as_f64()?;
            let c = s.get("c")?.as_array()?;
            Some((
                p,
                [
                    c.first()?.as_u64()? as u8,
                    c.get(1)?.as_u64()? as u8,
                    c.get(2)?.as_u64()? as u8,
                ],
            ))
        })
        .collect();
    if stops.is_empty() {
        return None;
    }
    let sprites = v
        .get("sprites")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    Some(Theme {
        tag: "chill".into(),
        stops,
        sprites,
    })
}

fn custom() -> Custom {
    let mut out = Custom {
        stations: vec![],
        labels: vec![],
        themes: vec![],
    };
    let text = match fs::read_to_string(custom_file()) {
        Ok(t) => t,
        Err(_) => return out,
    };
    let raw: Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return out,
    };
    if let Some(map) = raw.as_object() {
        for (name, entry) in map {
            let u = match entry {
                Value::String(s) => s.clone(),
                Value::Object(_) => match entry.get("url").and_then(Value::as_str) {
                    Some(s) => s.to_string(),
                    None => continue,
                },
                _ => continue,
            };
            out.stations.push((name.to_lowercase(), u.clone()));
            if let Some(l) = entry.get("label").and_then(Value::as_str) {
                out.labels.push((u.clone(), l.to_string()));
            }
            if let Some(t) = entry.get("theme").and_then(parse_theme) {
                out.themes.push((u.clone(), t));
            }
        }
    }
    out
}

pub fn resolve(name: &str) -> Option<String> {
    let key = name.to_lowercase();
    let c = custom();
    if let Some((_, u)) = c.stations.iter().find(|(n, _)| *n == key) {
        return Some(u.clone());
    }
    ALIASES
        .iter()
        .find(|(a, _)| *a == key)
        .map(|(_, slug)| url(slug))
}

pub fn label(url: &str) -> Option<String> {
    let c = custom();
    if let Some((_, l)) = c.labels.iter().find(|(u, _)| u == url) {
        return Some(l.clone());
    }
    let slug = slug_of(url)?;
    LABELS
        .iter()
        .find(|(s, _)| *s == slug)
        .map(|(_, l)| format!("{l} · SomaFM"))
}

pub fn theme(url: &str) -> Option<Theme> {
    let mut c = custom();
    if let Some(pos) = c.themes.iter().position(|(u, _)| u == url) {
        return Some(c.themes.remove(pos).1);
    }
    theme_for_slug(slug_of(url)?)
}

const CAROUSEL: &[&str] = &[
    "chill",
    "ambient",
    "metal",
    "jazz",
    "synthwave",
    "hacker",
    "beats",
    "indie",
    "spy",
    "vaporwave",
    "space",
    "glitch",
    "tavern",
    "goa",
    "bossa",
    "seventies",
    "reggae",
    "dubstep",
    "lounge",
    "folk",
];

fn carousel() -> Vec<String> {
    let mut urls: Vec<String> = vec![];
    for vibe in CAROUSEL {
        if let Some(u) = resolve(vibe) {
            if !urls.contains(&u) {
                urls.push(u);
            }
        }
    }
    for (_, u) in custom().stations {
        if !urls.contains(&u) {
            urls.push(u);
        }
    }
    urls
}

pub fn next_station(current: Option<&str>) -> Option<String> {
    let list = carousel();
    if list.is_empty() {
        return None;
    }
    let idx = current
        .and_then(|c| list.iter().position(|u| u == c))
        .map(|i| (i + 1) % list.len())
        .unwrap_or(0);
    Some(list[idx].clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_known_and_unknown() {
        assert_eq!(resolve("hacker"), Some(url("defcon")));
        assert_eq!(resolve("synthwave"), Some(url("u80s")));
        assert_eq!(resolve("spy"), Some(url("secretagent")));
        assert_eq!(resolve("HACKER"), Some(url("defcon")));
        assert_eq!(resolve("not-a-vibe"), None);
    }

    #[test]
    fn label_adds_somafm_suffix() {
        assert_eq!(label(&url("defcon")), Some("DEF CON Radio · SomaFM".into()));
        assert_eq!(label("https://example.com/x"), None);
    }

    #[test]
    fn theme_carries_tag_and_data() {
        let t = theme(&url("defcon")).unwrap();
        assert_eq!(t.tag, "hacker");
        assert!(!t.stops.is_empty() && !t.sprites.is_empty());
        assert!(theme("https://example.com/x").is_none());
    }

    #[test]
    fn next_station_cycles() {
        let first = url("groovesalad");
        let second = next_station(Some(&first)).unwrap();
        assert_ne!(first, second);
        assert!(next_station(None).is_some());
    }
}

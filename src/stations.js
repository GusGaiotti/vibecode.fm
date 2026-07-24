'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Curated SomaFM stations (free, legal, no login) mapped to moods. Several
// aliases point at the same channel so `/vibecode-fm:radio rock` and
// `... indie` both work.
const BASE = 'https://ice1.somafm.com';

const STATIONS = {
  chill: `${BASE}/groovesalad-128-mp3`,
  lofi: `${BASE}/groovesalad-128-mp3`,
  ambient: `${BASE}/dronezone-128-mp3`,
  drone: `${BASE}/dronezone-128-mp3`,
  metal: `${BASE}/metal-128-mp3`,
  jazz: `${BASE}/sonicuniverse-128-mp3`,
  synthwave: `${BASE}/u80s-128-mp3`,
  retro: `${BASE}/u80s-128-mp3`,
  hacker: `${BASE}/defcon-128-mp3`,
  defcon: `${BASE}/defcon-128-mp3`,
  beats: `${BASE}/fluid-128-mp3`,
  hiphop: `${BASE}/fluid-128-mp3`,
  indie: `${BASE}/indiepop-128-mp3`,
  rock: `${BASE}/indiepop-128-mp3`,
  spy: `${BASE}/secretagent-128-mp3`,
  agent: `${BASE}/secretagent-128-mp3`,
  vaporwave: `${BASE}/vaporwaves-128-mp3`,
  aesthetic: `${BASE}/vaporwaves-128-mp3`,
  space: `${BASE}/deepspaceone-128-mp3`,
  glitch: `${BASE}/cliqhop-128-mp3`,
  idm: `${BASE}/cliqhop-128-mp3`,
  tavern: `${BASE}/thistle-128-mp3`,
  bard: `${BASE}/thistle-128-mp3`,
  goa: `${BASE}/suburbsofgoa-128-mp3`,
  psy: `${BASE}/suburbsofgoa-128-mp3`,
};

// Human-friendly channel names, keyed by URL, for the statusline to show while
// the live track title (icy-title) hasn't arrived yet.
const LABELS = {
  [`${BASE}/groovesalad-128-mp3`]: 'Groove Salad',
  [`${BASE}/dronezone-128-mp3`]: 'Drone Zone',
  [`${BASE}/metal-128-mp3`]: 'Metal Detector',
  [`${BASE}/sonicuniverse-128-mp3`]: 'Sonic Universe',
  [`${BASE}/u80s-128-mp3`]: 'Underground 80s',
  [`${BASE}/defcon-128-mp3`]: 'DEF CON Radio',
  [`${BASE}/fluid-128-mp3`]: 'Fluid',
  [`${BASE}/indiepop-128-mp3`]: 'Indie Pop Rocks',
  [`${BASE}/secretagent-128-mp3`]: 'Secret Agent',
  [`${BASE}/vaporwaves-128-mp3`]: 'Vaporwaves',
  [`${BASE}/deepspaceone-128-mp3`]: 'Deep Space One',
  [`${BASE}/cliqhop-128-mp3`]: 'cliqhop idm',
  [`${BASE}/thistle-128-mp3`]: 'ThistleRadio',
  [`${BASE}/suburbsofgoa-128-mp3`]: 'Suburbs of Goa',
};

// Visual identity per channel for the statusline: a colour gradient plus a
// themed set of single-width sprites that drift across the meter with the
// music. Stations without a theme fall back to the statusline's default.
const THEMES = {
  [`${BASE}/dronezone-128-mp3`]: {
    // deep-space blues
    stops: [
      { p: 0.0, c: [70, 130, 220] },
      { p: 0.5, c: [110, 160, 240] },
      { p: 1.0, c: [190, 210, 255] },
    ],
    sprites: ['✦', '✧', '⋆', '·', '○', '☆', '✩', '◦'],
  },
  [`${BASE}/metal-128-mp3`]: {
    // molten reds
    stops: [
      { p: 0.0, c: [180, 60, 40] },
      { p: 0.5, c: [235, 110, 40] },
      { p: 1.0, c: [255, 200, 80] },
    ],
    sprites: ['◤', '▲', '♯', '◢', '▼', '◣', '✦', '✧'],
  },
  [`${BASE}/sonicuniverse-128-mp3`]: {
    // smoky amber jazz club
    stops: [
      { p: 0.0, c: [160, 110, 60] },
      { p: 0.5, c: [220, 160, 70] },
      { p: 1.0, c: [255, 220, 130] },
    ],
    sprites: ['♪', '♫', '♬', '♩', '♭', '♮', '✦', '·'],
  },
  [`${BASE}/u80s-128-mp3`]: {
    // synthwave sunset: cyan -> purple -> hot pink
    stops: [
      { p: 0.0, c: [66, 210, 230] },
      { p: 0.5, c: [150, 100, 240] },
      { p: 1.0, c: [255, 80, 180] },
    ],
    sprites: ['◢', '◣', '▲', '✦', '◆', '✧', '●', '★'],
  },
  [`${BASE}/defcon-128-mp3`]: {
    // terminal matrix greens
    stops: [
      { p: 0.0, c: [30, 140, 60] },
      { p: 0.5, c: [60, 200, 90] },
      { p: 1.0, c: [160, 255, 170] },
    ],
    sprites: ['0', '1', '{', '}', '<', '>', '/', 'λ', '#', ';'],
  },
  [`${BASE}/fluid-128-mp3`]: {
    // liquid blue -> violet
    stops: [
      { p: 0.0, c: [70, 150, 235] },
      { p: 0.5, c: [130, 120, 245] },
      { p: 1.0, c: [200, 140, 255] },
    ],
    sprites: ['≈', '~', '♪', '○', '◦', '°', '✧', '·'],
  },
  [`${BASE}/indiepop-128-mp3`]: {
    // bubblegum coral
    stops: [
      { p: 0.0, c: [240, 120, 130] },
      { p: 0.5, c: [255, 150, 110] },
      { p: 1.0, c: [255, 210, 120] },
    ],
    sprites: ['♥', '★', '♪', '✿', '☆', '♫', '❀', '✧'],
  },
  [`${BASE}/secretagent-128-mp3`]: {
    // noir: cold steel with a martini-olive accent
    stops: [
      { p: 0.0, c: [110, 120, 140] },
      { p: 0.5, c: [160, 170, 190] },
      { p: 1.0, c: [230, 235, 245] },
    ],
    sprites: ['♠', '◆', '●', '✦', '◇', '♣', '✧', '·'],
  },
  [`${BASE}/vaporwaves-128-mp3`]: {
    // mall-at-midnight: pink -> aqua
    stops: [
      { p: 0.0, c: [255, 110, 200] },
      { p: 0.5, c: [190, 130, 240] },
      { p: 1.0, c: [90, 230, 230] },
    ],
    sprites: ['▲', '○', '✿', '☆', '◇', '♡', '◈', '✧'],
  },
  [`${BASE}/deepspaceone-128-mp3`]: {
    // void: indigo -> starlight
    stops: [
      { p: 0.0, c: [80, 80, 180] },
      { p: 0.5, c: [130, 120, 220] },
      { p: 1.0, c: [220, 220, 255] },
    ],
    sprites: ['✦', '★', '⋆', '✧', '○', '●', '◦', '·'],
  },
  [`${BASE}/cliqhop-128-mp3`]: {
    // circuit board: cyan -> white glitch
    stops: [
      { p: 0.0, c: [40, 180, 200] },
      { p: 0.5, c: [80, 220, 230] },
      { p: 1.0, c: [220, 250, 255] },
    ],
    sprites: ['▓', '▒', '░', '▚', '▞', '█', '▙', '▟'],
  },
  [`${BASE}/thistle-128-mp3`]: {
    // tavern: hearth wood and ale
    stops: [
      { p: 0.0, c: [140, 100, 60] },
      { p: 0.5, c: [200, 150, 80] },
      { p: 1.0, c: [255, 215, 130] },
    ],
    sprites: ['♣', '❀', '⚜', '♪', '❦', '✿', '♧', '✤'],
  },
  [`${BASE}/suburbsofgoa-128-mp3`]: {
    // psychedelic sunset: magenta -> gold
    stops: [
      { p: 0.0, c: [200, 80, 200] },
      { p: 0.5, c: [240, 130, 120] },
      { p: 1.0, c: [255, 210, 90] },
    ],
    sprites: ['◉', '❂', '✹', '✸', '❈', '⊛', '◎', '✦'],
  },
};

// Users can add their own stations — and optionally a label and a theme
// (colour gradient + sprites) — in ~/.vibecode-fm/stations.json (or the file
// VIBECODE_STATIONS points at). Entries are either a plain URL string or an
// object:
//   { "focus": "https://stream.example/focus.mp3",
//     "night": { "url": "https://...", "label": "Night Drive",
//                "theme": { "stops": [{ "p": 0, "c": [80, 80, 180] }],
//                           "sprites": ["✦", "★", "·"] } } }
// Custom names win over built-ins; malformed entries are ignored — user
// content must never break the plugin.
function customFile() {
  return (
    process.env.VIBECODE_STATIONS ||
    path.join(os.homedir(), '.vibecode-fm', 'stations.json')
  );
}

let customCache = null;

function custom() {
  if (customCache) return customCache;
  const out = { stations: {}, labels: {}, themes: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(customFile(), 'utf8'));
    for (const [name, entry] of Object.entries(raw)) {
      const url = typeof entry === 'string' ? entry : entry && entry.url;
      if (typeof url !== 'string' || !url) continue;
      out.stations[name.toLowerCase()] = url;
      if (entry && typeof entry === 'object') {
        if (typeof entry.label === 'string') out.labels[url] = entry.label;
        const t = entry.theme;
        if (t && Array.isArray(t.stops)) out.themes[url] = t;
      }
    }
  } catch {
    /* no custom file or bad json: built-ins only */
  }
  customCache = out;
  return out;
}

function resolve(name) {
  if (!name) return null;
  const key = name.toLowerCase();
  return custom().stations[key] || STATIONS[key] || null;
}

function names() {
  return [...new Set([...Object.keys(STATIONS), ...Object.keys(custom().stations)])];
}

// Display-ready name for a station URL, or null if it isn't a known one.
function label(url) {
  if (!url) return null;
  if (custom().labels[url]) return custom().labels[url];
  return LABELS[url] ? `${LABELS[url]} · SomaFM` : null;
}

// Equalizer theme for a station URL, or null to use the default.
function theme(url) {
  if (!url) return null;
  return custom().themes[url] || THEMES[url] || null;
}

module.exports = { resolve, names, label, theme };

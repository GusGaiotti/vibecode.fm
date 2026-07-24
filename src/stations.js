'use strict';

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

// Visual identity per channel for the statusline equalizer: gradient stops
// (bar colour by height, p in 0..1) and the accent used for drifting notes.
// Stations without a theme fall back to the statusline's default.
const THEMES = {
  [`${BASE}/dronezone-128-mp3`]: {
    // deep-space blues
    stops: [
      { p: 0.0, c: [70, 130, 220] },
      { p: 0.5, c: [110, 160, 240] },
      { p: 1.0, c: [190, 210, 255] },
    ],
    note: [160, 200, 255],
  },
  [`${BASE}/metal-128-mp3`]: {
    // molten reds
    stops: [
      { p: 0.0, c: [180, 60, 40] },
      { p: 0.5, c: [235, 110, 40] },
      { p: 1.0, c: [255, 200, 80] },
    ],
    note: [255, 120, 80],
  },
  [`${BASE}/sonicuniverse-128-mp3`]: {
    // smoky amber jazz club
    stops: [
      { p: 0.0, c: [160, 110, 60] },
      { p: 0.5, c: [220, 160, 70] },
      { p: 1.0, c: [255, 220, 130] },
    ],
    note: [255, 200, 120],
  },
  [`${BASE}/u80s-128-mp3`]: {
    // synthwave sunset: cyan -> purple -> hot pink
    stops: [
      { p: 0.0, c: [66, 210, 230] },
      { p: 0.5, c: [150, 100, 240] },
      { p: 1.0, c: [255, 80, 180] },
    ],
    note: [64, 224, 255],
  },
  [`${BASE}/defcon-128-mp3`]: {
    // terminal matrix greens
    stops: [
      { p: 0.0, c: [30, 140, 60] },
      { p: 0.5, c: [60, 200, 90] },
      { p: 1.0, c: [160, 255, 170] },
    ],
    note: [120, 255, 140],
  },
  [`${BASE}/fluid-128-mp3`]: {
    // liquid blue -> violet
    stops: [
      { p: 0.0, c: [70, 150, 235] },
      { p: 0.5, c: [130, 120, 245] },
      { p: 1.0, c: [200, 140, 255] },
    ],
    note: [170, 150, 255],
  },
  [`${BASE}/indiepop-128-mp3`]: {
    // bubblegum coral
    stops: [
      { p: 0.0, c: [240, 120, 130] },
      { p: 0.5, c: [255, 150, 110] },
      { p: 1.0, c: [255, 210, 120] },
    ],
    note: [255, 140, 160],
  },
  [`${BASE}/secretagent-128-mp3`]: {
    // noir: cold steel with a martini-olive accent
    stops: [
      { p: 0.0, c: [110, 120, 140] },
      { p: 0.5, c: [160, 170, 190] },
      { p: 1.0, c: [230, 235, 245] },
    ],
    note: [180, 200, 90],
  },
  [`${BASE}/vaporwaves-128-mp3`]: {
    // mall-at-midnight: pink -> aqua
    stops: [
      { p: 0.0, c: [255, 110, 200] },
      { p: 0.5, c: [190, 130, 240] },
      { p: 1.0, c: [90, 230, 230] },
    ],
    note: [120, 240, 240],
  },
  [`${BASE}/deepspaceone-128-mp3`]: {
    // void: indigo -> starlight
    stops: [
      { p: 0.0, c: [80, 80, 180] },
      { p: 0.5, c: [130, 120, 220] },
      { p: 1.0, c: [220, 220, 255] },
    ],
    note: [200, 200, 255],
  },
  [`${BASE}/cliqhop-128-mp3`]: {
    // circuit board: cyan -> white glitch
    stops: [
      { p: 0.0, c: [40, 180, 200] },
      { p: 0.5, c: [80, 220, 230] },
      { p: 1.0, c: [220, 250, 255] },
    ],
    note: [255, 255, 140],
  },
  [`${BASE}/thistle-128-mp3`]: {
    // tavern: hearth wood and ale
    stops: [
      { p: 0.0, c: [140, 100, 60] },
      { p: 0.5, c: [200, 150, 80] },
      { p: 1.0, c: [255, 215, 130] },
    ],
    note: [150, 220, 120],
  },
  [`${BASE}/suburbsofgoa-128-mp3`]: {
    // psychedelic sunset: magenta -> gold
    stops: [
      { p: 0.0, c: [200, 80, 200] },
      { p: 0.5, c: [240, 130, 120] },
      { p: 1.0, c: [255, 210, 90] },
    ],
    note: [255, 170, 255],
  },
};

function resolve(name) {
  if (!name) return null;
  return STATIONS[name.toLowerCase()] || null;
}

function names() {
  return Object.keys(STATIONS);
}

// Friendly name for a station URL, or null if it isn't one of ours.
function label(url) {
  if (!url) return null;
  return LABELS[url] || null;
}

// Equalizer theme for a station URL, or null to use the default.
function theme(url) {
  if (!url) return null;
  return THEMES[url] || null;
}

module.exports = { resolve, names, label, theme };

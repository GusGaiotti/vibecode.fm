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
};

function resolve(name) {
  if (!name) return null;
  return STATIONS[name.toLowerCase()] || null;
}

function names() {
  return Object.keys(STATIONS);
}

module.exports = { resolve, names };

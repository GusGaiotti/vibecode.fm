'use strict';

const fs = require('fs');
const { send } = require('./ipc');
const { alive, start } = require('./player');
const stations = require('./stations');
const {
  ipcPath,
  stateDir,
  disabledFlag,
  logFile,
  stationFile,
  activityFile,
  defaultSource,
} = require('./paths');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FADE_MS = 350;
const FADE_STEPS = 7;
const ACTIVITY_WINDOW_MS = 8000;
const ACTIVITY_MAX = 6; // events in the window that count as "full intensity"

function log(message) {
  if (!process.env.VIBECODE_DEBUG) return;
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    const time = new Date().toISOString().slice(11, 19);
    fs.appendFileSync(logFile(), `${time} pid=${process.pid} ${message}\n`);
  } catch {
    /* logging must never break anything */
  }
}

const volume = () => Number(process.env.VIBECODE_VOLUME) || 70;
const isDisabled = () => fs.existsSync(disabledFlag());

// Source precedence: explicit env > station chosen via `radio` > bundled default.
function source() {
  if (process.env.VIBECODE_SOURCE) return process.env.VIBECODE_SOURCE;
  try {
    const saved = fs.readFileSync(stationFile(), 'utf8').trim();
    if (saved) return saved;
  } catch {
    /* no station chosen yet */
  }
  return defaultSource();
}

async function getPause() {
  const reply = await send(ipcPath(), { command: ['get_property', 'pause'] });
  if (!reply || reply.error !== 'success') return null;
  return reply.data;
}

async function fadeTo(target) {
  for (let i = 1; i <= FADE_STEPS; i += 1) {
    const v = Math.round((target * i) / FADE_STEPS);
    await send(ipcPath(), { command: ['set_property', 'volume', v] });
    await sleep(FADE_MS / FADE_STEPS);
  }
}

function recordActivity() {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    const now = Date.now();
    let stamps = [];
    try {
      stamps = fs
        .readFileSync(activityFile(), 'utf8')
        .split('\n')
        .map(Number)
        .filter((t) => t && now - t < ACTIVITY_WINDOW_MS);
    } catch {
      /* first event */
    }
    stamps.push(now);
    fs.writeFileSync(activityFile(), stamps.join('\n'));
  } catch {
    /* activity tracking is best-effort */
  }
}

// 0..1 — how busy the agent has been recently. Drives the equalizer colour.
function activityLevel() {
  try {
    const now = Date.now();
    const count = fs
      .readFileSync(activityFile(), 'utf8')
      .split('\n')
      .map(Number)
      .filter((t) => t && now - t < ACTIVITY_WINDOW_MS).length;
    return Math.min(1, count / ACTIVITY_MAX);
  } catch {
    return 0;
  }
}

async function play() {
  log('action=play');
  if (isDisabled()) {
    log('play: disabled flag set, skipping');
    return;
  }
  recordActivity();
  let wasPaused = true;
  if (await alive()) {
    wasPaused = (await getPause()) !== false;
    log('play: player already alive, resuming');
  } else {
    log('play: no live player, starting one');
    if (!(await start(source(), volume()))) {
      log('play: player did not come up');
      return;
    }
  }
  // Only fade in on a real paused->playing transition, not on every tool call.
  if (wasPaused) {
    await send(ipcPath(), { command: ['set_property', 'volume', 0] });
    await send(ipcPath(), { command: ['set_property', 'pause', false] });
    await fadeTo(volume());
  }
}

async function pause() {
  log('action=pause');
  if (!(await alive())) {
    log('pause: no live player, nothing to do');
    return;
  }
  if ((await getPause()) === false) {
    await fadeTo(0);
  }
  await send(ipcPath(), { command: ['set_property', 'pause', true] });
}

async function radio(vibe) {
  const url = stations.resolve(vibe);
  if (!url) return; // unknown vibe: the command file lists the options
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(stationFile(), url);
  recordActivity();
  if (await alive()) {
    await send(ipcPath(), { command: ['loadfile', url] });
    await send(ipcPath(), { command: ['set_property', 'volume', 0] });
    await send(ipcPath(), { command: ['set_property', 'pause', false] });
    await fadeTo(volume());
  } else {
    await start(url, volume());
    await send(ipcPath(), { command: ['set_property', 'pause', false] });
  }
}

async function status() {
  if (isDisabled()) return '';
  const paused = await getPause();
  if (paused === null) return '';
  return paused ? '❚❚' : '►';
}

async function track() {
  if (isDisabled()) return '';
  const reply = await send(ipcPath(), { command: ['get_property', 'media-title'] });
  if (!reply || reply.error !== 'success' || !reply.data) return '';
  return String(reply.data).replace(/\s+/g, ' ').trim().slice(0, 48);
}

function on() {
  log('action=on');
  try {
    fs.unlinkSync(disabledFlag());
  } catch {
    /* already enabled */
  }
}

async function off() {
  log('action=off');
  if (await alive()) {
    await send(ipcPath(), { command: ['quit'] });
  }
  if (process.platform !== 'win32') {
    try {
      fs.unlinkSync(ipcPath());
    } catch {
      /* no socket file */
    }
  }
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(disabledFlag(), '');
}

module.exports = {
  play,
  pause,
  radio,
  status,
  track,
  on,
  off,
  activityLevel,
  stationNames: stations.names,
};

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { send } = require('./ipc');
const { alive, start } = require('./player');
const stations = require('./stations');
const {
  ipcPath,
  stateDir,
  disabledFlag,
  logFile,
  stationFile,
  volumeFile,
  intentFile,
  activityFile,
  watchdogFile,
  debugEnabled,
  defaultSource,
} = require('./paths');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FADE_MS = 180;
const FADE_STEPS = 6;
const ACTIVITY_WINDOW_MS = 8000;
const ACTIVITY_MAX = 6; // events in the window that count as "full intensity"

function log(message) {
  if (!debugEnabled()) return;
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    const time = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    fs.appendFileSync(logFile(), `${time} pid=${process.pid} ${message}\n`);
  } catch {
    /* logging must never break anything */
  }
}

// ---- Intent serialization ----------------------------------------------------
// Every play/pause carries a token stamped when its hook fired (via the bin
// entry point). The controller records the newest token as the current intent;
// any action whose token is older than the recorded one has been superseded by
// a later event and must not touch the player. This kills the race where a
// detached play, finishing after a pause, un-mutes the music.
function actionToken() {
  return Number(process.env.VIBECODE_TOKEN) || Date.now();
}

// Record this event as the current intent — but only if it's newer than what's
// already there, so a late-arriving older event can't clobber a fresher one.
function recordIntent(token, action) {
  try {
    if (token < latestToken()) return;
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(intentFile(), `${token} ${action}`);
  } catch {
    /* best-effort */
  }
}

function latestToken() {
  try {
    return Number(fs.readFileSync(intentFile(), 'utf8').trim().split(' ')[0]) || 0;
  } catch {
    return 0;
  }
}

// True when a newer event has taken over since `token` was stamped.
function superseded(token) {
  return latestToken() > token;
}

// Time an async step and log how long it took (for latency diagnosis).
async function timed(label, fn) {
  const t0 = Date.now();
  const result = await fn();
  log(`  ${label}: ${Date.now() - t0}ms`);
  return result;
}

// Base volume: what `/volume` persisted, else VIBECODE_VOLUME, else 70.
function volume() {
  try {
    const saved = Number(fs.readFileSync(volumeFile(), 'utf8').trim());
    if (Number.isFinite(saved)) return saved;
  } catch {
    /* nothing saved yet */
  }
  return Number(process.env.VIBECODE_VOLUME) || 70;
}
const isDisabled = () => fs.existsSync(disabledFlag());

const ADAPTIVE_SPREAD = 15;

// Map processing intensity (0..1) to a volume around the base: lighter work
// plays quieter, heavier work louder, bounded to +/- ADAPTIVE_SPREAD.
function adaptiveVolume(base, level) {
  const v = Math.round(base - ADAPTIVE_SPREAD + 2 * ADAPTIVE_SPREAD * level);
  return Math.max(0, Math.min(100, v));
}

// Adaptive volume — the music swells and eases with how hard the agent is
// working — is on by default; VIBECODE_ADAPTIVE=0 keeps a fixed volume.
function adaptiveEnabled() {
  const v = String(process.env.VIBECODE_ADAPTIVE || '').toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(v);
}

// The volume a play should aim for.
function targetVolume() {
  const base = volume();
  if (!adaptiveEnabled()) return base;
  return adaptiveVolume(base, activityLevel());
}

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

async function getProp(name) {
  const reply = await send(ipcPath(), { command: ['get_property', name] });
  if (!reply || reply.error !== 'success') return null;
  return reply.data;
}

// Logical "halted" state. A pause here is a SOFT pause — fade out and mute,
// keeping the live stream flowing so resume is instant (a hard mpv pause
// disconnects the radio stream after a while and resuming needs a slow
// reconnect). The watchdog issues the hard pause once the session goes idle.
async function isHalted() {
  const paused = await getProp('pause');
  if (paused === null) return null;
  if (paused) return true;
  return (await getProp('mute')) === true;
}

// Ramp the volume from `from` to `to` over FADE_MS. Kept short so pause/resume
// feel immediate while still avoiding clicks. If `guard` is given and a newer
// event supersedes it mid-fade, the ramp aborts and returns false.
async function fade(from, to, guard) {
  for (let i = 1; i <= FADE_STEPS; i += 1) {
    if (guard && superseded(guard)) return false;
    const v = Math.round(from + ((to - from) * i) / FADE_STEPS);
    await send(ipcPath(), { command: ['set_property', 'volume', v] });
    await sleep(FADE_MS / FADE_STEPS);
  }
  return true;
}

const fadeTo = (target) => fade(0, target);

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

// Timestamp of the most recent play event, 0 if none. The watchdog uses this
// to notice turns that ended without a Stop hook firing.
function lastActivityMs() {
  try {
    const stamps = fs
      .readFileSync(activityFile(), 'utf8')
      .split('\n')
      .map(Number)
      .filter(Boolean);
    return stamps.length ? Math.max(...stamps) : 0;
  } catch {
    return 0;
  }
}

const WATCHDOG_FRESH_MS = 45000; // 3 missed 15s heartbeats = watchdog is gone

// A turn can die without any hook firing (API error, spend-limit abort,
// Ctrl+C) — no Stop, so nothing pauses the music. The watchdog is a tiny
// detached process that pauses playback once play events stop arriving.
// Spawned lazily here; the heartbeat check keeps it a single instance.
function ensureWatchdog() {
  if (process.env.VIBECODE_NO_WATCHDOG) return;
  try {
    if (Date.now() - fs.statSync(watchdogFile()).mtimeMs < WATCHDOG_FRESH_MS) return;
  } catch {
    /* no heartbeat yet: spawn one */
  }
  try {
    const child = spawn(process.execPath, [path.join(__dirname, 'watchdog.js')], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => {});
    child.unref();
    log('watchdog: spawned');
  } catch {
    /* the watchdog is best-effort */
  }
}

async function play() {
  const token = actionToken();
  log(`action=play token=${token}`);
  if (isDisabled()) {
    log('play: disabled flag set, skipping');
    return;
  }
  recordIntent(token, 'play');
  const t0 = Date.now();
  recordActivity();
  let wasHalted = true;
  const live = await timed('alive-check', () => alive());
  if (live) {
    wasHalted = (await isHalted()) !== false;
    log(`play: player already alive, resuming (wasHalted=${wasHalted})`);
  } else {
    log('play: no live player, COLD START');
    if (!(await timed('cold-start', () => start(source(), volume())))) {
      log(`play: player did not come up (total ${Date.now() - t0}ms)`);
      return;
    }
  }
  // A newer pause may have landed while we were starting/checking: bail before
  // making a sound so a late play never overrides a more recent pause.
  if (superseded(token)) {
    log('play: superseded by a newer event, not resuming');
    return;
  }
  if (wasHalted) {
    // Real halted->playing transition. Come back already audible (start at
    // half the target so sound returns on the first frame) then ramp up.
    const target = targetVolume();
    await send(ipcPath(), { command: ['set_property', 'mute', false] });
    await send(ipcPath(), { command: ['set_property', 'pause', false] });
    const finished = await timed('fade-in', () => fade(Math.round(target / 2), target, token));
    if (!finished) {
      // A pause superseded us mid fade-in: undo the un-mute.
      await send(ipcPath(), { command: ['set_property', 'mute', true] });
      log('play: superseded mid fade-in, re-muted');
    }
  } else if (adaptiveEnabled()) {
    // Already playing: nudge the volume toward the current intensity so the
    // music swells and eases with how hard the agent is working.
    await send(ipcPath(), { command: ['set_property', 'volume', targetVolume()] });
  }
  log(`play: done in ${Date.now() - t0}ms`);
  ensureWatchdog();
}

// Quick fade from the current volume down to 0, then leave it at 0.
async function fadeOut() {
  const cur = await getProp('volume');
  if (typeof cur === 'number' && cur > 0) await fade(cur, 0);
}

async function pause() {
  const token = actionToken();
  const t0 = Date.now();
  log(`action=pause token=${token}`);
  recordIntent(token, 'pause');
  const live = await timed('alive-check', () => alive());
  if (!live) {
    log('pause: no live player, nothing to do');
    return;
  }
  // Soft pause: mute at once (mpv's mute is click-free) so the music stops the
  // instant Claude asks, and keep the stream flowing so the next play is
  // immediate. The watchdog hard-pauses after the idle timeout.
  await send(ipcPath(), { command: ['set_property', 'mute', true] });
  log(`pause: done in ${Date.now() - t0}ms`);
  ensureWatchdog();
}

// Fully stop the stream (watchdog, after long idle): mute AND hard-pause.
async function hardPause() {
  if (!(await alive())) return;
  if ((await isHalted()) === false) {
    await fadeOut();
  }
  await send(ipcPath(), { command: ['set_property', 'mute', true] });
  await send(ipcPath(), { command: ['set_property', 'pause', true] });
}

// URL of the station currently selected via `radio`/`next`, or null.
function currentStation() {
  try {
    return fs.readFileSync(stationFile(), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

// Switch to `url` live (loadfile) if a player is up, else cold-start on it, and
// remember it so hook-triggered plays keep the same station.
async function applyStation(url) {
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(stationFile(), url);
  recordActivity();
  if (await alive()) {
    await send(ipcPath(), { command: ['loadfile', url] });
    await send(ipcPath(), { command: ['set_property', 'volume', 0] });
    await send(ipcPath(), { command: ['set_property', 'mute', false] });
    await send(ipcPath(), { command: ['set_property', 'pause', false] });
    await fadeTo(targetVolume());
  } else {
    await start(url, targetVolume());
    await send(ipcPath(), { command: ['set_property', 'mute', false] });
    await send(ipcPath(), { command: ['set_property', 'pause', false] });
  }
  ensureWatchdog();
}

async function radio(vibe) {
  const url = stations.resolve(vibe);
  if (!url) return; // unknown vibe: the command file lists the options
  await applyStation(url);
}

// Cycle to the next station in the carousel.
async function next() {
  const url = stations.nextStation(currentStation());
  if (url) await applyStation(url);
}

// Set the base volume. `arg` is 'up', 'down', or a number 0-100. Persists it
// and applies it live if a player is up.
async function setVolume(arg) {
  const base = volume();
  let v;
  if (arg === 'up') v = base + 10;
  else if (arg === 'down') v = base - 10;
  else {
    const n = parseInt(arg, 10);
    if (Number.isNaN(n)) return;
    v = n;
  }
  v = Math.max(0, Math.min(100, v));
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(volumeFile(), String(v));
  if (await alive()) {
    await send(ipcPath(), { command: ['set_property', 'volume', v] });
  }
  log(`volume: ${v}`);
}

async function status() {
  if (isDisabled()) return '';
  const halted = await isHalted();
  if (halted === null) return '';
  return halted ? '❚❚' : '►';
}

async function track() {
  if (isDisabled()) return '';
  const reply = await send(ipcPath(), { command: ['get_property', 'media-title'] });
  if (!reply || reply.error !== 'success' || !reply.data) return '';
  return String(reply.data).replace(/\s+/g, ' ').trim().slice(0, 48);
}

// Friendly name of the station currently selected via `radio`, e.g.
// "Groove Salad · SomaFM". Null when on the bundled default or an unknown
// source. Used by the statusline as an instant label before the live title.
function stationLabel() {
  try {
    return stations.label(fs.readFileSync(stationFile(), 'utf8').trim());
  } catch {
    return null;
  }
}

// Equalizer colour theme of the current station (null = statusline default).
function stationTheme() {
  try {
    return stations.theme(fs.readFileSync(stationFile(), 'utf8').trim());
  } catch {
    return null;
  }
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
  hardPause,
  radio,
  next,
  setVolume,
  status,
  track,
  on,
  off,
  activityLevel,
  lastActivityMs,
  adaptiveVolume,
  stationLabel,
  stationTheme,
  stationNames: stations.names,
};

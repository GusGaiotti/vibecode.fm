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
  attentionFile,
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
    const ev = process.env.VIBECODE_EVENT || '-';
    fs.appendFileSync(logFile(), `${time} [${ev}] ${message}\n`);
  } catch {
    /* logging must never break anything */
  }
}

// Log the player's audio state alongside a message (debug only — the extra
// IPC calls aren't free).
async function logAudio(message) {
  if (!debugEnabled()) return;
  const mute = await getProp('mute');
  const paused = await getProp('pause');
  const idle = await getProp('core-idle');
  log(`${message} | audio mute=${mute} pause=${paused} core-idle=${idle}`);
}

// ---- Intent serialization ----------------------------------------------------
// Each play/pause carries a token stamped when its hook fired; the newest one
// wins, so a slow event can't override a more recent one.
function actionToken() {
  return Number(process.env.VIBECODE_TOKEN) || Date.now();
}

// Record the intent, but never regress to an older token.
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

// ---- Attention (mid-turn "your call") ----------------------------------------
// A permission prompt/question flags "your call" for the statusline without
// pausing (pausing there would silence whatever runs next). Play/pause clear it.
function setAttention() {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(attentionFile(), String(Date.now()));
  } catch {
    /* best-effort */
  }
}

function clearAttention() {
  try {
    fs.unlinkSync(attentionFile());
  } catch {
    /* already clear */
  }
}

// True while a recent Notification is unanswered (capped so a stale flag can't
// stick forever).
function attentionActive() {
  try {
    return Date.now() - Number(fs.readFileSync(attentionFile(), 'utf8').trim()) < 600000;
  } catch {
    return false;
  }
}

async function attention() {
  const token = actionToken();
  await logAudio(`ATTENTION set token=${token} (keeping music playing)`);
  setAttention();
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

// Halted = paused OR muted. Pausing mutes (a soft pause) to keep the stream
// warm for an instant resume; a real mpv pause is left to hardPause.
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

// 0..1 — how busy the agent has been recently. Drives the sprite speed/colour.
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

const WATCHDOG_FRESH_MS = 45000; // heartbeat older than this = watchdog is gone

// Lazily spawn the janitor that stops a player left running with no activity.
// The heartbeat check keeps it a single instance.
function ensureWatchdog() {
  if (process.env.VIBECODE_NO_WATCHDOG) return;
  try {
    if (Date.now() - fs.statSync(watchdogFile()).mtimeMs < WATCHDOG_FRESH_MS) return;
  } catch {
    /* no heartbeat yet: spawn one */
  }
  try {
    // Don't leak this hook's one-shot token/event into the long-lived watchdog.
    const env = { ...process.env };
    delete env.VIBECODE_TOKEN;
    delete env.VIBECODE_EVENT;
    const child = spawn(process.execPath, [path.join(__dirname, 'watchdog.js')], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env,
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
  await logAudio(`PLAY start token=${token}`);
  if (isDisabled()) {
    log('PLAY skip: disabled flag set');
    return;
  }
  clearAttention(); // Claude is working again
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
  // A newer pause landed while we were starting up: bail before making a sound.
  if (superseded(token)) {
    log('play: superseded by a newer event, not resuming');
    return;
  }
  if (wasHalted) {
    // Come back already audible (start at half volume) then ramp up.
    const target = targetVolume();
    await send(ipcPath(), { command: ['set_property', 'mute', false] });
    await send(ipcPath(), { command: ['set_property', 'pause', false] });
    // Stale stream (empty cache)? Reconnect fresh (~1s) instead of waiting on
    // mpv's own slow recovery.
    const cache = await getProp('demuxer-cache-time');
    if (!(typeof cache === 'number' && cache > 1)) {
      log(`play: cache empty (${cache}), reconnecting fresh`);
      await send(ipcPath(), { command: ['loadfile', source()] });
      await send(ipcPath(), { command: ['set_property', 'mute', false] });
      await send(ipcPath(), { command: ['set_property', 'pause', false] });
    }
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
  await logAudio(`PLAY done in ${Date.now() - t0}ms`);
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
  await logAudio(`PAUSE start token=${token}`);
  clearAttention(); // it's the user's turn now, not a mid-turn prompt
  recordIntent(token, 'pause');
  const live = await timed('alive-check', () => alive());
  if (!live) {
    log('PAUSE skip: no live player');
    return;
  }
  // Soft pause: mute at once (click-free) and keep the stream flowing so the
  // next play is instant.
  await send(ipcPath(), { command: ['set_property', 'mute', true] });
  await logAudio(`PAUSE done in ${Date.now() - t0}ms`);
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
  attention,
  attentionActive,
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

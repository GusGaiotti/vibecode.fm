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
  noFocusFlag,
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
const ACTIVITY_MAX = 6;

function log(message) {
  if (!debugEnabled()) return;
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    const time = new Date().toISOString().slice(11, 23);
    const ev = process.env.VIBECODE_EVENT || '-';
    fs.appendFileSync(logFile(), `${time} [${ev}] ${message}\n`);
  } catch {
  }
}

async function logAudio(message) {
  if (!debugEnabled()) return;
  const mute = await getProp('mute');
  const paused = await getProp('pause');
  const idle = await getProp('core-idle');
  log(`${message} | audio mute=${mute} pause=${paused} core-idle=${idle}`);
}

function actionToken() {
  return Number(process.env.VIBECODE_TOKEN) || Date.now();
}

function recordIntent(token, action) {
  try {
    if (token < latestToken()) return;
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(intentFile(), `${token} ${action}`);
  } catch {
  }
}

function latestToken() {
  try {
    return Number(fs.readFileSync(intentFile(), 'utf8').trim().split(' ')[0]) || 0;
  } catch {
    return 0;
  }
}

function superseded(token) {
  return latestToken() > token;
}

async function timed(label, fn) {
  const t0 = Date.now();
  const result = await fn();
  log(`  ${label}: ${Date.now() - t0}ms`);
  return result;
}

function volume() {
  try {
    const saved = Number(fs.readFileSync(volumeFile(), 'utf8').trim());
    if (Number.isFinite(saved)) return saved;
  } catch {
  }
  return Number(process.env.VIBECODE_VOLUME) || 70;
}
const isDisabled = () => fs.existsSync(disabledFlag());

const focusOn = () => !fs.existsSync(noFocusFlag());

const ADAPTIVE_SPREAD = 15;

function adaptiveVolume(base, level) {
  const v = Math.round(base - ADAPTIVE_SPREAD + 2 * ADAPTIVE_SPREAD * level);
  return Math.max(0, Math.min(100, v));
}

function adaptiveEnabled() {
  const v = String(process.env.VIBECODE_ADAPTIVE || '').toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(v);
}

function targetVolume() {
  const base = volume();
  if (!adaptiveEnabled()) return base;
  return adaptiveVolume(base, activityLevel());
}

function source() {
  if (process.env.VIBECODE_SOURCE) return process.env.VIBECODE_SOURCE;
  try {
    const saved = fs.readFileSync(stationFile(), 'utf8').trim();
    if (saved) return saved;
  } catch {
  }
  return defaultSource();
}

async function getProp(name) {
  const reply = await send(ipcPath(), { command: ['get_property', name] });
  if (!reply || reply.error !== 'success') return null;
  return reply.data;
}

async function isHalted() {
  const paused = await getProp('pause');
  if (paused === null) return null;
  if (paused) return true;
  return (await getProp('mute')) === true;
}

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
    }
    stamps.push(now);
    fs.writeFileSync(activityFile(), stamps.join('\n'));
  } catch {
  }
}

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

const WATCHDOG_FRESH_MS = 45000;

function ensureWatchdog() {
  if (process.env.VIBECODE_NO_WATCHDOG) return;
  try {
    if (Date.now() - fs.statSync(watchdogFile()).mtimeMs < WATCHDOG_FRESH_MS) return;
  } catch {
  }
  try {
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
  }
}

async function play() {
  const token = actionToken();
  await logAudio(`PLAY start token=${token}`);
  if (isDisabled()) {
    log('PLAY skip: disabled flag set');
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
  if (superseded(token)) {
    log('play: superseded by a newer event, not resuming');
    return;
  }
  if (wasHalted) {
    const target = targetVolume();
    await send(ipcPath(), { command: ['set_property', 'mute', false] });
    await send(ipcPath(), { command: ['set_property', 'pause', false] });
    const cache = await getProp('demuxer-cache-time');
    if (!(typeof cache === 'number' && cache > 1)) {
      log(`play: cache empty (${cache}), reconnecting fresh`);
      await send(ipcPath(), { command: ['loadfile', source()] });
      await send(ipcPath(), { command: ['set_property', 'mute', false] });
      await send(ipcPath(), { command: ['set_property', 'pause', false] });
    }
    const finished = await timed('fade-in', () => fade(Math.round(target / 2), target, token));
    if (!finished) {
      await send(ipcPath(), { command: ['set_property', 'mute', true] });
      log('play: superseded mid fade-in, re-muted');
    }
  } else if (adaptiveEnabled()) {
    await send(ipcPath(), { command: ['set_property', 'volume', targetVolume()] });
  }
  await logAudio(`PLAY done in ${Date.now() - t0}ms`);
  ensureWatchdog();
}

async function fadeOut() {
  const cur = await getProp('volume');
  if (typeof cur === 'number' && cur > 0) await fade(cur, 0);
}

async function pause() {
  const token = actionToken();
  const t0 = Date.now();
  await logAudio(`PAUSE start token=${token}`);
  if (!focusOn()) {
    log('PAUSE skip: focus mode off (music plays continuously)');
    return;
  }
  recordIntent(token, 'pause');
  const live = await timed('alive-check', () => alive());
  if (!live) {
    log('PAUSE skip: no live player');
    return;
  }
  await send(ipcPath(), { command: ['set_property', 'mute', true] });
  await logAudio(`PAUSE done in ${Date.now() - t0}ms`);
  ensureWatchdog();
}

async function hardPause() {
  if (!(await alive())) return;
  if ((await isHalted()) === false) {
    await fadeOut();
  }
  await send(ipcPath(), { command: ['set_property', 'mute', true] });
  await send(ipcPath(), { command: ['set_property', 'pause', true] });
}

function currentStation() {
  try {
    return fs.readFileSync(stationFile(), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

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
  if (!url) return;
  await applyStation(url);
}

async function next() {
  const url = stations.nextStation(currentStation());
  if (url) await applyStation(url);
}

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
  return String(reply.data)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f\x9b]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

function stationLabel() {
  try {
    return stations.label(fs.readFileSync(stationFile(), 'utf8').trim());
  } catch {
    return null;
  }
}

function stationTheme() {
  try {
    return stations.theme(fs.readFileSync(stationFile(), 'utf8').trim());
  } catch {
    return null;
  }
}

async function focus(arg) {
  fs.mkdirSync(stateDir(), { recursive: true });
  if (arg === 'off') {
    fs.writeFileSync(noFocusFlag(), '');
    log('focus: off');
    await play();
  } else {
    try {
      fs.unlinkSync(noFocusFlag());
    } catch {
    }
    log('focus: on');
  }
}

function dance() {
  const dancers = [
    ['ヽ(⌐■_■)ノ♪', '♪ヽ(■_■⌐)ノ', 'ヽ(⌐■_■)ノ♬'],
    ['♪┏(・o・)┛', '┗(・o・)┓♪', '♪┏(・o・)┛'],
    ['(♪)┏(＾0＾)┛', '┗(＾0＾)┓(♫)', '(♬)┏(＾0＾)┛'],
    ['⟨♪⟩ ᕕ( ᐛ )ᕗ', 'ᕕ( ᐛ )ᕗ ⟨♫⟩', '⟨♬⟩ ᕕ( ᐛ )ᕗ'],
  ];
  const crew = dancers[Math.floor(Math.random() * dancers.length)];
  const label = stationLabel() || 'vibecode.fm';
  return `\n   ${crew.join('   ')}\n\n   dancing to ${label} — keep coding ♪\n`;
}

function on() {
  log('action=on');
  try {
    fs.unlinkSync(disabledFlag());
  } catch {
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
  focus,
  dance,
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

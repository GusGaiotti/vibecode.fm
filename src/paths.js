'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// A stable per-user id for namespacing the socket/pipe and state dir.
function userId() {
  if (typeof process.getuid === 'function') return String(process.getuid());
  return process.env.USERNAME || process.env.USER || 'user';
}

// Directory for state files (disabled flag, debug log). Always a real dir.
function stateDir() {
  if (process.env.VIBECODE_STATE_DIR) return process.env.VIBECODE_STATE_DIR;
  const base = process.env.XDG_RUNTIME_DIR || os.tmpdir();
  return path.join(base, `vibecode-fm-${userId()}`);
}

// Where mpv exposes its JSON IPC. A named pipe on Windows, a socket file on Unix.
function ipcPath() {
  if (process.env.VIBECODE_IPC_PATH) return process.env.VIBECODE_IPC_PATH;
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\vibecode-fm-${userId()}`;
  }
  return path.join(stateDir(), 'mpv.sock');
}

function disabledFlag() {
  return path.join(stateDir(), 'disabled');
}

// Present = focus mode is OFF, i.e. the music plays continuously and never
// pauses when it's your turn (`/focus off`).
function noFocusFlag() {
  return path.join(stateDir(), 'nofocus');
}

function logFile() {
  return process.env.VIBECODE_LOG || path.join(stateDir(), 'vibecode.log');
}

// Debug logging is on when VIBECODE_DEBUG is set OR a `debug` flag file exists
// in the state dir. The flag lets a running session start logging without the
// hooks inheriting a new env var (which would need a restart).
function debugEnabled() {
  if (process.env.VIBECODE_DEBUG) return true;
  try {
    return fs.existsSync(path.join(stateDir(), 'debug'));
  } catch {
    return false;
  }
}

function mpvLogFile() {
  return path.join(stateDir(), 'mpv.log');
}

// Chosen station (set by `radio`), so hook-triggered plays keep the same one.
function stationFile() {
  return path.join(stateDir(), 'station');
}

// Base volume chosen via `/volume`, persisted so hook-triggered plays keep it.
function volumeFile() {
  return path.join(stateDir(), 'volume');
}

// Latest play/pause intent (a token + action). Serializes racing hook events
// so the newest one always wins and a late play can't undo a pause.
function intentFile() {
  return path.join(stateDir(), 'intent');
}

// Set (with a timestamp) while Claude is waiting on the user mid-turn — a
// permission prompt or a question (Notification). The statusline reads it to
// show a "your call" signal without pausing the music.
function attentionFile() {
  return path.join(stateDir(), 'attention');
}

// Rolling log of play events, used to gauge how hard the agent is working.
function activityFile() {
  return path.join(stateDir(), 'activity');
}

// Heartbeat of the idle watchdog (safety net that pauses playback when a turn
// ends without a Stop hook — API errors, spend-limit aborts, Ctrl+C).
function watchdogFile() {
  return path.join(stateDir(), 'watchdog');
}

// Default audio source: the bundled playlist, resolved from the package root.
function defaultSource() {
  return path.join(__dirname, '..', 'playlists', 'default.m3u');
}

module.exports = {
  stateDir,
  ipcPath,
  disabledFlag,
  noFocusFlag,
  logFile,
  debugEnabled,
  mpvLogFile,
  stationFile,
  volumeFile,
  intentFile,
  attentionFile,
  activityFile,
  watchdogFile,
  defaultSource,
};

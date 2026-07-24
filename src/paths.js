'use strict';

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

function logFile() {
  return process.env.VIBECODE_LOG || path.join(stateDir(), 'vibecode.log');
}

function mpvLogFile() {
  return path.join(stateDir(), 'mpv.log');
}

// Chosen station (set by `radio`), so hook-triggered plays keep the same one.
function stationFile() {
  return path.join(stateDir(), 'station');
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
  logFile,
  mpvLogFile,
  stationFile,
  activityFile,
  watchdogFile,
  defaultSource,
};

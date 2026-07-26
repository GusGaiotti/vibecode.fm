'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function userId() {
  if (typeof process.getuid === 'function') return String(process.getuid());
  return process.env.USERNAME || process.env.USER || 'user';
}

function stateDir() {
  if (process.env.VIBECODE_STATE_DIR) return process.env.VIBECODE_STATE_DIR;
  const base = process.env.XDG_RUNTIME_DIR || os.tmpdir();
  return path.join(base, `vibecode-fm-${userId()}`);
}

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

function noFocusFlag() {
  return path.join(stateDir(), 'nofocus');
}

function logFile() {
  return process.env.VIBECODE_LOG || path.join(stateDir(), 'vibecode.log');
}

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

function stationFile() {
  return path.join(stateDir(), 'station');
}

function volumeFile() {
  return path.join(stateDir(), 'volume');
}

function intentFile() {
  return path.join(stateDir(), 'intent');
}

function activityFile() {
  return path.join(stateDir(), 'activity');
}

function watchdogFile() {
  return path.join(stateDir(), 'watchdog');
}

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
  activityFile,
  watchdogFile,
  defaultSource,
};

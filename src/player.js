'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const { send } = require('./ipc');
const { ipcPath, stateDir, mpvLogFile } = require('./paths');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mpvBin() {
  // spawn() resolves mpv.exe via PATHEXT on Windows.
  return process.env.VIBECODE_MPV_BIN || 'mpv';
}

// Is a player behind the socket/pipe and responding?
async function alive() {
  const reply = await send(ipcPath(), { command: ['get_property', 'mpv-version'] });
  return !!(reply && reply.error === 'success');
}

function buildArgs(source, volume) {
  const args = [
    '--no-video',
    '--no-terminal',
    '--really-quiet',
    '--idle=yes',
    '--keep-open=yes',
    '--loop-playlist=inf',
    '--network-timeout=30',
    `--volume=${volume}`,
    '--pause',
    `--input-ipc-server=${ipcPath()}`,
  ];
  if (process.env.VIBECODE_DEBUG) {
    args.push(`--log-file=${mpvLogFile()}`, '--msg-level=all=info');
  }
  // Environment-specific flags, e.g. VIBECODE_MPV_ARGS="--ao=pulse" on WSL.
  if (process.env.VIBECODE_MPV_ARGS) {
    for (const flag of process.env.VIBECODE_MPV_ARGS.split(/\s+/)) {
      if (flag) args.push(flag);
    }
  }
  args.push(source);
  return args;
}

// Launch mpv detached so it outlives the hook process, then wait for the
// socket to come up. Returns true once the player answers, false otherwise.
async function start(source, volume) {
  // On Unix a stale socket file blocks the new server; clear it first.
  if (process.platform !== 'win32') {
    try {
      fs.unlinkSync(ipcPath());
    } catch {
      /* nothing to remove */
    }
  }
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    const child = spawn(mpvBin(), buildArgs(source, volume), {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    // mpv missing (ENOENT) surfaces here; swallow so nothing crashes.
    child.on('error', () => {});
    child.unref();
  } catch {
    return false;
  }

  for (let i = 0; i < 30; i += 1) {
    if (await alive()) return true;
    await sleep(100);
  }
  return false;
}

module.exports = { alive, start, mpvBin };

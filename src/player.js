'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { send } = require('./ipc');
const { ipcPath, stateDir, mpvLogFile, logFile, debugEnabled } = require('./paths');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(message) {
  if (!debugEnabled()) return;
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    const time = new Date().toISOString().slice(11, 23);
    fs.appendFileSync(logFile(), `${time} pid=${process.pid} ${message}\n`);
  } catch {
    /* logging must never break anything */
  }
}

// Wait for the player behind the socket/pipe to answer, up to ~3s.
async function waitAlive() {
  for (let i = 0; i < 30; i += 1) {
    if (await alive()) {
      log(`  waitAlive: socket up after ${i * 100}ms`);
      return true;
    }
    await sleep(100);
  }
  log('  waitAlive: TIMED OUT after 3000ms');
  return false;
}

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
    '--network-timeout=15',
    // Radio streams drop or end prematurely now and then; reconnect the HTTP
    // stream transparently (even at EOF) instead of stalling, so a blip
    // recovers in a second or two rather than leaving a long silent gap.
    '--stream-lavf-o=reconnect=1,reconnect_at_eof=1,reconnect_streamed=1,reconnect_on_network_error=1,reconnect_delay_max=2',
    // A generous demuxer cache keeps audio flowing over a brief reconnect.
    '--cache=yes',
    '--demuxer-max-bytes=32MiB',
    '--demuxer-readahead-secs=30',
    `--volume=${volume}`,
    '--pause',
    `--input-ipc-server=${ipcPath()}`,
  ];
  if (debugEnabled()) {
    args.push(`--log-file=${mpvLogFile()}`, '--msg-level=all=status');
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
// Hooks run in parallel, so a lock file keeps two of them from racing a
// second mpv into existence (the loser just waits for the winner's player).
async function start(source, volume) {
  const lockFile = path.join(stateDir(), 'starting');
  try {
    if (Date.now() - fs.statSync(lockFile).mtimeMs < 10000) {
      return waitAlive();
    }
  } catch {
    /* no fresh lock: we are the starter */
  }
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(lockFile, String(process.pid));
  } catch {
    /* locking is best-effort */
  }

  // On Unix a stale socket file blocks the new server; clear it first.
  if (process.platform !== 'win32') {
    try {
      fs.unlinkSync(ipcPath());
    } catch {
      /* nothing to remove */
    }
  }
  try {
    log(`  start: spawning mpv (${mpvBin()}) source=${source}`);
    const child = spawn(mpvBin(), buildArgs(source, volume), {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    // mpv missing (ENOENT) surfaces here; swallow so nothing crashes.
    child.on('error', (e) => log(`  start: spawn error ${e && e.code}`));
    child.unref();
    return await waitAlive();
  } catch {
    return false;
  } finally {
    try {
      fs.unlinkSync(lockFile);
    } catch {
      /* already gone */
    }
  }
}

module.exports = { alive, start, mpvBin };

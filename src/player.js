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
  }
}

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
  return process.env.VIBECODE_MPV_BIN || 'mpv';
}

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
    '--stream-lavf-o=reconnect=1,reconnect_at_eof=1,reconnect_streamed=1,reconnect_on_network_error=1,reconnect_delay_max=2',
    '--cache=yes',
    '--demuxer-max-bytes=1MiB',
    '--demuxer-readahead-secs=20',
    '--audio-stream-silence=yes',
    '--audio-wait-open=1',
    `--volume=${volume}`,
    '--pause',
    `--input-ipc-server=${ipcPath()}`,
  ];
  if (debugEnabled()) {
    args.push(`--log-file=${mpvLogFile()}`, '--msg-level=all=status');
  }
  if (process.env.VIBECODE_MPV_ARGS) {
    for (const flag of process.env.VIBECODE_MPV_ARGS.split(/\s+/)) {
      if (flag) args.push(flag);
    }
  }
  args.push(source);
  return args;
}

async function start(source, volume) {
  const lockFile = path.join(stateDir(), 'starting');
  try {
    if (Date.now() - fs.statSync(lockFile).mtimeMs < 10000) {
      return waitAlive();
    }
  } catch {
  }
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(lockFile, String(process.pid));
  } catch {
  }

  if (process.platform !== 'win32') {
    try {
      fs.unlinkSync(ipcPath());
    } catch {
    }
  }
  try {
    log(`  start: spawning mpv (${mpvBin()}) source=${source}`);
    const child = spawn(mpvBin(), buildArgs(source, volume), {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', (e) => log(`  start: spawn error ${e && e.code}`));
    child.unref();
    return await waitAlive();
  } catch {
    return false;
  } finally {
    try {
      fs.unlinkSync(lockFile);
    } catch {
    }
  }
}

module.exports = { alive, start, mpvBin };

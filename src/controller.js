'use strict';

const fs = require('fs');
const { send } = require('./ipc');
const { alive, start } = require('./player');
const {
  ipcPath,
  stateDir,
  disabledFlag,
  logFile,
  defaultSource,
} = require('./paths');

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

const source = () => process.env.VIBECODE_SOURCE || defaultSource();
const volume = () => process.env.VIBECODE_VOLUME || '70';
const isDisabled = () => fs.existsSync(disabledFlag());

async function play() {
  log('action=play');
  if (isDisabled()) {
    log('play: disabled flag set, skipping');
    return;
  }
  if (await alive()) {
    log('play: player already alive, resuming');
  } else {
    log('play: no live player, starting one');
    const ok = await start(source(), volume());
    if (!ok) {
      log('play: player did not come up');
      return;
    }
  }
  await send(ipcPath(), { command: ['set_property', 'pause', false] });
}

async function pause() {
  log('action=pause');
  if (!(await alive())) {
    log('pause: no live player, nothing to do');
    return;
  }
  await send(ipcPath(), { command: ['set_property', 'pause', true] });
}

async function status() {
  if (isDisabled()) return '';
  const reply = await send(ipcPath(), { command: ['get_property', 'pause'] });
  if (!reply || reply.error !== 'success') return '';
  // Flat geometric glyphs, not the ▶️/⏸️ emoji, so terminals render them plain.
  return reply.data ? '❚❚' : '►';
}

async function track() {
  if (isDisabled()) return '';
  const reply = await send(ipcPath(), { command: ['get_property', 'media-title'] });
  if (!reply || reply.error !== 'success' || !reply.data) return '';
  return String(reply.data).replace(/\s+/g, ' ').trim().slice(0, 48);
}

function on() {
  log('action=on');
  // Only lift the flag; playback resumes on the next agent event.
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

module.exports = { play, pause, status, track, on, off };

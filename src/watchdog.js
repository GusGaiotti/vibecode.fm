#!/usr/bin/env node
'use strict';

const fs = require('fs');
const controller = require('./controller');
const { stateDir, watchdogFile, logFile, debugEnabled } = require('./paths');

const TICK_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(message) {
  if (!debugEnabled()) return;
  try {
    const time = new Date().toISOString().slice(11, 19);
    fs.appendFileSync(logFile(), `${time} pid=${process.pid} watchdog: ${message}\n`);
  } catch {
  }
}

function idleTimeoutMs() {
  const seconds = Number(process.env.VIBECODE_IDLE_TIMEOUT);
  return (seconds > 0 ? seconds : 600) * 1000;
}

function abandoned(idleMs, limitMs) {
  return idleMs >= limitMs;
}

function beat() {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(watchdogFile(), String(process.pid));
  } catch {
  }
}

function cleanup() {
  try {
    fs.unlinkSync(watchdogFile());
  } catch {
  }
}

async function run() {
  log(`started (timeout ${idleTimeoutMs() / 1000}s)`);
  for (;;) {
    beat();
    await sleep(TICK_MS);
    const status = await controller.status();
    if (status === '') {
      log('player gone, exiting');
      return cleanup();
    }
    const idleMs = Date.now() - controller.lastActivityMs();
    if (abandoned(idleMs, idleTimeoutMs())) {
      log(`abandoned ${Math.round(idleMs / 1000)}s, stopping`);
      await controller.hardPause();
      return cleanup();
    }
  }
}

module.exports = { abandoned, TICK_MS };

if (require.main === module) {
  run().catch(() => cleanup());
}

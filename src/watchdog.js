#!/usr/bin/env node
'use strict';

// Idle watchdog — the safety net for turns that die without a Stop hook.
//
// Claude Code only fires Stop on a normal end of turn. An API error, a
// spend-limit abort or a Ctrl+C kills the turn silently, so nothing tells the
// player to pause and the music plays on forever. This tiny detached process
// (spawned lazily by the controller on play) watches the stream of play
// events: once none has arrived for VIBECODE_IDLE_TIMEOUT seconds (default
// 120) while the player is unpaused, it fades the music out and exits. The
// next play event simply respawns it.
//
// Single instance: it writes a heartbeat file every tick; the controller only
// spawns a new watchdog when the heartbeat has gone stale.

const fs = require('fs');
const controller = require('./controller');
const { stateDir, watchdogFile, logFile } = require('./paths');

const TICK_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(message) {
  if (!process.env.VIBECODE_DEBUG) return;
  try {
    const time = new Date().toISOString().slice(11, 19);
    fs.appendFileSync(logFile(), `${time} pid=${process.pid} watchdog: ${message}\n`);
  } catch {
    /* logging must never break anything */
  }
}

function idleTimeoutMs() {
  const seconds = Number(process.env.VIBECODE_IDLE_TIMEOUT);
  return (seconds > 0 ? seconds : 120) * 1000;
}

// Pure decision, unit-tested: pause only while playing with no recent events.
function shouldPause(status, idleMs, limitMs) {
  return status === '►' && idleMs >= limitMs;
}

function beat() {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(watchdogFile(), String(process.pid));
  } catch {
    /* best-effort */
  }
}

function cleanup() {
  try {
    fs.unlinkSync(watchdogFile());
  } catch {
    /* already gone */
  }
}

async function run() {
  log(`started (timeout ${idleTimeoutMs() / 1000}s)`);
  for (;;) {
    beat();
    await sleep(TICK_MS);
    const status = await controller.status();
    if (status === '') {
      // Player gone (or plugin disabled, which also kills the player).
      log('player gone, exiting');
      return cleanup();
    }
    const idleMs = Date.now() - controller.lastActivityMs();
    if (shouldPause(status, idleMs, idleTimeoutMs())) {
      // A turn died without a Stop hook: silence AND stop the stream.
      log(`no play events for ${Math.round(idleMs / 1000)}s, pausing`);
      await controller.hardPause();
      return cleanup();
    }
    if (status === '❚❚' && idleMs >= idleTimeoutMs()) {
      // Soft-paused (muted, stream still flowing) and long idle: stop the
      // download for real. The next play respawns us.
      log('idle, stopping the stream');
      await controller.hardPause();
      return cleanup();
    }
  }
}

module.exports = { shouldPause, TICK_MS };

if (require.main === module) {
  run().catch(() => cleanup());
}

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
const { stateDir, watchdogFile, logFile, debugEnabled } = require('./paths');

const TICK_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(message) {
  if (!debugEnabled()) return;
  try {
    const time = new Date().toISOString().slice(11, 19);
    fs.appendFileSync(logFile(), `${time} pid=${process.pid} watchdog: ${message}\n`);
  } catch {
    /* logging must never break anything */
  }
}

function idleTimeoutMs() {
  const seconds = Number(process.env.VIBECODE_IDLE_TIMEOUT);
  // LONG by design. The watchdog is NOT how the music tracks Claude's state —
  // Stop/SessionEnd pause it instantly. This is only a janitor that stops a
  // player left running with no activity for a long time (a turn that ended
  // without a Stop hook, e.g. Ctrl+C or a usage limit, that the user then
  // walked away from). Long enough to never fire during real use.
  return (seconds > 0 ? seconds : 600) * 1000;
}

// Pure decision, unit-tested: a player with no activity for the whole (long)
// window has been abandoned — stop it.
function abandoned(idleMs, limitMs) {
  return idleMs >= limitMs;
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
    if (abandoned(idleMs, idleTimeoutMs())) {
      // No activity for the whole long window: the player was left running.
      // Stop it so it doesn't stream forever. The next play respawns us.
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

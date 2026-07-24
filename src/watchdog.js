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

const TICK_MS = 15000;

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
  return (seconds > 0 ? seconds : 120) * 1000;
}

// A soft-paused (muted) player keeps its stream warm so resume is instant, but
// it shouldn't download forever. Give it much longer than a live/aborted turn
// so answering a question or a permission prompt — even a slow one — still
// resumes instantly; only a truly abandoned session hits the hard pause.
const WARM_HOLD_MULTIPLIER = 8; // 8 * 120s = 16min warm before the stream stops

// Pure decision, unit-tested: hard-pause a PLAYING player that has gone idle
// (a turn that died without a Stop hook), or a MUTED one only after the much
// longer warm-hold window.
function shouldPause(status, idleMs, limitMs) {
  if (status === '►') return idleMs >= limitMs;
  if (status === '❚❚') return idleMs >= limitMs * WARM_HOLD_MULTIPLIER;
  return false;
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
      // Either a turn died playing without a Stop hook, or a muted player sat
      // idle past the warm-hold window: silence AND stop the stream for real.
      log(`idle ${Math.round(idleMs / 1000)}s (${status}), hard-pausing`);
      await controller.hardPause();
      return cleanup();
    }
  }
}

module.exports = { shouldPause, TICK_MS };

if (require.main === module) {
  run().catch(() => cleanup());
}

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

const TICK_MS = 5000;

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
  // Short by design: this is the safety net that pauses when Claude stops
  // without a Stop hook (Ctrl+C, a rejected tool, an abandoned turn). Working
  // turns keep it awake with a play event every few seconds.
  return (seconds > 0 ? seconds : 20) * 1000;
}

// A soft-paused (muted) player keeps its stream warm so resume is instant, but
// it shouldn't download forever. Give it much longer than a live/aborted turn
// so answering a question or a permission prompt — even a slow one — still
// resumes instantly; only a truly abandoned session hits the hard pause.
const ABANDON_MULTIPLIER = 15; // muted this many idle windows => stop the stream

// Pure decisions, unit-tested. A PLAYING player idle past the window means
// Claude stopped without a Stop hook (Ctrl+C, rejected tool, abandoned turn):
// soft-pause it. A MUTED player idle far longer is truly abandoned: stop the
// stream so it doesn't download forever.
function shouldSoftPause(status, idleMs, limitMs) {
  return status === '►' && idleMs >= limitMs;
}

function shouldHardStop(status, idleMs, limitMs) {
  return status === '❚❚' && idleMs >= limitMs * ABANDON_MULTIPLIER;
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
    const limit = idleTimeoutMs();
    if (shouldSoftPause(status, idleMs, limit)) {
      // Claude stopped without a Stop hook — silence, but keep the stream warm
      // so the next message resumes instantly. Keep watching.
      log(`idle ${Math.round(idleMs / 1000)}s while playing -> soft pause`);
      await controller.pause();
    } else if (shouldHardStop(status, idleMs, limit)) {
      // Muted and long abandoned: stop the download. Next play respawns us.
      log(`idle ${Math.round(idleMs / 1000)}s while muted -> stop stream`);
      await controller.hardPause();
      return cleanup();
    }
  }
}

module.exports = { shouldSoftPause, shouldHardStop, ABANDON_MULTIPLIER, TICK_MS };

if (require.main === module) {
  run().catch(() => cleanup());
}

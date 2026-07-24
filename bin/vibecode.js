#!/usr/bin/env node
'use strict';

// Entry point invoked by Claude Code hooks and the statusline.
// Contract: only `status` and `track` write to stdout; everything else is
// silent, and the process always exits 0 so a hook can never break a session.

// Hooks are BLOCKING: Claude Code waits for them before starting the turn or
// the tool. `play`/`radio` can cold-start mpv (seconds), so they re-spawn
// themselves detached and return immediately — the session never waits for a
// player boot. `pause` never cold-starts (it no-ops without a live player), so
// it runs inline: skipping the ~250ms re-spawn makes the music stop the moment
// Claude asks for your attention.
const DETACHED_ACTIONS = new Set(['play', 'radio', 'next']);

function detach() {
  const { spawn } = require('child_process');
  try {
    const child = spawn(process.execPath, [__filename, ...process.argv.slice(2)], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, VIBECODE_DIRECT: '1' },
    });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* losing one beat is better than delaying the session */
  }
}

function log(action, message) {
  const { stateDir, logFile, debugEnabled } = require('../src/paths');
  if (!debugEnabled()) return;
  try {
    const fs = require('fs');
    fs.mkdirSync(stateDir(), { recursive: true });
    const time = new Date().toISOString().slice(11, 23);
    fs.appendFileSync(logFile(), `${time} pid=${process.pid} bin[${action}] ${message}\n`);
  } catch {
    /* logging must never break anything */
  }
}

async function main() {
  const action = process.argv[2];
  // Stamp the event's order the moment the hook fires, so a detached child
  // carries the fire-time — not its later spawn time — when it competes with
  // other events. Inline actions get the same stamp at run time.
  if (!process.env.VIBECODE_TOKEN) process.env.VIBECODE_TOKEN = String(Date.now());
  if (DETACHED_ACTIONS.has(action) && !process.env.VIBECODE_DIRECT) {
    log(action, `hook fired (token ${process.env.VIBECODE_TOKEN}) -> detaching`);
    detach();
    return;
  }
  if (DETACHED_ACTIONS.has(action)) log(action, 'detached child running');
  const controller = require('../src/controller');
  switch (action) {
    case 'play':
      await controller.play();
      break;
    case 'pause':
      await controller.pause();
      break;
    case 'status':
      process.stdout.write(await controller.status());
      break;
    case 'track':
      process.stdout.write(await controller.track());
      break;
    case 'radio':
      await controller.radio(process.argv[3]);
      break;
    case 'next':
      await controller.next();
      break;
    case 'volume':
      await controller.setVolume(process.argv[3]);
      break;
    case 'on':
      controller.on();
      break;
    case 'off':
      await controller.off();
      break;
    default:
      break;
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(0));

#!/usr/bin/env node
'use strict';

// Entry point invoked by Claude Code hooks and the statusline.
// Contract: only `status` and `track` write to stdout; everything else is
// silent, and the process always exits 0 so a hook can never break a session.

// Hooks are BLOCKING: Claude Code waits for them before starting the turn or
// the tool. Player work (IPC round-trips, fades, cold starts) can take from
// hundreds of ms to seconds, so these actions re-spawn themselves detached
// and return immediately — the session never waits for the music.
const DETACHED_ACTIONS = new Set(['play', 'pause', 'radio']);

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

async function main() {
  const action = process.argv[2];
  if (DETACHED_ACTIONS.has(action) && !process.env.VIBECODE_DIRECT) {
    detach();
    return;
  }
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

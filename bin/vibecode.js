#!/usr/bin/env node
'use strict';

// Entry point invoked by Claude Code hooks and the statusline.
// Contract: only `status` and `track` write to stdout; everything else is
// silent, and the process always exits 0 so a hook can never break a session.
//
// Everything runs INLINE in the hook process. An earlier version re-spawned a
// detached child to do the work "without blocking", but on Windows that child
// could be torn down when the hook returned, so a resume never finished and the
// music stayed silent. Running inline is cheap — a resume is a couple of IPC
// calls plus a short fade, and a play while already playing is a no-op — and it
// guarantees the work completes before the hook returns. mpv itself is still
// spawned detached (in player.js) so the audio outlives the hook.

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
  // For play/pause/attention the hooks pass their event name as argv[3]
  // (UserPromptSubmit, PreToolUse, PostToolUse, Notification, Stop, SessionEnd).
  const event = process.argv[3];
  if (event) process.env.VIBECODE_EVENT = event;
  // Stamp when the hook fired so racing events serialize by real order.
  if (!process.env.VIBECODE_TOKEN) process.env.VIBECODE_TOKEN = String(Date.now());
  if (['play', 'pause', 'attention'].includes(action)) {
    log(action, `HOOK ${event || '?'} fired (token ${process.env.VIBECODE_TOKEN})`);
  }
  const controller = require('../src/controller');
  switch (action) {
    case 'play':
      await controller.play();
      break;
    case 'pause':
      await controller.pause();
      break;
    case 'attention':
      await controller.attention();
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
    case 'focus':
      await controller.focus(process.argv[3]);
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

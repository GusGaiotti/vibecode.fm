#!/usr/bin/env node
'use strict';

// Entry point invoked by Claude Code hooks and the statusline.
// Contract: only `status` and `track` write to stdout; everything else is
// silent, and the process always exits 0 so a hook can never break a session.

const controller = require('../src/controller');

async function main() {
  const action = process.argv[2];
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

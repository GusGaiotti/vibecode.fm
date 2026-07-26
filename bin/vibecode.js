#!/usr/bin/env node
'use strict';

function log(action, message) {
  const { stateDir, logFile, debugEnabled } = require('../src/paths');
  if (!debugEnabled()) return;
  try {
    const fs = require('fs');
    fs.mkdirSync(stateDir(), { recursive: true });
    const time = new Date().toISOString().slice(11, 23);
    fs.appendFileSync(logFile(), `${time} pid=${process.pid} bin[${action}] ${message}\n`);
  } catch {
  }
}

async function main() {
  const action = process.argv[2];
  const event = process.argv[3];
  if (event) process.env.VIBECODE_EVENT = event;
  if (!process.env.VIBECODE_TOKEN) process.env.VIBECODE_TOKEN = String(Date.now());
  if (['play', 'pause'].includes(action)) {
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
    case 'dance':
      process.stdout.write(controller.dance());
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

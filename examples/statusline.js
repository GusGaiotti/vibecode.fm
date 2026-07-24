#!/usr/bin/env node
'use strict';

// Example Claude Code statusline: model on the left, and on the far right the
// player state (flat ► / ❚❚ glyph), a bouncing musical note, and the track.
// Cross-platform (Windows/macOS/Linux). Point settings.json at it:
//   "statusLine": { "type": "command", "command": "node /path/to/examples/statusline.js" }

const path = require('path');
const { status, track } = require(path.join(__dirname, '..', 'src', 'controller'));

const FRAMES = ['♪', '♫', '♬'];

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    // If nothing is piped in, don't hang.
    setTimeout(() => resolve(data), 200);
  });
}

async function main() {
  const input = await readStdin();
  let model = 'Claude';
  try {
    const parsed = JSON.parse(input);
    if (parsed.model && parsed.model.display_name) model = parsed.model.display_name;
  } catch {
    /* no or bad JSON: keep default */
  }

  const icon = await status();
  let out = model;

  if (icon) {
    const title = (await track()) || 'vibecode.fm';
    let note = '';
    if (icon === '►') {
      // Advances once per second whenever the statusline repaints.
      note = `${FRAMES[Math.floor(Date.now() / 1000) % FRAMES.length]} `;
    }
    const right = `${icon} ${note}${title}`;
    const width = Number(process.env.COLUMNS) || 80;
    const pad = Math.max(1, width - model.length - right.length);
    out = `${model}${' '.repeat(pad)}${right}`;
  }

  process.stdout.write(out);
}

main().then(() => process.exit(0)).catch(() => process.exit(0));

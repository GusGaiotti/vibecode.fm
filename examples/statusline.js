#!/usr/bin/env node
'use strict';

// Example Claude Code statusline.
// - While the agent works (►): a full-width equalizer whose COLOUR tracks how
//   hard the agent is working (green = light, amber/orange = medium, red = heavy).
//   The bar heights shift each repaint to feel alive; they are not synced to the
//   audio waveform (the statusline can't repaint fast enough for that).
// - While it's your turn (❚❚): model on the left, track on the right.
// Point settings.json at it:
//   "statusLine": { "type": "command", "command": "node /path/to/examples/statusline.js" }

const path = require('path');
const controller = require(path.join(__dirname, '..', 'src', 'controller'));

const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

// Green -> yellow -> orange -> red, deliberately routed through orange so the
// mid-range transition is warm, not a hard yellow-to-red jump.
const STOPS = [
  { p: 0.0, c: [80, 200, 100] },
  { p: 0.4, c: [235, 200, 60] },
  { p: 0.7, c: [240, 140, 40] },
  { p: 1.0, c: [220, 55, 45] },
];

function colorFor(t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i += 1) {
    if (x <= STOPS[i].p) {
      const a = STOPS[i - 1];
      const b = STOPS[i];
      const k = (x - a.p) / (b.p - a.p);
      return a.c.map((ch, j) => Math.round(ch + (b.c[j] - ch) * k));
    }
  }
  return STOPS[STOPS.length - 1].c;
}

function equalizer(cols, intensity) {
  const t = Date.now() / 120;
  let bars = '';
  for (let i = 0; i < cols; i += 1) {
    const wave = (Math.sin(t * 0.7 + i * 0.6) + Math.sin(t * 1.3 + i * 0.9)) / 2;
    let h = (wave + 1) / 2; // 0..1
    h = 0.15 + 0.85 * h * (0.35 + 0.65 * intensity); // taller when busier
    bars += BLOCKS[Math.max(1, Math.min(8, 1 + Math.round(h * 7)))];
  }
  const [r, g, b] = colorFor(intensity);
  return `\x1b[38;2;${r};${g};${b}m${bars}\x1b[0m`;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
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
    /* keep default */
  }

  const width = Number(process.env.COLUMNS) || 80;
  const icon = await controller.status();
  let out = model;

  if (icon === '►') {
    const title = (await controller.track()) || 'vibecode.fm';
    const prefix = `♫ ${title} `;
    const cols = Math.max(4, width - prefix.length);
    out = prefix + equalizer(cols, controller.activityLevel());
  } else if (icon === '❚❚') {
    const title = (await controller.track()) || 'vibecode.fm';
    const right = `❚❚ ${title}`;
    const pad = Math.max(1, width - model.length - right.length);
    out = `${model}${' '.repeat(pad)}${right}`;
  }

  process.stdout.write(out);
}

main().then(() => process.exit(0)).catch(() => process.exit(0));

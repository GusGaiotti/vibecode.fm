#!/usr/bin/env node
'use strict';

// Example Claude Code statusline for vibecode.fm.
//
//   ▶ playing : icon + track/station on the left, a VU-meter equalizer in the
//               middle with musical notes drifting across it, model dimmed on
//               the right. The gradient adopts the current station's theme
//               (DEF CON = matrix green, Underground 80s = synthwave, ...).
//   ▮▮ paused : solid pause icon + track on the left, a dim "breathing" line.
//   idle      : just the model name.
//
// Honest note: the bars are NOT synced to the audio waveform — the statusline
// repaints on Claude Code's cadence (~300ms at best), far too slow for a real
// spectrum. Heights come from layered sines plus a little jitter, and the
// notes drift deterministically with time, which reads as "alive" without
// pretending to be an analyzer. Colour does carry meaning: bars glow hotter
// the taller they are, and the whole meter grows with how hard the agent is
// working (activityLevel).
//
// Point settings.json at it:
//   "statusLine": { "type": "command", "command": "node /path/to/examples/statusline.js" }

const path = require('path');
const controller = require(path.join(__dirname, '..', 'src', 'controller'));

// ---- ANSI helpers (truecolor) ------------------------------------------------
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const fg = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const paint = (s, r, g, b, bold) => `${bold ? BOLD : ''}${fg(r, g, b)}${s}${RESET}`;

// ---- Equalizer ---------------------------------------------------------------
const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const NOTES = ['♪', '♫', '♬', '♩', '✦'];

// Default VU gradient by bar height: calm teal low, hot red peaks. Stations
// with their own theme (src/stations.js) override this.
const DEFAULT_THEME = {
  stops: [
    { p: 0.0, c: [64, 208, 190] }, // teal
    { p: 0.3, c: [90, 220, 110] }, // green
    { p: 0.55, c: [232, 205, 60] }, // yellow
    { p: 0.78, c: [242, 140, 42] }, // orange
    { p: 1.0, c: [228, 60, 58] }, // red
  ],
  note: [255, 122, 194], // pink pop
};

function gradientColor(stops, t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i += 1) {
    if (x <= stops[i].p) {
      const a = stops[i - 1];
      const b = stops[i];
      const k = (x - a.p) / (b.p - a.p);
      return a.c.map((ch, j) => Math.round(ch + (b.c[j] - ch) * k));
    }
  }
  return stops[stops.length - 1].c;
}

// Note "particles" that drift smoothly across the meter (position is a pure
// function of time, so consecutive repaints slide instead of teleporting).
function notePositions(cols, intensity, t) {
  const count = Math.min(cols >> 3, 2 + Math.round(3 * intensity));
  const positions = new Map();
  for (let k = 0; k < count; k += 1) {
    const speed = 0.8 + k * 0.35; // cells per time unit, one lane per particle
    const offset = k * 37.7; // spread lanes out
    const pos = Math.floor(offset + t * speed) % cols;
    const glyph = NOTES[(k + Math.floor(t / 9)) % NOTES.length];
    positions.set((pos + cols) % cols, glyph);
  }
  return positions;
}

// Easter egg: every couple of minutes Pac-Man sweeps across the meter eating
// the bars (a nod to pacman's ILoveCandy progress bar). Pure function of time,
// so consecutive repaints show him advancing. Returns null outside a sweep.
const PACMAN_PERIOD_S = 140;
const PACMAN_SPEED = 7; // cells per second

function pacmanPosition(cols) {
  const phase = (Date.now() / 1000) % PACMAN_PERIOD_S;
  const pos = Math.floor(phase * PACMAN_SPEED);
  return pos < cols ? pos : null;
}

function equalizer(cols, intensity, theme) {
  const t = Date.now() / 110;
  const pacman = pacmanPosition(cols);
  const notes = pacman === null ? notePositions(cols, intensity, t / 4) : new Map();
  let out = '';
  for (let i = 0; i < cols; i += 1) {
    if (pacman !== null) {
      if (i === pacman) {
        out += paint('ᗧ', 255, 220, 60, true);
        continue;
      }
      if (i === pacman - 6) {
        out += paint('ᗣ', 228, 70, 60, true); // the chase is on
        continue;
      }
      if (i < pacman) {
        out += paint(i % 2 ? '·' : ' ', 88, 98, 112); // eaten trail
        continue;
      }
    }
    const note = notes.get(i);
    if (note) {
      const [r, g, b] = theme.note;
      out += paint(note, r, g, b, true);
      continue;
    }
    // Layered sines (a "spectrum" shape) plus light jitter per repaint.
    const wave =
      (Math.sin(t * 0.7 + i * 0.6) +
        Math.sin(t * 1.3 + i * 0.9) +
        (Math.random() - 0.5) * 0.4) /
      2;
    let h = (wave + 1) / 2; // 0..1
    h = 0.12 + 0.88 * h * (0.4 + 0.6 * intensity); // taller when busier
    h = Math.max(0, Math.min(1, h));
    const block = BLOCKS[Math.max(1, Math.min(8, 1 + Math.round(h * 7)))];
    const [r, g, b] = gradientColor(theme.stops, h);
    out += fg(r, g, b) + block + RESET;
  }
  return out;
}

// Slow, dim breathing line for the paused state.
function breathe(cols) {
  const t = Date.now() / 500;
  let out = '';
  for (let i = 0; i < cols; i += 1) {
    const wave = (Math.sin(t * 0.6 + i * 0.5) + 1) / 2;
    out += fg(88, 98, 112) + (wave > 0.62 ? '▂' : '▁') + RESET;
  }
  return out;
}

// ---- Layout ------------------------------------------------------------------
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    setTimeout(() => resolve(data), 200);
  });
}

// The best label to show right now: the live "Artist – Track" if it has arrived
// (a real title has spaces), otherwise the friendly station name, so the ugly
// stream slug (e.g. "groovesalad-128-mp3") never shows.
async function displayTitle() {
  const raw = await controller.track();
  if (raw && /\s/.test(raw)) return raw.slice(0, 40);
  return controller.stationLabel() || 'vibecode.fm';
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
  let out = paint(model, 150, 158, 168); // idle: just the model, dimmed

  if (icon === '►') {
    const title = await displayTitle();
    const theme = controller.stationTheme() || DEFAULT_THEME;
    const left = `▶ ${title}`;
    const mid = Math.max(6, width - left.length - model.length - 2);
    const head = paint('▶', 90, 222, 120, true) + ' ' + paint(title, 228, 232, 238, true);
    out = `${head} ${equalizer(mid, controller.activityLevel(), theme)} ${paint(model, 120, 128, 140)}`;
  } else if (icon === '❚❚') {
    const title = await displayTitle();
    const left = `▮▮ ${title}`;
    const mid = Math.max(6, width - left.length - model.length - 2);
    const head = paint('▮▮', 236, 200, 64, true) + ' ' + paint(title, 176, 182, 190);
    out = `${head} ${breathe(mid)} ${paint(model, 120, 128, 140)}`;
  }

  process.stdout.write(out);
}

main().then(() => process.exit(0)).catch(() => process.exit(0));

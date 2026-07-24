#!/usr/bin/env node
'use strict';

// Example Claude Code statusline for vibecode.fm.
//
//   ▶ playing : icon + track/station on the left, then a parade of themed
//               sprites drifting across the line with the music (flowers &
//               notes on lofi, matrix code on DEF CON, retro glyphs on
//               synthwave, ...), model dimmed on the right.
//   ▮▮ paused : solid pause icon + track, the sprites frozen and dimmed.
//   idle      : just the model name.
//
// The parade is honest eye-candy: it is NOT synced to the audio waveform (the
// statusline can't repaint fast enough). Sprites scroll and recolour purely as
// a function of time; how FAST and DENSE they move tracks how hard the agent is
// working (activityLevel), and the colours come from the current station theme.
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

// ---- Theme fallback (chill / lofi / Groove Salad and custom stations) --------
const DEFAULT_THEME = {
  stops: [
    { p: 0.0, c: [80, 210, 170] }, // teal
    { p: 0.5, c: [130, 205, 120] }, // green
    { p: 1.0, c: [240, 200, 95] }, // warm gold
  ],
  sprites: ['❀', '♪', '✿', '♫', '❁', '♬', '✧', '·'], // flowers & notes
};

function gradientColor(stops, t) {
  const x = ((t % 1) + 1) % 1;
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

// A scrolling parade of the theme's sprites. `moving` drives the animation:
// while playing they drift and recolour with time; while paused they sit still
// and dim. Density and speed rise with how busy the agent is.
function parade(cols, intensity, theme, moving) {
  const sprites = theme.sprites && theme.sprites.length ? theme.sprites : DEFAULT_THEME.sprites;
  const stops = theme.stops || DEFAULT_THEME.stops;
  const gap = moving ? Math.max(1, 3 - Math.round(intensity * 2)) : 3; // busier => denser
  const period = gap + 1;
  const speed = 2 + intensity * 7; // cells per second
  const offset = moving ? Math.floor((Date.now() / 1000) * speed) : 0;
  const flow = Date.now() / 1400;
  let out = '';
  for (let i = 0; i < cols; i += 1) {
    const pos = i + offset;
    if ((((pos % period) + period) % period) !== 0) {
      out += ' ';
      continue;
    }
    const slot = Math.floor(pos / period);
    const glyph = sprites[((slot % sprites.length) + sprites.length) % sprites.length];
    if (moving) {
      const [r, g, b] = gradientColor(stops, slot * 0.17 + flow);
      out += paint(glyph, r, g, b, true);
    } else {
      out += paint(glyph, 96, 104, 118); // frozen & dim
    }
  }
  return out;
}

// ---- Title helpers -----------------------------------------------------------
const TITLE_MAX = 34;

function marquee(text, max) {
  if (text.length <= max) return text;
  const loop = `${text}  ♪  `;
  const offset = Math.floor(Date.now() / 400) % loop.length;
  return (loop + loop).slice(offset, offset + max);
}

const MODEL_TINTS = [
  [/opus/i, [178, 140, 255]],
  [/sonnet/i, [120, 170, 255]],
  [/haiku/i, [120, 220, 150]],
  [/fable/i, [255, 200, 110]],
];

function modelColor(model) {
  for (const [re, c] of MODEL_TINTS) {
    if (re.test(model)) return c;
  }
  return [150, 158, 168];
}

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
  if (raw && /\s/.test(raw)) return raw;
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
  const [mr, mg, mb] = modelColor(model);
  let out = paint(model, mr, mg, mb); // idle: just the model, tinted

  if (icon === '►' || icon === '❚❚') {
    const moving = icon === '►';
    const theme = controller.stationTheme() || DEFAULT_THEME;
    const title = marquee(await displayTitle(), TITLE_MAX);
    const glyph = moving
      ? paint('▶', 90, 222, 120, true)
      : paint('▮▮', 236, 200, 64, true);
    const iconW = moving ? 1 : 2;
    const mid = Math.max(6, width - iconW - 1 - title.length - model.length - 2);
    const strip = parade(mid, controller.activityLevel(), theme, moving);
    const titleColor = moving ? [228, 232, 238] : [176, 182, 190];
    out = `${glyph} ${paint(title, ...titleColor, moving)} ${strip} ${paint(model, mr, mg, mb)}`;
  }

  process.stdout.write(out);
}

main().then(() => process.exit(0)).catch(() => process.exit(0));

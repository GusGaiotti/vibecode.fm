#!/usr/bin/env node
'use strict';

// Example Claude Code statusline for vibecode.fm.
//
//   ► playing : play glyph + track on the left, themed sprites drifting in from
//               both sides around a rotating splash phrase in the centre (like
//               Minecraft's splash text, but tuned to the station), model on
//               the right.
//   paused    : the centre reads "Your move!" with the sprites frozen and dim.
//   idle      : just the model name.
//
// Honest eye-candy: the sprites are NOT synced to the audio waveform. They
// scroll and recolour as a function of time; how fast/dense they move tracks
// how hard the agent is working (activityLevel), and colours + glyphs + splash
// phrases all come from the current station theme.
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
  tag: 'chill',
  stops: [
    { p: 0.0, c: [80, 210, 170] },
    { p: 0.5, c: [130, 205, 120] },
    { p: 1.0, c: [240, 200, 95] },
  ],
  sprites: ['❀', '♪', '✿', '♫', '❁', '♬', '♩', '✧'], // flowers & notes
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

// ---- Splash phrases ----------------------------------------------------------
// Programming jokes and philosophical puns, per station vibe. English, short.
const PHRASES = {
  chill: [
    'Compiling good vibes...',
    'Refactoring my feelings',
    'Lo-fi, high standards',
    'Merge conflicts of the heart',
    'while (alive) relax();',
    'git commit -m "vibes"',
  ],
  hacker: [
    'sudo make me a sandwich',
    "There's no place like 127.0.0.1",
    "It's not a bug, it's a 0-day",
    'chmod 777 your dreams',
    'The cake is a lie, root is real',
    'rm -rf /doubt',
  ],
  synthwave: [
    'Ride or die, mostly ride',
    'The future is retro',
    'Neon never dies',
    'Outrun your deadlines',
    '1985 called, it approves',
  ],
  metal: [
    'Segfault of the ancients',
    'Stack overflow of the damned',
    'kill -9 the weak',
    'Riff-driven development',
    'Compile in fire',
  ],
  jazz: [
    'Improvise your architecture',
    'Syncopated semicolons',
    'Cool as a nil pointer',
    'Blue notes, green builds',
  ],
  vaporwave: [
    'A E S T H E T I C undefined',
    'Nostalgia.exe has stopped',
    'Buy nothing, feel everything',
    'Vibes from a dead future',
  ],
  space: [
    'In space no one hears your typos',
    'Floating point in the void',
    'Lost in the async',
    'A cosmic ray flipped my bit',
  ],
  glitch: [
    "It's not a bug it's ▓ejfk",
    'Reality buffer underrun',
    '01100110 feelings',
    'Corrupt but honest',
  ],
  tavern: [
    'Roll for initiative',
    'A bard walks into a repo',
    'Quest: fix the merge',
    'Ye olde stack trace',
  ],
  goa: [
    'Consciousness not found (404)',
    'Trance-pile the universe',
    'Ego death, clean build',
    'One with the async',
  ],
  beats: ['Drop the bass, not the table', 'Flow state, git rebase', 'Bars over var'],
  indie: ["You wouldn't get this build", 'Twee-driven development', 'Heartfelt and hardcoded'],
  spy: [
    'This splash will self-destruct',
    'Shaken, not stack-traced',
    'License to kill -9',
    "The name's Null. Pointer Null.",
  ],
};

// Philosophical puns mixed into every theme.
const UNIVERSAL = [
  'I refactor, therefore I am',
  'To be, or not to be null',
  'Cogito ergo sum(array)',
  'This too shall pass tests',
  'The unexamined loop is not worth running',
];

const PHRASE_ROTATE_MS = 9000;

function pickPhrase(theme) {
  const pool = [...(PHRASES[theme.tag] || []), ...UNIVERSAL];
  const i = Math.floor(Date.now() / PHRASE_ROTATE_MS) % pool.length;
  return pool[i];
}

// ---- Sprite run --------------------------------------------------------------
// A drifting run of the theme's sprites `cols` wide. `phase` offsets the left
// and right runs so the two sides don't mirror each other.
function spriteRun(cols, intensity, theme, moving, phase) {
  if (cols <= 0) return '';
  const sprites = theme.sprites && theme.sprites.length ? theme.sprites : DEFAULT_THEME.sprites;
  const stops = theme.stops || DEFAULT_THEME.stops;
  const gap = moving ? Math.max(1, 3 - Math.round(intensity * 2)) : 3; // busier => denser
  const period = gap + 1;
  const speed = 2 + intensity * 7;
  const offset = (moving ? Math.floor((Date.now() / 1000) * speed) : 0) + phase;
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
      out += paint(glyph, 96, 104, 118);
    }
  }
  return out;
}

// ---- Title helpers -----------------------------------------------------------
const TITLE_MAX = 28;

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

async function displayTitle() {
  const raw = await controller.track();
  if (raw && /\s/.test(raw)) return raw;
  return controller.stationLabel() || 'vibecode.fm';
}

// Build the centre band: a splash phrase centred, sprites drifting in from both
// sides. Falls back to a full sprite run when there isn't room for the phrase.
function centre(width, phraseText, phraseColor, intensity, theme, moving) {
  if (width < 6) return ' '.repeat(Math.max(0, width));
  const label = `"${phraseText}"`;
  if (width >= label.length + 6) {
    const side = width - label.length - 2;
    const leftW = Math.floor(side / 2);
    const rightW = side - leftW;
    const [r, g, b] = phraseColor;
    const left = spriteRun(leftW, intensity, theme, moving, 0);
    const right = spriteRun(rightW, intensity, theme, moving, 5);
    return `${left} ${paint(label, r, g, b, true)} ${right}`;
  }
  return spriteRun(width, intensity, theme, moving, 0);
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
    const bright = gradientColor(theme.stops || DEFAULT_THEME.stops, 1);
    let head;
    let headLen;
    if (moving) {
      // ► + live track/station title.
      const title = marquee(await displayTitle(), TITLE_MAX);
      head = `${paint('►', 90, 222, 120, true)} ${paint(title, 228, 232, 238, true)}`;
      headLen = 2 + title.length; // glyph + space + title
    } else {
      // Solid pause bars + "Your move!" in place of the title.
      const label = 'Your move!';
      head = `${paint('▌▐', 236, 200, 64, true)} ${paint(label, 236, 210, 120, true)}`;
      headLen = 3 + label.length; // two bars + space + label
    }
    // The splash phrase stays in the centre in both states.
    const midW = Math.max(0, width - headLen - model.length - 2);
    const band = centre(midW, pickPhrase(theme), bright, controller.activityLevel(), theme, moving);
    out = `${head} ${band} ${paint(model, mr, mg, mb)}`;
  }

  process.stdout.write(out);
}

main().then(() => process.exit(0)).catch(() => process.exit(0));

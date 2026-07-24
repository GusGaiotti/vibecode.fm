'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

// A fake mpv: a net server on the same socket/pipe path the controller uses,
// answering the same JSON IPC commands. Lets us exercise the real controller
// end to end, identically on Windows (named pipe) and Unix (socket file).
function fakeMpv(ipcPath) {
  const state = { paused: true, muted: false, title: 'Fake FM - Test Track' };
  const server = net.createServer((sock) => {
    sock.on('error', () => {});
    sock.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue;
        const { command } = JSON.parse(line);
        const [verb, prop, value] = command;
        if (verb === 'get_property' && prop === 'mpv-version') {
          sock.write('{"data":"mpv fake","error":"success"}\n');
        } else if (verb === 'get_property' && prop === 'pause') {
          sock.write(`{"data":${state.paused},"error":"success"}\n`);
        } else if (verb === 'get_property' && prop === 'mute') {
          sock.write(`{"data":${state.muted},"error":"success"}\n`);
        } else if (verb === 'get_property' && prop === 'media-title') {
          sock.write(`{"data":${JSON.stringify(state.title)},"error":"success"}\n`);
        } else if (verb === 'set_property' && prop === 'pause') {
          state.paused = value;
          sock.write('{"error":"success"}\n');
        } else if (verb === 'set_property' && prop === 'mute') {
          state.muted = value;
          sock.write('{"error":"success"}\n');
        } else if (verb === 'quit') {
          sock.write('{"error":"success"}\n');
          server.close();
        } else {
          sock.write('{"error":"invalid"}\n');
        }
      }
    });
  });
  return { server, state };
}

let sandbox;
let controller;
let ipcPath;
let counter = 0;

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-test-'));
  process.env.VIBECODE_STATE_DIR = sandbox;
  // A unique IPC endpoint per test so runs never collide (a named pipe on
  // Windows, a socket file on Unix).
  const unique = `${process.pid}-${counter}`;
  counter += 1;
  process.env.VIBECODE_IPC_PATH =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\vibecode-test-${unique}`
      : path.join(sandbox, 'mpv.sock');
  delete process.env.VIBECODE_SOURCE;
  delete process.env.VIBECODE_DEBUG;
  // Tests must never spawn a real detached watchdog process.
  process.env.VIBECODE_NO_WATCHDOG = '1';
  // Fresh module state per test so path env is re-read.
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}src${path.sep}`)) delete require.cache[key];
  }
  controller = require('../src/controller');
  ipcPath = require('../src/paths').ipcPath();
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
  delete process.env.VIBECODE_STATE_DIR;
  delete process.env.VIBECODE_IPC_PATH;
  delete process.env.VIBECODE_NO_WATCHDOG;
  delete process.env.VIBECODE_STATIONS;
  delete process.env.VIBECODE_TOKEN;
});

function withPlayer(fn) {
  return new Promise((resolve, reject) => {
    const { server, state } = fakeMpv(ipcPath);
    server.on('error', reject);
    server.listen(ipcPath, async () => {
      try {
        await fn(state);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

test('status is empty when no player is running', async () => {
  assert.strictEqual(await controller.status(), '');
});

test('play resumes a running player and status shows the play glyph', async () => {
  await withPlayer(async (state) => {
    await controller.play();
    assert.strictEqual(state.paused, false, 'player was unpaused');
    assert.strictEqual(await controller.status(), '►');
  });
});

test('pause is a soft pause: mutes, keeps the stream flowing', async () => {
  await withPlayer(async (state) => {
    await controller.play();
    await controller.pause();
    assert.strictEqual(state.muted, true, 'muted');
    assert.strictEqual(state.paused, false, 'stream still flowing for instant resume');
    assert.strictEqual(await controller.status(), '❚❚');
    await controller.play();
    assert.strictEqual(state.muted, false, 'resume unmutes');
    assert.strictEqual(await controller.status(), '►');
  });
});

test('hardPause stops the stream for real', async () => {
  await withPlayer(async (state) => {
    await controller.play();
    await controller.hardPause();
    assert.strictEqual(state.muted, true);
    assert.strictEqual(state.paused, true, 'download stopped');
    assert.strictEqual(await controller.status(), '❚❚');
  });
});

test('track returns the media title', async () => {
  await withPlayer(async () => {
    assert.strictEqual(await controller.track(), 'Fake FM - Test Track');
  });
});

test('disabled flag suppresses play and status', async () => {
  await withPlayer(async (state) => {
    fs.writeFileSync(path.join(sandbox, 'disabled'), '');
    await controller.play();
    assert.strictEqual(state.paused, true, 'play did nothing while disabled');
    assert.strictEqual(await controller.status(), '');
    controller.on(); // removes the flag
    await controller.play();
    assert.strictEqual(state.paused, false, 'play works again after on');
  });
});

test('a late play cannot override a newer pause (event serialization)', async () => {
  await withPlayer(async (state) => {
    process.env.VIBECODE_TOKEN = '100';
    await controller.play();
    assert.strictEqual(state.muted, false, 'token 100: playing');

    process.env.VIBECODE_TOKEN = '200';
    await controller.pause();
    assert.strictEqual(state.muted, true, 'token 200: paused');

    // A stale play (older token 150) arriving after the pause must NOT un-mute.
    process.env.VIBECODE_TOKEN = '150';
    await controller.play();
    assert.strictEqual(state.muted, true, 'stale play did not resume');

    // A genuinely newer play (token 300) resumes.
    process.env.VIBECODE_TOKEN = '300';
    await controller.play();
    assert.strictEqual(state.muted, false, 'newer play resumes');
  });
});

test('pause without a player is a silent no-op', async () => {
  await controller.pause();
  assert.strictEqual(await controller.status(), '');
});

test('off writes the disabled flag', async () => {
  await controller.off();
  assert.ok(fs.existsSync(path.join(sandbox, 'disabled')));
});

test('radio saves a known station and ignores an unknown one', async () => {
  await withPlayer(async () => {
    await controller.radio('metal');
    const saved = fs.readFileSync(path.join(sandbox, 'station'), 'utf8');
    assert.match(saved, /metal-128-mp3/);
    await controller.radio('not-a-vibe');
    // Unknown vibe leaves the previous station untouched.
    assert.match(fs.readFileSync(path.join(sandbox, 'station'), 'utf8'), /metal-128-mp3/);
  });
});

test('next advances to a different station and wraps', async () => {
  await withPlayer(async () => {
    await controller.radio('chill');
    const first = fs.readFileSync(path.join(sandbox, 'station'), 'utf8');
    await controller.next();
    const second = fs.readFileSync(path.join(sandbox, 'station'), 'utf8');
    assert.notStrictEqual(first, second, 'station advanced');
  });
});

test('setVolume persists a clamped base volume', async () => {
  await controller.setVolume(80);
  assert.strictEqual(fs.readFileSync(path.join(sandbox, 'volume'), 'utf8'), '80');
  await controller.setVolume('up');
  assert.strictEqual(fs.readFileSync(path.join(sandbox, 'volume'), 'utf8'), '90');
  await controller.setVolume('down');
  assert.strictEqual(fs.readFileSync(path.join(sandbox, 'volume'), 'utf8'), '80');
  await controller.setVolume(999);
  assert.strictEqual(fs.readFileSync(path.join(sandbox, 'volume'), 'utf8'), '100');
  await controller.setVolume('nonsense'); // ignored, stays put
  assert.strictEqual(fs.readFileSync(path.join(sandbox, 'volume'), 'utf8'), '100');
});

test('activityLevel rises with play events and is 0 when idle', async () => {
  assert.strictEqual(controller.activityLevel(), 0);
  await withPlayer(async () => {
    await controller.play();
    await controller.play();
    assert.ok(controller.activityLevel() > 0, 'level rises after plays');
    assert.ok(controller.activityLevel() <= 1, 'level is capped at 1');
  });
});

test('stationNames exposes the curated vibes', () => {
  const names = controller.stationNames();
  assert.ok(names.includes('lofi') && names.includes('metal') && names.includes('rock'));
  assert.ok(names.includes('spy') && names.includes('vaporwave') && names.includes('tavern'));
});

test('adaptiveVolume scales around the base with intensity and clamps', () => {
  assert.strictEqual(controller.adaptiveVolume(70, 0), 55); // light: base - spread
  assert.strictEqual(controller.adaptiveVolume(70, 0.5), 70); // medium: base
  assert.strictEqual(controller.adaptiveVolume(70, 1), 85); // heavy: base + spread
  assert.strictEqual(controller.adaptiveVolume(95, 1), 100); // clamped at 100
  assert.strictEqual(controller.adaptiveVolume(10, 0), 0); // clamped at 0
});

test('stationLabel and stationTheme follow the chosen station', async () => {
  assert.strictEqual(controller.stationLabel(), null, 'no station chosen yet');
  assert.strictEqual(controller.stationTheme(), null);
  await withPlayer(async () => {
    await controller.radio('hacker');
    assert.strictEqual(controller.stationLabel(), 'DEF CON Radio · SomaFM');
    const theme = controller.stationTheme();
    assert.ok(theme && Array.isArray(theme.stops) && Array.isArray(theme.sprites), 'themed station');
    await controller.radio('chill');
    assert.strictEqual(controller.stationLabel(), 'Groove Salad · SomaFM');
    assert.strictEqual(controller.stationTheme(), null, 'default theme station');
  });
});

test('custom stations from a user file extend the built-ins', async () => {
  const file = path.join(sandbox, 'stations.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      focus: {
        url: 'https://example.com/focus.mp3',
        label: 'Focus FM',
        theme: { stops: [{ p: 0, c: [1, 2, 3] }], sprites: ['@', '#'] },
      },
      plain: 'https://example.com/plain.mp3',
      broken: { nope: true },
    })
  );
  process.env.VIBECODE_STATIONS = file;
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}src${path.sep}`)) delete require.cache[key];
  }
  controller = require('../src/controller');
  const names = controller.stationNames();
  assert.ok(names.includes('focus') && names.includes('plain'), 'custom names listed');
  assert.ok(!names.includes('broken'), 'malformed entry ignored');
  await withPlayer(async () => {
    await controller.radio('focus');
  });
  assert.strictEqual(controller.stationLabel(), 'Focus FM', 'custom label, no suffix');
  assert.deepStrictEqual(controller.stationTheme().sprites, ['@', '#'], 'custom theme');
  delete process.env.VIBECODE_STATIONS;
});

test('lastActivityMs tracks the newest play event', async () => {
  assert.strictEqual(controller.lastActivityMs(), 0, 'no activity yet');
  const before = Date.now();
  await withPlayer(async () => {
    await controller.play();
  });
  const last = controller.lastActivityMs();
  assert.ok(last >= before && last <= Date.now(), 'stamp is from this play');
});

test('watchdog hard-pauses idle players, holding a muted one much longer', () => {
  const { shouldPause } = require('../src/watchdog');
  const limit = 120000;
  assert.strictEqual(shouldPause('►', 121000, limit), true, 'playing + idle: pause');
  assert.strictEqual(shouldPause('►', 5000, limit), false, 'playing + fresh: keep');
  // A muted player (waiting on the user) stays warm until the 8x hold window.
  assert.strictEqual(shouldPause('❚❚', 121000, limit), false, 'muted + short idle: keep warm');
  assert.strictEqual(shouldPause('❚❚', limit * 8 + 1, limit), true, 'muted + very long idle: stop');
  assert.strictEqual(shouldPause('', 999999999, limit), false, 'no player: nothing to do');
});

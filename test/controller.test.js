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
  const state = { paused: true, title: 'Fake FM - Test Track' };
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
        } else if (verb === 'get_property' && prop === 'media-title') {
          sock.write(`{"data":${JSON.stringify(state.title)},"error":"success"}\n`);
        } else if (verb === 'set_property' && prop === 'pause') {
          state.paused = value;
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

test('pause pauses a running player and status shows the pause glyph', async () => {
  await withPlayer(async (state) => {
    await controller.play();
    await controller.pause();
    assert.strictEqual(state.paused, true);
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

test('pause without a player is a silent no-op', async () => {
  await controller.pause();
  assert.strictEqual(await controller.status(), '');
});

test('off writes the disabled flag', async () => {
  await controller.off();
  assert.ok(fs.existsSync(path.join(sandbox, 'disabled')));
});

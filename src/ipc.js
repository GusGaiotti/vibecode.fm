'use strict';

const net = require('net');

// Send one JSON command to mpv's IPC endpoint and resolve its reply object,
// or null on any failure (no player, timeout, socket error). Never throws:
// the whole plugin degrades silently when there is nothing to talk to.
function send(ipcPath, command, timeoutMs = 1000) {
  return new Promise((resolve) => {
    let settled = false;
    let buffer = '';

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };

    const socket = net.connect(ipcPath);
    const timer = setTimeout(() => finish(null), timeoutMs);

    socket.on('connect', () => {
      socket.write(`${JSON.stringify(command)}\n`);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      // mpv may emit event lines first; the reply is the line with an "error" field.
      for (const line of buffer.split('\n')) {
        if (line.includes('"error"')) {
          try {
            finish(JSON.parse(line));
          } catch {
            finish(null);
          }
          return;
        }
      }
    });

    socket.on('error', () => finish(null));
  });
}

module.exports = { send };

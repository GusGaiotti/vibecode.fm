'use strict';

const net = require('net');

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
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
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

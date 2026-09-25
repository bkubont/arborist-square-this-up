'use strict';

/**
 * Wait for Vite (or ELECTRON_START_URL), then launch Electron.
 * Avoids adding wait-on as a root dependency.
 */
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const desktopRoot = path.join(__dirname, '..');
const url = process.env.ELECTRON_START_URL || 'http://127.0.0.1:5173';
const deadline = Date.now() + 90_000;

function ready() {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(Boolean(res.statusCode && res.statusCode < 500));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

(async () => {
  while (Date.now() < deadline) {
    if (await ready()) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await ready())) {
    console.error(`Timed out waiting for ${url}. Is Vite running with VITE_DESKTOP=true?`);
    process.exit(1);
  }

  let electronBinary;
  try {
    electronBinary = require(require.resolve('electron', { paths: [desktopRoot] }));
  } catch {
    console.error('Electron is not installed. Run: cd desktop && npm ci');
    process.exit(1);
  }

  const child = spawn(electronBinary, ['.'], {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_START_URL: url },
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
})();

'use strict';

const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const TOKEN_FILE = 'session.token';

function tokenPath() {
  return path.join(app.getPath('userData'), TOKEN_FILE);
}

/**
 * Persist the Bearer session token with Electron safeStorage (DPAPI on Windows).
 * Falls back to a userData file only when encryption is unavailable (rare / CI).
 */
function getSessionToken() {
  try {
    const file = tokenPath();
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(raw);
    }
    return raw.toString('utf8');
  } catch {
    return null;
  }
}

function setSessionToken(token) {
  if (typeof token !== 'string' || !token) {
    throw new Error('Session token must be a non-empty string');
  }
  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(token)
    : Buffer.from(token, 'utf8');
  fs.writeFileSync(tokenPath(), payload, { mode: 0o600 });
}

function clearSessionToken() {
  try {
    fs.unlinkSync(tokenPath());
  } catch {
    // ignore missing file
  }
}

module.exports = { getSessionToken, setSessionToken, clearSessionToken };

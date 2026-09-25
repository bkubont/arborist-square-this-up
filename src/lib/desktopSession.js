/**
 * @typedef {object} SquareDesktopBridge
 * @property {() => Promise<string|null>} getSessionToken
 * @property {(token: string) => Promise<void>} setSessionToken
 * @property {() => Promise<void>} clearSessionToken
 * @property {string} [platform]
 */

/** Electron preload bridge for encrypted session token (safeStorage). Absent on web. */
function bridge() {
  if (typeof window === 'undefined') return null;
  return /** @type {Window & { squareDesktop?: SquareDesktopBridge }} */ (window).squareDesktop || null;
}

const viteEnv = /** @type {{ env?: Record<string, string> }} */ (import.meta).env || {};

export const isDesktopClient = () =>
  viteEnv.VITE_DESKTOP === 'true' || Boolean(bridge());

/** Current app path (HashRouter uses `#/…`; BrowserRouter uses pathname). */
export function appPathname() {
  if (isDesktopClient()) {
    const hash = window.location.hash.replace(/^#/, '') || '/';
    return hash.split('?')[0] || '/';
  }
  return window.location.pathname;
}

export async function getDesktopSessionToken() {
  const api = bridge();
  if (!api?.getSessionToken) return null;
  return api.getSessionToken();
}

export async function setDesktopSessionToken(token) {
  const api = bridge();
  if (!api?.setSessionToken) {
    throw new Error('Desktop session storage is unavailable. Run inside the Electron shell.');
  }
  await api.setSessionToken(token);
}

export async function clearDesktopSessionToken() {
  const api = bridge();
  if (!api?.clearSessionToken) return;
  await api.clearSessionToken();
}

/** Navigate in HashRouter (desktop) or BrowserRouter (web). */
export function assignAppPath(path) {
  const target = path.startsWith('/') ? path : `/${path}`;
  if (isDesktopClient()) {
    window.location.hash = `#${target}`;
    return;
  }
  window.location.assign(target);
}

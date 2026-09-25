# Square This Up — desktop (Electron)

Windows-first Electron shell that embeds the existing Vite React UI (`src/`) and talks to the Hostinger API with **Bearer** sessions (`X-Client: desktop`), same pattern as Expo mobile. Online-only for v1 — no local database.

## Prerequisites

- Node.js 22+ (same as repo root)
- Root API + (for dev) Vite running, or a production `VITE_API_URL`
- **Windows** for day-one installs; build artifacts are produced with `electron-builder`

## Auth & security

| Concern | Behavior |
| --- | --- |
| API | Absolute `VITE_API_URL` + `Authorization: Bearer …` + `X-Client: desktop` |
| Token storage | Electron `safeStorage` (Windows DPAPI) via IPC — not plaintext in the repo |
| Cookies / CSRF | Not used; native clients skip Origin checks like mobile |
| Secrets | Never put DB credentials or invitation links in the installer |

## Local Electron run (dev)

From the **repository root** (install desktop deps once):

```sh
cd desktop && npm ci && cd ..
npm run desktop:dev
```

Dev leaves `VITE_API_URL` unset so the UI uses Vite’s `/api` proxy (no CORS hassle). Electron loads `http://127.0.0.1:5173`. Log in with an invited account; the session token is stored via `safeStorage`.

Or manually:

```sh
# Terminal A
VITE_DESKTOP=true npm run dev

# Terminal B (after Vite is up on :5173)
cd desktop && npm start
```

## Windows build (site download)

Unsigned builds are intentional for MVP (minimize spend). Windows SmartScreen will warn on first run — document that for users until a code-signing certificate is purchased.

**`VITE_API_URL` is required** for packaged builds (absolute Hostinger origin; CORS is enabled for `X-Client: desktop` Bearer calls).

```sh
# From repo root — builds Vite UI for desktop, then packages Windows installer + portable
export VITE_API_URL=https://jobs.yourdomain.com   # must match production host (no trailing slash)
npm run desktop:build:win
```

Run **`desktop:build:win` on a Windows machine** (or Linux with full Wine/i386) for NSIS + portable `.exe` artifacts. On Linux without Wine32, use the unpacked dir target to verify packaging:

```sh
export VITE_API_URL=https://jobs.yourdomain.com
npm run desktop:build:win:dir
# → desktop/release/win-unpacked/Square This Up.exe (+ resources/ui)
```

Artifacts land in `desktop/release/`:

- NSIS installer: `Square This Up-0.1.0-win-x64.exe` (name may vary slightly)
- Portable: `Square This Up-0.1.0-portable.exe`
- Unpacked (dir): `win-unpacked/`

Host the installer/portable file on your business site (Phase 2 download page). **Do not** commit `desktop/release/` or signing keys.

### When to pay for code signing

Defer until:

1. External (non-Brittany) users install from the website, **or**
2. SmartScreen friction blocks adoption / support load, **or**
3. You prepare Microsoft Store / broader distribution

Until then: ship unsigned, warn users to choose “More info → Run anyway”, and keep the cert budget for when download volume justifies it.

## Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_DESKTOP=true` | Vite build/dev | HashRouter, Bearer client, relative asset base |
| `VITE_API_URL` | Vite build/dev | Absolute API origin (e.g. `https://jobs.yourdomain.com`) |
| `ELECTRON_START_URL` | Electron dev | Override UI URL (default `http://127.0.0.1:5173`) |

## Out of scope (v1)

Offline sync, auto-update channel, macOS/Linux packaging, app stores, paid Authenticode signing.

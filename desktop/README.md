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

**`VITE_API_URL` is required** for packaged builds (absolute Hostinger origin; CORS is enabled for `X-Client: desktop` Bearer calls). Packaging scripts exit immediately if it is missing or not `https://`.

Artifact names come from `desktop/package.json` `version` (currently `0.1.0`) via electron-builder:

- NSIS: `Square This Up-<version>-win-x64.exe`
- Portable: `Square This Up-<version>-portable.exe`

### Recommended: GitHub Actions (no local Windows machine)

Full NSIS + portable `.exe` packaging needs Windows (or Wine32). This cloud Linux environment cannot produce real installers — use the workflow.

1. In GitHub → **Settings → Secrets and variables → Actions → Variables**, add:
   - **Name:** `VITE_API_URL`
   - **Value:** `https://arborist.squarethisup.com` — **no trailing slash** (same host as `APP_ORIGIN`)
   - (Optional) use a **secret** with the same name instead; the workflow reads `vars` first, then `secrets`.
2. Open **Actions → Desktop Windows → Run workflow** (`workflow_dispatch`).
3. When the run finishes, download the artifact **`arborist-square-this-up-windows-<run#>`** (contains the NSIS + portable `.exe` files). Retention: 30 days.
4. Expect SmartScreen on first launch until you buy Authenticode signing.

Workflow file: `.github/workflows/desktop-windows.yml`.

### Local build (Windows machine)

```sh
# From repo root — builds Vite UI for desktop, then packages Windows installer + portable
export VITE_API_URL=https://arborist.squarethisup.com   # must match production host (no trailing slash)
npm run desktop:build:win
```

On Linux without Wine32, **`desktop:build:win:dir`** only produces an unpacked tree — that does **not** verify the NSIS installer:

```sh
export VITE_API_URL=https://arborist.squarethisup.com
npm run desktop:build:win:dir
# → desktop/release/win-unpacked/Square This Up.exe (+ resources/ui)
```

Artifacts land in `desktop/release/` (gitignored). Host the installer/portable on your business site (Phase 2 download page). **Do not** commit `desktop/release/` or signing keys.

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
| `VITE_API_URL` | Vite build/dev | Absolute API origin (e.g. `https://arborist.squarethisup.com`) |
| `ELECTRON_START_URL` | Electron dev | Override UI URL (default `http://127.0.0.1:5173`) |

## Out of scope (v1)

Offline sync, auto-update channel, macOS/Linux packaging, app stores, paid Authenticode signing.

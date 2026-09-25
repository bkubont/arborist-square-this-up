# Square This Up

A standalone React + Express job tracker (working title was Jobsite Notebook). Production uses MySQL on Hostinger; local development uses a persistent SQLite database. Base44 is no longer required to start or run the app.

## Local development

Use Node.js 24 LTS and npm. From the repository root:

```sh
npm ci
# Copy .env.example to .env (PowerShell: Copy-Item .env.example .env)
npm run account -- invite you@example.com
npm run dev
```

Open the private invitation URL printed by the account command and choose a password (12–128 characters). The frontend runs at http://localhost:5173 and proxies API requests to port 3000. Local data persists in .data/job-tracker.sqlite. Keep the server port private; SQLite mode is for local development, not production. Do not commit .env, database files, exports, or invitation links.

Each invited account has separate clients, jobs, timeline entries and files. Invitations are single-use and expire after 48 hours. Public registration is disabled. Accounts do not share business data. Google login and Base44 MCP authorization are not part of this version.

## Hostinger deployment

Hostinger builds this source on the server with `NODE_ENV=production`. Vite, its React plugin, Tailwind, PostCSS and Autoprefixer are therefore regular dependencies so they remain available even when npm omits development dependencies. Keep Node.js 24 selected. A `vite: not found` build failure should be addressed by uploading the corrected package and lockfile, not by downgrading Node.js.

Use an available Node.js web app slot on the existing Business plan. Keep the app separate from existing business websites, for example on jobs.yourdomain.com.

1. Create a dedicated MySQL database and database user in hPanel. Confirm database capacity and max_allowed_packet of at least 8 MB (uploads are limited to 4 MB). Photos live in the files table, so database limits matter separately from the advertised website disk space. Start with ACCOUNT_STORAGE_MB=100; raise only after checking database and backup limits.
2. Add a Node.js web app using a private repository or source ZIP. Choose Express/Other backend mode, Node.js 24, repository root as the application root, npm ci for installation, npm run build for the build command, and server/index.js as the entry file (npm start if a start command is requested). The frontend output is dist, but deploy the complete application, not dist alone. Express serves the API and built frontend from the same origin.
3. Set NODE_ENV=production, APP_ORIGIN=https://jobs.yourdomain.com, DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD in Hostinger's environment settings. Use the actual database hostname supplied by hPanel. Enable DB_SSL=true when the database supports a trusted TLS connection. Honor Hostinger's assigned PORT. Never expose database credentials through VITE_ variables.
4. The server creates its tables on startup. Run npm run account -- invite you@example.com against this production database from an authorized shell using the same environment. If the web app does not offer a shell, use a trusted local machine with Hostinger's remote MySQL access restricted to that machine's IP. Do not expose an unauthenticated setup endpoint.
5. Open the invitation URL, set your password, and verify /api/health returns {"ok":true}. Confirm login, client/job creation, upload, logout, deep-link refresh, backup download, and persistence across a restart/redeployment. Test with two separate accounts and confirm both record and photo isolation.
6. Confirm hPanel's scheduled backups include this MySQL database and verify a restore into a separate database. Download an account backup regularly and before changes. Keep a copy outside the hosting account. Only switch from Base44 after data/file counts and these checks pass.

Production refuses to start without MySQL and an HTTPS APP_ORIGIN. The backend uses HttpOnly, Secure, SameSite cookies, origin checks on mutations, hashed passwords, expiring sessions, and database-backed authentication rate limits. Domain changes require updating APP_ORIGIN and logging in again.

Hostinger references (checked September 2026):
- https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/
- https://www.hostinger.com/support/which-databases-and-data-tools-are-supported-at-hostinger/

## Account management and recovery

```sh
npm run account -- invite another@example.com
npm run account -- reset you@example.com
```

The reset command prints a private, single-use link valid for 30 minutes. Completing a reset revokes all existing sessions. Share links securely with the intended owner. Never paste them into public tickets or logs.

### Demo wipe and seed (one account)

To clear **business data** for a single account and load a fixed demo set (15 clients, 14 jobs across statuses, documents, timeline, and a few expenses), run:

```sh
npm run account -- seed-demo you@example.com --yes
```

Without `--yes`, the command prompts and requires typing `YES`. It keeps the login and **CompanyProfile** (sales tax, company name, logo). It does **not** touch other accounts. Safe for local SQLite and production MySQL when pointed at the same database credentials as the running app.

The command prints which database it will use (`sqlite:…` or `mysql://host/db`) and a **visibility summary** before you open the app: all 14 jobs appear on **All Jobs**; **Board** and **Active** show 12 (two **Paid** demo jobs live in **Archive** by design). If you seed local SQLite but browse the Hostinger site, you will see no demo jobs — re-run on the server with the same `DB_*` / `NODE_ENV=production` values as the Node app (hPanel env is not automatic in SSH). `Account not found` means that email is not in the `users` table of the database you connected to. Download a backup first if you might need the old data.

For email password recovery, configure SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD and MAIL_FROM. If SMTP is absent, the reset page explains that the owner must provide a reset link. No mail is sent by the CLI. Check mailbox pricing/renewal and sending limits in your existing hosting subscription.

## Backups and migration from Base44

The signed-in Download backup link exports that account's records and photo bytes in one JSON file, without passwords or sessions. This is an account-level data export; full disaster recovery also requires a MySQL backup and securely retained server configuration. Exports contain private client information.

Restore into an existing, empty account:

```sh
npm run data:import -- you@example.com backups/jobsite-backup.json
```

Imports run in a transaction, remap IDs and relationships, preserve record timestamps, and refuse nonempty accounts. They do not merge or overwrite data. Keep a source copy before importing.

To migrate Base44, first export Client, Job and TimelineEntry records for the intended account. Normalize them into a JSON object with Client, Job and TimelineEntry arrays. Each record needs its original id and relationship IDs. Download all referenced photos separately and add a files array, each with id, mime, content (base64 bytes), and source_url (the exact original photo_url). The importer requires every referenced photo to be present and never downloads arbitrary URLs. Supported photos are JPEG, PNG and WebP up to 4 MB each; convert larger/unsupported originals before packaging. Exported passwords cannot be imported; establish new accounts through invitations. Existing base44/entity definitions are retained as migration references only.

Do not cancel Base44 until the source records/files have been exported, imported and compared, and the Hostinger version has passed acceptance checks. The live data export and Hostinger account configuration are external steps, not performed by editing this repository.

## Photos and dictation

Photo uploads are resized to at most 1800 pixels on the longest side and encoded as JPEG on the device. Store originals separately if full-resolution originals are important. Photos are served only to their account owner; they do not have public URLs. The default 100 MB photo quota applies per account. Database backups include photos. Failed uploads that never receive a timeline entry can consume quota; inspect unreferenced files before deleting them.

Dictation uses browser SpeechRecognition where supported, with editable text before saving. Browser providers may process audio remotely; availability depends on the browser and connectivity. Elsewhere, use the phone keyboard microphone. There is no Base44 or paid app-side transcription integration.

## Address autocomplete

Add/Edit Client can suggest addresses while typing. Set `VITE_GOOGLE_PLACES_API_KEY` (browser Places key, restrict by HTTP referrer) for Google Places (`types: address`). When unset, the API uses free Photon/OSM suggestions at `/api/address-suggest`, filtered to house/street results (US) so city/locality hits do not overwrite the street field. Selecting a suggestion fills street, city, state, and ZIP; fields remain fully editable manually. Street, city, state, and ZIP are required; address line 2 (apt/suite) is not.

## Mobile (Expo)

Native iOS/Android client lives in `mobile/` (Expo managed + Expo Router). Bearer sessions against this API; web still uses cookies. Account deletion: `DELETE /api/auth/account` (Settings on web and More on mobile).

Deep-link verification files live under `public/.well-known/` (Apple/Google placeholders — replace Team ID / SHA-256 before production). See [mobile/README.md](mobile/README.md) for `EXPO_PUBLIC_API_URL`, Universal Links, and EAS human steps.

```sh
cd mobile
cp .env.example .env
npm start
```

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

Mobile typecheck (from `mobile/`): `npm run typecheck`.

The API integration tests use a temporary SQLite database and exercise account isolation, invitations, sessions, origin checks, recovery, deletion and restore. A real Hostinger MySQL acceptance check is required before launch. Local development uses SQLite to avoid requiring a database server installation.

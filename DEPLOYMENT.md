# Hostinger setup — Arborist Square This Up

Target: **https://arborist.squarethisup.com**. Separate product from contractor Square This Up at squarethisup.com. Start empty; no Base44 records need importing. User-facing product name: **Square This Up** (arborist edition).

The code is prepared in this repository. **No Hostinger resources have been created or changed** by the agent — create website, MySQL, DNS, and SSL only after explicit confirmation.

1. In Hostinger, create a dedicated MySQL database and user for this arborist app (do not reuse the contractor Square This Up database). Keep credentials in Hostinger's environment settings, not in chat or git. Confirm database storage limits and a maximum packet size of at least 8 MB.
2. Use an available Business plan web app slot. Upload the source ZIP or connect the **arborist-square-this-up** Git repository. Select a backend app (Express/Other), Node.js 24, build command `npm run build`, entry file `server/index.js`, and application root at the repository root. If asked for a start command, use `npm start`. Install with `npm ci`. `dist` contains the frontend output; the server and dependencies must also be deployed.
3. Configure `NODE_ENV=production`, `APP_ORIGIN=https://arborist.squarethisup.com`, `DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. Set `DB_PORT` if needed. Use Hostinger's assigned `PORT`. See `.env.example` for optional email recovery and photo quota settings. Suggested support mailbox: `support@arborist.squarethisup.com` (confirm before store listing).
4. Assign **arborist.squarethisup.com** to this new app (CNAME/A as Hostinger directs) and enable HTTPS + HTTPS redirect. Leave the contractor squarethisup.com site and DNS untouched.
5. From a trusted shell connected to the app's database, run `npm run account -- invite YOUR_EMAIL`. Open the private invitation link and choose your password. The first account is created only when you accept this invitation. See README.md for the remote-MySQL alternative if the web app has no shell.
6. Check `/api/health`, log in, create a client and job, add tree inventory rows, create an estimate from service presets, upload a photo, download a backup, restart/redeploy, and confirm the data and photo persist. Check a second invited account cannot see the first account's data, including direct photo URLs.
7. Confirm Hostinger backups include the app's MySQL database and test restoration into a separate database. Keep a downloaded account backup outside Hostinger too.

Local integration tests run against SQLite. Hostinger MySQL, SMTP delivery, HTTPS cookies, photo persistence after redeployment, and browser/mobile behavior must be verified on the hosted app before relying on it for live work. SMTP is optional; without it, the account reset CLI supplies password-reset links. Google sign-in is not configured. Dictation depends on browser support, with phone keyboard dictation as the fallback.

## If the build says `vite: not found`

Upload `jobsite-hostinger-build-fix.zip` as a new deployment of the existing app. Keep Node.js 24, Express, entry file `server/index.js`, and all existing environment variables. This package includes the frontend build tools in production dependencies and an updated lockfile, so `npm ci --omit=dev` can still run `npm run build`. Do not switch to Node.js 22 based only on the automated diagnosis.

## If runtime logs show `ERR_REQUIRE_ASYNC_MODULE`

Upload `jobsite-hostinger-startup-fix.zip`. This includes the build fix and moves asynchronous initialization inside a startup function so LiteSpeed can load `server/index.js` using `require()`. Keep the same entry file, Node.js 24 and environment variables. Startup tests verify both the CommonJS loader and direct Node entry against a temporary local database; the hosted MySQL connection still needs a live health check.

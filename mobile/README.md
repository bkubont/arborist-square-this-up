# Square This Up — mobile (Expo)

Native iOS/Android client. Bearer sessions against the Express API (`X-Client: mobile`). Web cookie auth unchanged.

## Features

- Auth: login, **register (invite)**, forgot/reset password; deep links for invite/reset
- Tabs: Home · Jobs · Customers · Money · More
- Clients/Jobs CRUD, job photos, expenses, summaries
- Account delete (mobile + web Settings)

## Run locally

```sh
cd mobile
cp .env.example .env
# EXPO_PUBLIC_API_URL=http://localhost:3000   (Android emulator: http://10.0.2.2:3000)
# EXPO_PUBLIC_LINK_HOST=jobs.yourdomain.com   # production HTTPS host for App Links
npm start
npm run typecheck
```

Custom scheme (always works in Expo Go / dev builds):

- `squarethisup://register?invite=…&email=…`
- `squarethisup://reset-password?token=…`

Same paths on HTTPS (`https://{EXPO_PUBLIC_LINK_HOST}/register?…`) open the app when Universal/App Links are verified.

## Deep links — human console steps

In-repo already:

- Expo `scheme: squarethisup`
- iOS `associatedDomains: applinks:{EXPO_PUBLIC_LINK_HOST}`
- Android `intentFilters` for `/register` and `/reset-password`
- Templates: `public/.well-known/apple-app-site-association` and `assetlinks.json` (served by Express)

**You still must:**

1. Set `EXPO_PUBLIC_LINK_HOST` (and production `APP_ORIGIN`) to the real API/web host.
2. Replace `TEAMID` in the Apple association file with your Apple Team ID.
3. Replace the Android SHA-256 fingerprint in `assetlinks.json` with Play App Signing cert (or upload key) fingerprint.
4. In Apple Developer: enable Associated Domains on the App ID; in Apple Developer / ASC ensure the domain is live over HTTPS.
5. Confirm `https://{host}/.well-known/apple-app-site-association` and `…/assetlinks.json` return JSON (no login redirect).

Invite emails from `npm run account -- invite` still print web URLs; with App Links configured, opening them on a phone with the app installed should launch the native register screen.

## EAS builds (scaffolding only — no credentials in repo)

```sh
cd mobile
npm i -g eas-cli   # or npx eas-cli
eas login          # Expo account (human)
eas init           # creates/links project; set EAS_PROJECT_ID in env / app config
eas build --platform ios --profile preview
eas build --platform android --profile preview
```

Profiles are in `eas.json` (`development`, `preview`, `production`).

**Human credentials (not in git):**

| Step | Who |
| --- | --- |
| Expo account + `eas login` | Human |
| Apple Developer Program + App Store Connect app / certificates | Human |
| Google Play Console + service account / keystore (EAS can manage) | Human |
| Set `submit.production.ios.ascAppId` in `eas.json` | Human |
| Privacy policy URL + store listing screenshots | Human |

Do **not** commit `.env`, tokens, keystores, or invitation links.

## Out of scope here

Richer estimate/invoice editors; store submission itself.

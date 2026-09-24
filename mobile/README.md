# Square This Up — mobile (Expo)

Native iOS/Android client for Square This Up. Talks to the existing Express API with **Bearer** sessions (`X-Client: mobile`). Web cookie auth is unchanged.

## Features (current)

- Login / logout / session restore (SecureStore)
- Home, Jobs list → detail, Customers list → detail
- Settings: logout + **delete account** (password confirm → `DELETE /api/auth/account`)
- Authenticated file images via Bearer (`AuthenticatedImage` + `absoluteFileUrl`)

## Prerequisites

- Node 22+ and npm
- API running from the repo root (`npm run dev` or `npm start`)
- An invited account (`npm run account -- invite you@example.com` from the repo root)

## Configure API URL

Copy the example env and point at your API:

```sh
cp .env.example .env
```

| Target | `EXPO_PUBLIC_API_URL` |
| --- | --- |
| iOS Simulator / Expo web (same machine) | `http://localhost:3000` |
| Android Emulator | `http://10.0.2.2:3000` |
| Physical device (same LAN) | `http://<your-computer-lan-ip>:3000` |
| Production / staging | `https://jobs.yourdomain.com` |

Restart Expo after changing env vars.

## Run

```sh
cd mobile
npm start
```

## Scripts

```sh
npm start          # Expo dev server
npm run typecheck  # tsc --noEmit
```

## Notes

- Session token is in **SecureStore** (localStorage fallback on web for local checks only).
- File URLs are relative (`/api/files/:id`); the client prefixes `EXPO_PUBLIC_API_URL` and sends Bearer.
- Do not commit `.env`, tokens, or invitation links.
- Create/edit forms, photo upload UI, register/forgot-password, and EAS submit are still ahead.

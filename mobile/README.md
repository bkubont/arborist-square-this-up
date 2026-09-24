# Square This Up — mobile (Expo)

Auth-spike native client for iOS and Android. Talks to the existing Express API with **Bearer** sessions (`X-Client: mobile`). Web cookie auth is unchanged.

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
| iOS Simulator / Expo web on same machine | `http://localhost:3000` |
| Android Emulator | `http://10.0.2.2:3000` |
| Physical device (same LAN) | `http://<your-computer-lan-ip>:3000` |
| Production / staging | `https://jobs.yourdomain.com` |

Restart Expo after changing env vars.

## Run

```sh
cd mobile
npm start
```

Then open iOS Simulator, Android Emulator, or Expo Go. Log in with an invited account. The home screen calls `GET /api/auth/me` and can log out (revokes the Bearer session).

## Scripts

```sh
npm start          # Expo dev server
npx tsc --noEmit   # typecheck
```

## Notes

- Session token is stored in **SecureStore** on device (localStorage fallback on web for local checks only).
- Do not commit `.env`, tokens, or invitation links.
- Full entity screens, photo upload, and account deletion are out of scope for this spike.

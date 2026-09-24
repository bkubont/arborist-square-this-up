# Square This Up — mobile (Expo)

Native iOS/Android client for Square This Up. Talks to the existing Express API with **Bearer** sessions (`X-Client: mobile`). Web cookie auth is unchanged.

## Features (current)

- Login / logout / session restore (SecureStore)
- Home, Jobs, Customers, More tabs
- **Customers:** list → detail → create/edit (name, address, phone, email, notes)
- **Jobs:** list → detail → create/edit (title, customer, status, dates, notes)
- **Photos:** camera/library → resize (≤1800px JPEG) → `POST /api/files` → TimelineEntry on the job; display via Bearer `AuthenticatedImage`
- Settings: logout + delete account

## Prerequisites

- Node 22+ and npm
- API running from the repo root (`npm run dev` or `npm start`)
- An invited account (`npm run account -- invite you@example.com` from the repo root)

## Configure API URL

```sh
cp .env.example .env
```

| Target | `EXPO_PUBLIC_API_URL` |
| --- | --- |
| iOS Simulator / Expo web (same machine) | `http://localhost:3000` |
| Android Emulator | `http://10.0.2.2:3000` |
| Physical device (same LAN) | `http://<your-computer-lan-ip>:3000` |
| Production / staging | `https://jobs.yourdomain.com` |

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
- Photo attach matches web: TimelineEntry with `photo_url` + category (before/after/…).
- Do not commit `.env`, tokens, or invitation links.
- Register/forgot-password, Money tabs, and EAS submit are still ahead.

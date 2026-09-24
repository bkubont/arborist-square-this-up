# Square This Up — mobile (Expo)

Native iOS/Android client for Square This Up. Talks to the existing Express API with **Bearer** sessions (`X-Client: mobile`). Web cookie auth is unchanged.

## Features (current)

- Login / logout / session restore (SecureStore)
- Tabs: **Home · Jobs · Customers · Money · More**
- Dashboard: money snapshot from `/api/summaries`, attention rows, active jobs
- Money: Estimates / Invoices / Expenses lists → detail; expense create/edit
- Customers & Jobs: list → detail → create/edit
- Job photos: camera/library → `POST /api/files` → TimelineEntry
- Settings: logout + delete account

## Run

```sh
cd mobile
cp .env.example .env   # set EXPO_PUBLIC_API_URL
npm start
npm run typecheck
```

| Target | `EXPO_PUBLIC_API_URL` |
| --- | --- |
| iOS Simulator / Expo web | `http://localhost:3000` |
| Android Emulator | `http://10.0.2.2:3000` |
| Device | `http://<lan-ip>:3000` |

Customer e-sign stays on the web. Do not commit `.env` or tokens.

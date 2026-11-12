# Whitehouse (MERN + Firebase Google login)

- **MongoDB + Mongoose** stores each user's shop data (`server/index.js`)
- **Express/Node** API verifies the Firebase ID token and saves/loads data
- **React (Vite)** handles Google sign-in and syncs data; the shop screens run from `client/public/legacy.html`

## 1. Firebase
1. Firebase console > Authentication > Sign-in method > enable **Google**.
2. Project settings > add a **Web app**; copy the config into `client/.env` (see `.env.example`).
3. Authentication > Settings > Authorized domains: add your live domain.
4. Project settings > Service accounts > **Generate new private key**; copy `project_id`, `client_email`, `private_key` into `server/.env`.

## 2. Run
```
cd server && cp .env.example .env && npm install && npm run dev
cd client && cp .env.example .env && npm install && npm run dev
```
Open http://localhost:5173 and sign in with Google.

## 3. Deploy
```
cd client && npm run build
cd ../server && NODE_ENV=production npm start
```
The server also serves the built React app.

## How sync works
Every change the shop screens save is sent to `/api/state` (one row per key per user). On login the saved data is loaded back, so the same Google account shows the same shop on any phone. Data already on a phone is imported the first time that account signs in.

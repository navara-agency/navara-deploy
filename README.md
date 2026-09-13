# navara-deploy

Deployable bundle for **navaraagency.com** on Hostinger Node.js hosting.

- Express backend at the repo root (`server.js`, `src/`)
- Prebuilt frontend in `public/`, served by Express via the `STATIC_DIR` env var

Everything is same-origin: the API lives at `/api/*` and all other routes fall through
to the SPA shell. No separate API subdomain and no CORS.

## Hostinger build settings
`app_type=express` · `entry_file=server.js` · `root_directory=.` · node 22 · npm

## Refreshing the frontend
Build `navara-frontend` with `VITE_API_BASE_URL=https://navaraagency.com`,
then copy its `dist/` over `public/` here and push.

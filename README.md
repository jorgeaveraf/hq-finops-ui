# Headquarters FinOps UI

React + Vite + TypeScript frontend for managing HQ QuickBooks clients and integrations. Tailwind-driven styling follows the HQ teal palette with an internal-tool feel.

## Quick start

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The login screen gates all other routes.

## Environment

Create a `.env` (or `.env.local`) if you need overrides:

- `VITE_INGESTION_API_BASE_URL` (default: `http://localhost:8001`)
- `VITE_APP_USERNAME` (default: `admin`)
- `VITE_APP_PASSWORD` (default: `admin`)
- `QBO_GATEWAY_BASE_URL` (proxy target for qbo-gateway; safe to set in `.env`)

The login is front-only: credentials are checked in the browser and an auth flag is stored in `localStorage` (or session if “remember me” is unchecked). No backend auth is used.

For qbo-gateway access (keep these out of `.env` in the frontend repo), export before running `npm run dev`:

```bash
export QBO_GATEWAY_API_KEY="..."
export QBO_GATEWAY_BASE_URL="http://127.0.0.1:8000"
```

All qbo-gateway calls go through `/qbo-api/*` so the Vite proxy injects `X-API-Key` and `Accept: application/json` server-side; the browser never stores or ships the API key.

## Scripts

- `npm run dev` — start Vite dev server.
- `npm run build` — type-check and build for production.
- `npm run preview` — preview built assets.
- `npm run test` — Vitest unit tests.
- `npm run lint` — ESLint (optional if you enable rules).

## Features

- Clients & Integrations module hitting qbo-gateway via `/qbo-api` (list clients, view detail, create when supported, and trigger OAuth reconnect without exposing API keys).
- Auth gate with `/login`, remember-me toggle, and sign-out from the header.
- Protected dashboard and administrator-only client management routes.
- Ingestion gateway health status in the application sidebar.
- Tailwind-based HQ look: teal primary, white cards, soft shadows.

## Project structure

- `src/api` — Axios client + request/response types.
- `src/modules/auth` — `AuthProvider`, `useAuth`, login page, and `RequireAuth`.
- `src/modules/qbo` — qbo-gateway HTTP client, Clients & Integrations pages, and the OAuth reconnect UI.
- `src/modules/dashboard` — overview cards and shortcuts.
- `src/hooks` — ingestion gateway health status polling.
- `src/components` — UI primitives (buttons, cards, alerts, dropzone, form fields, badges).
- `src/layout` — app shell with sidebar nav and header.
- `src/tests` — basic rendering/validation tests (Vitest + Testing Library).

## Docker

Build and run with nginx:

```bash
docker build -t hq-finops-ui .
docker run -p 8080:80 hq-finops-ui
```

Expose env vars at build time by injecting them into a `.env` before `docker build`, or swap nginx for a runtime env solution if needed.

## Notes

- Design mirrors HQ marketing/success screens with a Fortune-500 internal console tone.
- Outputs from polling are displayed as text placeholders; hook up real download links when the gateway exposes them.
- All logic is client-side; ensure the ingestion-gateway is reachable at the configured base URL.

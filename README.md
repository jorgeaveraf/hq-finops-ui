# Headquarters FinOps UI

React + Vite + TypeScript frontend for managing HQ QuickBooks clients and integrations. The Node API lives in the separate, local sibling repository `../hq-finops-api`; the two repositories communicate only through HTTP.

## Local sandbox (Docker)

Place `hq-finops-ui` and `hq-finops-api` side by side. The regular UI runs on port 5173 and connects to whichever local backend mode is active. For the real ACME Sandbox, start the unchanged local QBO Gateway, then the API's `compose.qbo-sandbox.local.yml`, then this UI's `compose.local.yml`.

```bash
cd ../hq-finops-api
docker compose --env-file ../qbo-gateway/.env -f compose.qbo-sandbox.local.yml up -d --build
cd ../hq-finops-ui
docker compose -f compose.local.yml up -d --build
```

Open http://localhost:5173/automations/. The development login is `sandbox-admin` / `sandbox-demo-only`. These are fixture credentials only. The regular UI Compose builds only the UI and joins the backend-owned private network. Stop this UI project before stopping the backend project.

`npm run test:docker` starts a separate three-service mock stack from `compose.smoke.local.yml` on http://localhost:5174/automations/ and tests only synthetic entities. Its API and mock gateway have no published ports and share no network or data with the regular stack. Use `npm run mock:mixed` and `npm run mock:all-connected` to switch only this isolated mock fixture. The fixture does not issue OAuth links; use the regular sandbox stack on port 5173 for Connect QuickBooks. The smoke runs both modes and leaves `all-connected` active; stop it with `docker compose -f compose.smoke.local.yml down` when finished. No request goes to the real QBO Gateway or production.

For real ACME Sandbox testing, run `npm run test:local-qbo` in the API repository for a read-only integration smoke. The regular UI Compose includes a local-only OAuth return helper on `127.0.0.1:8080`, matching the gateway's pre-existing success URL. Intuit consent remains an interactive user step.

## Environment

The frontend calls only `/automations/api/*`, which Vite proxies to the sibling API container during local development. The backend owns the gateway API key, verifies password hashes, issues an eight-hour HttpOnly session cookie and enforces the admin role and CSRF protection on writes. `FINOPS_LOCAL_ONLY` defaults to true; the regular sandbox API explicitly permits only the local QBO Gateway, while the isolated smoke API permits only its private mock. `FINOPS_ALLOWED_ENVIRONMENTS` defaults to `sandbox`. Production serves the static UI through Nginx and routes `/automations/api/*` to the separately deployed FinOps backend.

## Scripts

- `npm run dev` — start Vite dev server.
- `npm run build` — type-check and build for production.
- `npm run preview` — preview built assets.
- `npm run test` — Vitest unit tests.
- Run `npm test` in `../hq-finops-api` for backend security and contract tests.
- `npm run test:docker` — start and verify the isolated Docker mock stack on port 5174.
- `npm run mock:mixed` / `npm run mock:all-connected` — switch only the isolated mock fixture for UI review.
- `npm run lint` — ESLint.

## Features

- Clients & Integrations module hitting the allowlisted FinOps backend (list, detail, create, delete, and OAuth reconnect).
- Server-verified login, session restore, and sign-out.
- Protected dashboard and administrator-only client management routes.
- Tailwind-based HQ look: teal primary, white cards, soft shadows.

## Project structure

- `src/modules/auth` — `AuthProvider`, `useAuth`, login page, and `RequireAuth`.
- `src/modules/qbo` — FinOps API client, Clients & Integrations pages, and the OAuth reconnect UI.
- `local` — cross-repository Docker smoke and mock-mode controls; the API implementation lives in `../hq-finops-api`.
- `src/modules/dashboard` — overview cards and shortcuts.
- `src/components` — UI primitives (buttons, cards, alerts, dropzone, form fields, badges).
- `src/layout` — app shell with sidebar nav and header.
- `src/tests` — basic rendering/validation tests (Vitest + Testing Library).

## Deployment boundary

GitHub Actions builds and tests pushes to `develop` and `main`. A successful push to `main` builds `dist`, rejects local fixture markers, uploads only the static bundle, and activates it with `/usr/local/sbin/deploy-finops-ui`. The VPS script checks the public UI and restores the previous release if that check fails. Local Compose and smoke fixtures are never part of the uploaded bundle.

## Notes

- Design mirrors HQ marketing/success screens with a Fortune-500 internal console tone.
- The browser receives only allowlisted data; credential and token fields stay upstream of the FinOps backend.

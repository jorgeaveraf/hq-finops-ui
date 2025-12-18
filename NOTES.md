## Implementation notes

- **Auth**: Front-only gate. Credentials come from `VITE_APP_USERNAME` / `VITE_APP_PASSWORD` (defaults: admin/admin). `AuthProvider` stores a flag in `localStorage` (or session when remember-me is off). `RequireAuth` protects all routes except `/login`. Sign out clears storage and redirects.
- **API**: Axios client in `src/api/client.ts` uses `VITE_INGESTION_API_BASE_URL` (default http://localhost:8001). Exposes `postPart1Ingestion`, `postPart2Ingestion`, `getRunStatus`. Types live in `src/api/types.ts`.
- **Polling**: `usePolling(runId, dag, intervalMs)` hits `/poll/{runId}?dag=part1|part2`, stops on `success`/`failed`, and surfaces `{ status, details, error, isPolling }`.
- **Modules**:
  - `modules/part1` — Bank ingestion form with CSV dropzone and live status panel.
  - `modules/part2` — QBO export form with source toggle (warehouse vs samples + CSVs) and polling.
  - `modules/qbo` — qbo-gateway client + Clients & Integrations pages (list/detail/create) and OAuth reconnect UI (calls `/qbo-api/auth/connect` and surfaces `redirect_url` without auto-redirecting).
  - `modules/runs` — Optional run detail view wired to polling.
  - `modules/dashboard` — Overview hero + quick action cards.
  - `modules/auth` — Login page, provider, hook, and guard.
- **UI**: Tailwind with HQ teal palette; primitives in `src/components` (buttons, cards, alerts, form fields, dropzone, status badge). Layout shell in `src/layout/AppLayout.tsx`.
- **Styling**: Global styles in `src/index.css` (HQ background gradients, card shadows, form field classes). Tailwind theme extended with hq teal/gray/navy colors.
- **Testing**: Vitest + Testing Library with two smoke tests (`src/tests`) covering login form rendering and Part 1 form validation state.
- **qbo-gateway proxy**: Vite dev server proxies `/qbo-api/*` to `QBO_GATEWAY_BASE_URL` (default `http://127.0.0.1:8000`), rewriting the prefix and injecting `X-API-Key` + `Accept: application/json` headers. Set `QBO_GATEWAY_API_KEY` in your shell before `npm run dev`; never store this secret in the frontend `.env`.

## Implementation notes

- **Auth**: The separate `../hq-finops-api` backend verifies scrypt password hashes and owns opaque in-memory sessions. The browser receives only a scoped HttpOnly cookie and a CSRF token; `AuthProvider` restores the session through `/automations/api/session`.
- **Modules**:
  - `modules/qbo` — FinOps API client + Clients & Integrations pages (list/detail/create) and OAuth reconnect UI (calls the allowlisted backend reconnect route and surfaces `redirect_url` without auto-redirecting).
  - `modules/dashboard` — Overview and entry point to client management.
  - `modules/auth` — Login page, provider, hook, and guard.
- **UI**: Tailwind with HQ teal palette; primitives in `src/components` (buttons, cards, alerts, and form fields). Layout shell in `src/layout/AppLayout.tsx`.
- **Styling**: Global styles in `src/index.css` (HQ background gradients, card shadows, form field classes). Tailwind theme extended with hq teal/gray/navy colors.
- **Testing**: Vitest + Testing Library with a login form smoke test in `src/tests`.
- **Gateway boundary**: Vite proxies only `/automations/api/*` to the sibling FinOps backend. The backend calls its allowlisted QBO Gateway endpoints and strips credential fields. The backend repository's own `compose.local.yml` builds its isolated mock gateway with neutral sample entity names.

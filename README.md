# SNAAP

Local implementation of the existing Thai UI with a Fastify/TypeScript API, PostgreSQL, pg-boss and StrategySpec v2. This is development software; production acceptance is not complete.

## Run

```powershell
cd D:\SNAAP
npm ci
npm run dev
```

Open http://127.0.0.1:4173. The welcome popup offers Google login once configured; local development also offers an explicit test-account button. Local mode creates a private PostgreSQL instance on 127.0.0.1:55432. Data survives refresh/restart in `.local/postgres`. No SQLite, tunnel or external deployment. `dist/` contains the maintained frontend source; it is not a generated build directory.

Copy `.env.example` to `.env` to configure external services. Never commit `.env` or `.local`. Google uses `/api/v1/auth/google/callback` and an explicit invited-email list. `npm start` requires `DATABASE_URL` and `APP_ORIGIN`, and has no local-login route. HTTPS termination must preserve Host and forward only the configured origin.

See [Google setup](docs/google-auth-setup.md) and [repository review](docs/repository-review-2026-10-04.md). The repository contains no production credentials or user database. Before committing, stage the intended files and run `npm run check:publication`; this checks the index for runtime files and common credential patterns, including configured secrets in the local `.env`. It is an additional check, not a guarantee against every kind of sensitive content.

## Project structure

| Directory | Responsibility |
| --- | --- |
| `dist/` | Maintained browser UI, shared strategy/preset catalog and vendored chart library |
| `src/api.ts` | HTTP composition, sessions and API routes |
| `src/errors.ts`, `src/crypto.ts` | Shared API errors and token hashing, independent of the server |
| `src/domain/` | Validated strategies, indicator evaluation, replay and import formats |
| `src/ai/` | Bounded LLM harness, provider compatibility and trading guidance |
| `src/data/` | PostgreSQL schema and transactions |
| `src/monitor.ts`, `src/realtime.ts` | Durable signal evaluation and market subscriptions |
| `scripts/`, `tests/` | Development tools and isolated checks |

Production requires persistent PostgreSQL and image storage mounted at `.local/assets`, the encryption key stored separately, HTTPS, provider configuration, and a continuously running monitor. The current production entry point runs the API and monitor together; a separately deployed worker has not been implemented. On a container host set `BIND_HOST=0.0.0.0` and use the platform's `PORT`. Do not start multiple monitor replicas without addressing shared scheduling and process-local market caches.

AI needs the API key **and current per-model prices** for admission budgeting. External tools do not consume additional message quota. No model has an activation/payment/account-permission tool. Stripe defaults to test mode; no live payments have been performed.

## Enable Snaap chat locally

Copy `.env.example` to `.env` if `.env` does not exist, then set `AI_API_KEY` in that file. The template includes the checked prices for its selected models; update both the model and its rates together. Keep the key out of chat, frontend files, and Git.

Restart `npm run dev` after editing `.env`, reload the browser, and send a short message in Chat. Successful setup means an actual assistant reply appears; `/api/v1/health` only reports configuration and does not verify API access or account billing.

For OpenRouter, put its API key in `AI_API_KEY` and set these values in `.env`:

```dotenv
AI_BASE_URL=https://openrouter.ai/api/v1
AI_STANDARD_MODEL=z-ai/glm-5.3-flash
AI_DEEP_MODEL=z-ai/glm-5.3-flash
```

The backend uses the Responses API, including images and function calls. Provider compatibility needs a real chat request to confirm. Set both modes' per-token rates to the selected OpenRouter provider's current prices or a conservative higher estimate; routing prices vary. Leave `AI_BASE_URL` empty to use OpenAI directly.

Snaap's chat guidance lives in `src/ai/skills/`. The harness loads core guidance and exposes `read_skill` for four optional specialists (indicator selection, execution history, risk explanation and research validity). See [skill research and design](docs/snaap-skills-research-2026-10-04.md) for sources, capability boundaries and behavioral evaluation criteria.

## Verify

```powershell
npm run typecheck
npm test
npm run test:integration
npm run test:load
npm run test:backup
```

Integration/load tests create isolated users and clean up only their own test records. The 100-user test measures authenticated API reads, not end-to-end exchange/AI load. Backup validation creates and removes an isolated restore database; keeps the app snapshot under `.local/backups`. It includes app records and private images, excludes PostgreSQL roles/configuration and transient pg-boss jobs. Retain `DATA_ENCRYPTION_KEY` separately.

`npm run test:soak` is a foreground 48-hour HTTP/database availability check. It does **not** substitute for a provider/worker soak and has not been run for 48 hours.

See [implementation status](docs/implementation-status.md) for implemented behavior, known gaps and release gates. The design documents describe the target; this status file describes the actual implementation.

The [Admin Dashboard](docs/admin-dashboard.md) is available at `/admin.html` for authorized administrators. It includes a persistent operational inbox, daily summaries, incident recovery and acknowledgment, user/plan/quota management, and audited temporary user impersonation. Run `npm run test:admin` for its isolated PostgreSQL integration checks.

Notification setup, Channel Studio customization, LINE quota guardrails and the sample signed Webhook receiver are documented in [notification channels](docs/notification-channels.md). `npm run test:notifications` verifies bindings, ownership and concurrent quota reservations with isolated local accounts; it sends no external messages.

# Admin Dashboard

Open `/admin.html` from the account menu. Access requires a database `admin` role, an email in server-side `ADMIN_EMAILS`, or the explicit local development test account. Ordinary users receive 403 from every admin API, including mutation endpoints.

The dashboard includes user and plan management, AI quota management, service diagnostics, an operational inbox, and an audit trail. User search and event filters run on the server and support pagination.

Dashboard reads, refreshes, incident capture, acknowledgments and user-management actions do not call an LLM or consume model tokens. The AI usage and estimated cost cards show existing usage records; starting an AI conversation in the ordinary workbench uses its normal quota and provider tokens. Deep mode remains unavailable; a lifetime Pro grant removes expiry, not monthly quotas.

## Operational inbox

- The overview shows today's registrations and payments, incidents including recoveries, unread events, and the parts of the system with open incidents. Calendar days and displayed dates use `Asia/Bangkok`.
- PostgreSQL triggers capture new registrations, payments/refunds, market status changes, delivery failures/recoveries, AI failures/recoveries, and administrative actions in the transaction that produced them. API 5xx errors are recorded with method, route template, and status, excluding request bodies, query strings, tokens and provider messages.
- Repeated market checks in the same state do not produce new events. Related errors use a stable key and occurrence count. Recovery updates the same incident and makes it unread again. Stopping a setup closes its market incident with an explanation.
- Acknowledgment belongs to each admin account. Acknowledging an incident does not claim the source has recovered. Read-all uses a cutoff so later events stay unread.
- `admin_events`, `admin_event_receipts` and `admin_audit` survive process restarts. The initial migration backfills recent signups/payments/AI failures and current market/delivery problems without duplicating records.
- The monitor records a heartbeat after each completed scan. A heartbeat older than three minutes, or a missing heartbeat when monitoring is enabled, creates a service incident when the inbox is checked. The service card reports the heartbeat, rather than a fixed healthy label.
- The page checks for updates every 15 seconds on all admin tabs. In-page messages are available immediately. Device notifications require opting in and browser permission; the preference can be turned off using the same button. These notifications run while the dashboard is open, not through a background push service.
- If the API or database is unreachable, the page retains previous data with a visible stale-data warning. A complete server/database outage cannot persist its own event while offline; independent external uptime monitoring is outside this implementation.

The design follows [Grafana's grouped alerts](https://grafana.com/docs/grafana/latest/alerting/fundamentals/notifications/group-alert-notifications/) and [Sentry's incident triage](https://docs.sentry.io/product/issues/states-triage/): consolidate repeated events, prioritize active problems, and distinguish acknowledgment from recovery.

## Administrative actions

Plan changes, role changes and quota resets are transactional and record the actor and target. Quota reset preserves the ledger's token and cost history using `quota_waived`; quota admission and usage displays ignore waived records. Reset is blocked during an active AI run.

Manual Pro grants are stored separately and survive Stripe's recalculation after a payment refund. A Free override clears the manual grant; subsequent billing events may restore paid entitlement from surviving purchases. Self-demotion is blocked, and an admin granted through `ADMIN_EMAILS` must be removed in the server configuration.

Impersonation is limited to ordinary user accounts, lasts 15 minutes, and records the actor/target. The workbench shows a banner with a return-to-admin action. Returning revokes the impersonation session and rechecks the original administrator's access. Impersonating another administrator is blocked.

Clearing system logs clears only the bounded in-memory buffer. Durable incident and audit histories remain. Dynamic content is escaped in the admin UI; the page also has a Content Security Policy that blocks inline script execution.

## Verification

```powershell
npm run typecheck
npm test
npm run test:admin
npm run test:integration
```

`test:admin` creates a unique PostgreSQL schema, exercises real SQL and authorization, and removes only that schema. It checks pagination, daily totals beyond a feed page, deduplication, recovery, acknowledgment, stale heartbeats, retained AI usage costs, auditing, impersonation and repeated migration. The frontend tests execute the maintained admin JavaScript against hostile-content and polling scenarios.

For a test-only browser preview, run `npx tsx scripts/admin-integration.ts --serve`, use the test-account login, then open `http://127.0.0.1:4175/admin.html`. The preview uses synthetic data and does not start the exchange worker or send provider notifications.

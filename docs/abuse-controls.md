# Controls for the market trial

SNAAP defaults to unlimited monthly AI/setup/notification usage, with three workspaces including the primary. Abuse prevention remains independent of Free/Pro and unified quotas.

## Admin controls

- Per account: suspend everything, AI, monitoring, or notification sending. Choose one hour, 24 hours, seven days, or until manually restored. Supply an internal reason for both suspension and restoration.
- Expiry restores access automatically. Full suspension revokes existing sessions and prevents new sessions; users must log in again after restoration. Verified administrator accounts are protected against lockout.
- Preserve setup configuration, signals, conversations and accounting. Worker checks stop suspended users from fetching/evaluating market data or sending notifications. AI checks run before reservations and each provider request.
- Paused notifications remain recorded but are cancelled when access returns, so old trading alerts do not arrive in a burst. New alerts can send normally.
- Global emergency switches independently pause AI, monitoring and notification sending. Admin settings and reports remain available. Existing external requests may finish; a switch cannot recall an accepted message or model request.
- Configure request burst protection at 30–600 requests/minute (default 180). Authenticated traffic is keyed by account, pre-login traffic by IP. This is independent of monthly product quotas.
- Changes use revision checks and durable admin audit history containing actor, target, reason and before/after state. Internal reasons are not disclosed to the affected user.

## Research and adaptation

1. [Auth0: block and unblock users](https://auth0.com/docs/manage-users/user-accounts/block-and-unblock-users) provides reversible administrator account blocks and login event records. [Its session guidance](https://support.auth0.com/center/s/article/Does-blocking-a-user-end-their-session) explains that application-local sessions need separate handling. SNAAP revokes its own sessions and checks workers as well as login.
2. [Cloudflare: rate limiting best practices](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/) separates endpoint use cases and can count requests by authenticated identity. SNAAP retains account-based burst protection independently of the plan; this application limiter is process-local. Before scaling to multiple app processes, use a shared limiter and edge rules. Origin protection/WAF changes are not part of this local implementation.
3. [Stripe Radar rules](https://docs.stripe.com/radar/rules) distinguish allow, block and manual review actions. Adaptation: high usage alone is not an automatic ban during the market trial; an admin reviews numbers and chooses a scoped, reversible action.
4. [OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) calls for recording administrative actions with who/what/when and protecting sensitive logs. SNAAP stores reasons only in the admin control/audit surfaces and does not expose tokens or user chat content in these reports.

## Further controls to evaluate using trial data

- Alert-only thresholds for daily AI spend, token volume and notification spikes, then manual review. Calibrate with real usage before enabling automatic restrictions.
- Daily/global spend budgets and per-feature cooldowns once cost distribution is understood.
- Edge bot challenges and origin protection if signup or distributed request abuse appears. Avoid IP-only account bans because users can share networks.
- A support/review path for disputed suspensions, with a published usage policy. Do not interpret high legitimate trading activity as abuse without evidence.

These are follow-up candidates, not controls implemented by this change. No external security service has been connected and no production account has been suspended.

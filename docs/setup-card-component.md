# Conversation setup cards

`dist/setup-card.js` owns the shared presentation for preset cards and newly applied AI draft proposals. It consumes the structured, validated strategy; the LLM does not supply HTML or layout instructions.

Order: name/status → pair/exchange/side/timeframe → entry/confirmation/exit/cancellation/cooldown → optional destinations or change details → next action.

States:

- Draft: edit + save.
- Saved and unchanged: edit + enable notifications.
- Modified: edit + save changes; activating an outdated rule is unavailable.
- Active: pause remains available, including when draft settings have changed.
- Failed action: inline, plain-language error; saving and activation remain separate operations.
- Historical AI changes: read-only disclosure; never describe old changes as the current saved state.

Preset prose duplicating the structured card is omitted during rendering. Existing persisted message content is preserved. Channel selection remains optional; in-app delivery is implicit.

The renderer escapes strategy strings and only inserts its own fixed markup. Conditions preserve AND/OR labels and grouping. Additional destination UI uses existing handlers and permissions. Enabling alerts still requires a saved unchanged revision and the existing backend confirmation contract.

Design references: [Atlassian panels](https://atlassian.design/components/panel/usage) for heading/action hierarchy, and [Carbon notifications](https://www.carbondesignsystem.com/building-blocks/core/components/notification/code) for contextual error feedback. The Snaap typography, theme variables and lime accent are retained.

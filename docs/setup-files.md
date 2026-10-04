# Portable trade setups

The setup UI now uses sharing codes instead of file dialogs; see `setup-codes.md`. The JSON API described below remains compatible.

Open the file icon in the chat toolbar, or **นำเข้า / ส่งออก** in the saved setup list. Export the current draft, saved setups from the current workspace, or a selection of both. Import a JSON file, review its conditions and selected entries, then confirm. Imports always create new inactive records in the currently selected workspace and never overwrite existing setups.

Format: `{ "format": "snaap.trade-setups", "version": 1, "setups": [StrategyV2] }`. Single raw StrategyV2 objects are also accepted. Maximum 50 setups and 1 MiB per import. The existing strategy validator checks indicators, custom formula terms, periods, conditions, depth, targets and lifecycle rules. All entries are validated before any insertion, then inserted with their initial revisions in one transaction.

Files contain only strategy configuration. Notification destination IDs are removed on export and import. Account credentials, workspace IDs, owner IDs, chat messages, uploaded pictures, trade history and active state are not included. Custom formula definitions embedded in condition operands are preserved. Chart-only display overlays are outside this format.

Preview validates the format and calculations; it does not certify exchange instrument availability or strategy profitability. Existing activation checks still apply when a user enables imported setups.

Validation: `tests/setup-files.test.ts`, `scripts/setup-files-integration.ts` (real PostgreSQL, authentication, workspace isolation, no partial insertion on invalid bundle, revision creation and inactive state), and `qa/setup-files-browser.js` (download / re-upload / preview / selection using real preview validation and fixture import confirmation, desktop and mobile).

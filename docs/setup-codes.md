# Setup sharing by code

The current interface uses codes only. In Notifications → saved setups, **นำเข้าเซตอัป** sits next to the add button. Every saved setup has **ส่งออกเซตอัป**, which creates a code and opens a copy dialog. Importing requires entering a code, reviewing a preview, then confirming addition to the current workspace. File JSON endpoints remain compatible but are no longer presented in the setup interface.

Codes use 12 random unambiguous base32 characters (60 bits) grouped as `SNAAP-XXXX-XXXX-XXXX`. Case, spaces and hyphens are normalized. Only a SHA-256 hash is stored alongside the owner ID and a validated immutable setup snapshot. Shared snapshots exclude notification destinations, account credentials, owner/workspace identifiers and trading history. Looking up a code requires authentication and the existing API rate limits; knowing a code allows access to that snapshot.

Export checks source ownership and the current workspace. Import always creates a new inactive rule owned by the recipient in their selected workspace, plus its initial revision in a transaction. Imported copies remain independent when the source changes or the share is revoked. `DELETE /api/v1/setup-shares/:code` is owner-only; deletion blocks future lookup/import and does not delete recipient copies. Codes currently have no automatic expiry.

Verification: random/normalization tests, strategy round-trip tests, `scripts/setup-files-integration.ts` against real PostgreSQL and authenticated Fastify routes, and `qa/setup-codes-browser.js` for invalid codes, preview-before-confirmation, export display and desktop/mobile layout using fixture share responses.

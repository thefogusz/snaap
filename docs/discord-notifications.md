# Discord notification channel

Discord uses an incoming webhook copied from the target channel's Integrations → Webhooks settings. Connecting sends one clearly disclosed verification message. A successful HTTP response must include the created message ID before the destination is marked verified. The user then selects the verified destination in a setup.

Only `https://discord.com/api/webhooks/<id>/<token>` and its v10 form are accepted; custom ports, credentials, query strings, fragments and other paths/hosts are rejected. Delivery adds `wait=true`, disables mentions, limits content to 2,000 characters and uses the existing DNS-pinned public IPv4 transport without following redirects.

Webhook URLs are encrypted with the existing data key and authenticated with destination owner and ID. List responses never expose the URL. Discord needs a valid DATA_ENCRYPTION_KEY but no bot token. Database kind is text, so no schema migration is needed.

Delivery uses the existing signal/delivery queue. Explicit 429/5xx results retry with the existing bounded policy. Ambiguous network failures are UNKNOWN rather than blindly duplicating messages. Disconnecting disables subsequent delivery. These notifications contain trade signals, not exchange orders.

The UI separates the always-available in-app inbox from external provider cards, and shows configuration availability and existing connections. Discord also appears in the preset channel connector. Its connect button discloses the verification message and hides URL input characters.

Static TypeScript and JavaScript checks passed. No real Discord credentials were entered and no messages were sent during implementation; live delivery needs a user-provided webhook.

Reference: [Discord incoming webhooks](https://discord.com/safety/using-webhooks-and-embeds).

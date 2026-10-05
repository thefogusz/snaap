# AI provider recovery

The Responses SDK transforms `output` on bodies marked `object: response` before returning a response. A compatible provider can return an error envelope under HTTP 200 without `output`, causing that transform to throw and hide the provider error. The harness now uses the SDK's raw POST transport, checks error bodies and output structure first, and constructs visible text only from output_text content. This failure shape is reproduced by a fixture; the exact body of the original production failures was not retained.

OpenRouter requests require providers to support the submitted parameters. The configured model, reasoning and output token limit stay in place. We do not silently replace the model or retry incompatible requests. Transient 429/502/503/504 failures receive at most one retry under the same 90-second run deadline; timeouts, malformed responses, incomplete output and 400/422 failures do not retry.

Traces include the error class, status, provider code, parameter and request ID. Provider messages and raw bodies are excluded because they may echo private data. Exhausted failures retain the existing refund path and return a clearer user message. This improves recovery but does not guarantee provider availability.

Per-request dollar admission limits were removed on 2026-10-05 at the user's request after further COST_BOUND failures. The harness no longer estimates text bytes as reserved input tokens, shrinks output allowances to fit remaining dollars, or substitutes a budget-exhaustion acknowledgement for the final model response. Every model round uses the configured output token limit. Legacy AI_STANDARD_MAX_USD and AI_DEEP_MAX_USD values are ignored. Actual provider token usage and estimated dollar cost still populate the ledger; daily quotas, the shared 90-second deadline, tool/round limits, schema checks and ownership rechecks remain enforced.

A further real proposal failed because the model put MACD slow/signal into extended `params`, which the legacy indicator schema rejects. Guidance now includes a concrete MACD operand with top-level period/slow/signal and instructs EMA/RSI to omit `params` too.

Invalid proposals are still rejected and cannot replace the prior editable draft. Provider failures and tool/deadline exhaustion still refund daily message quota.

References: [OpenRouter Responses API](https://openrouter.ai/docs/api/api-reference/responses/create-responses) and [provider routing](https://github.com/OpenRouterTeam/docs/blob/main/guides/routing/provider-selection.mdx).

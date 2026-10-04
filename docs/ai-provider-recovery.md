# AI provider recovery

The Responses SDK transforms `output` on bodies marked `object: response` before returning a response. A compatible provider can return an error envelope under HTTP 200 without `output`, causing that transform to throw and hide the provider error. The harness now uses the SDK's raw POST transport, checks error bodies and output structure first, and constructs visible text only from output_text content. This failure shape is reproduced by a fixture; the exact body of the original production failures was not retained.

OpenRouter requests require providers to support the submitted parameters. The configured model, reasoning and token/cost caps stay in place. We do not silently replace the model or retry incompatible requests. Transient 429/502/503/504 failures receive at most one retry under the same 90-second run deadline; timeouts, malformed responses, incomplete output and 400/422 failures do not retry.

Traces include the error class, status, provider code, parameter and request ID. Provider messages and raw bodies are excluded because they may echo private data. Exhausted failures retain the existing refund path and return a clearer user message. This improves recovery but does not guarantee provider availability.

Real four-image testing also reproduced a separate budget failure: find_instruments and propose_strategy succeeded, but reserving another image-heavy round for the final prose exceeded the remaining budget and discarded the validated draft. When the last executed tool is a successful proposal, actual recorded cost is within the cap, and another summary cannot fit, the harness now returns that validated draft with a deterministic acknowledgement. It explicitly states that further analysis was not completed; normal context/ownership rechecks still run before persistence. Invalid proposals and actual over-cap responses remain failures. No cost cap was raised.

A further real proposal failed because the model put MACD slow/signal into extended `params`, which the legacy indicator schema rejects. Guidance now includes a concrete MACD operand with top-level period/slow/signal and instructs EMA/RSI to omit `params` too.

If a proposal remains invalid and another repair round cannot fit within the budget, the error says the draft failed validation rather than suggesting that the attachments were lost. The prior editable draft stays intact.

References: [OpenRouter Responses API](https://openrouter.ai/docs/api/api-reference/responses/create-responses) and [provider routing](https://github.com/OpenRouterTeam/docs/blob/main/guides/routing/provider-selection.mdx).

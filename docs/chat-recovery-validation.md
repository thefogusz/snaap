# Chat recovery validation

Local browser testing used the supplied four chart images and the configured real OpenRouter model, with no mock provider for these turns. Tests did not save an active rule or place an order. No production deployment was performed.

- All four images uploaded together; the model identified 4h, 1h, 15m and 5m.
- Follow-up requests reused the four retained image IDs without uploading again.
- Reload restored all four attachments and the text of a failed request.
- The real model created a valid MEXC PHA/USDT Futures LONG draft with 20 comparisons across four timeframes. The editor displayed 20/20 and disabled adding another comparison.
- A follow-up changed the 5m RSI upper threshold from 70 to 65, preserving 20 comparisons. The persisted conversation draft was independently validated with the strategy schema.
- A subsequent follow-up replaced the 5m RSI lower threshold with MACD CROSS_ABOVE MACD_SIGNAL. One invalid group proposal failed and retained the prior draft; a corrected retry succeeded with 20 comparisons and the original four attachments.

The real runs also exposed the summary-budget and legacy MACD parameter failures described in ai-provider-recovery.md. Passing these cases does not imply that a stochastic model always emits valid proposals or that upstream availability is guaranteed.

Automated validation: 418 unit tests passed; TypeScript and frontend syntax checks passed; 10 harness contract groups passed. Coverage includes 20/21 comparison boundaries, Long/Short totals, mirrored templates, invalid proposals, actual cost overruns, HTTP 200 error envelopes, refund accounting, attachment recovery and owner/workspace isolation.

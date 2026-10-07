# Harness + real model UX audit — 2026-10-08

Checkout: `C:/Users/Gus/.codex/worktrees/5913/SNAAP`, branch `codex/exchange-market-research`, base `dce9693`. The audit continues the native-asset implementation rather than changing its base. Origin was fetched; `origin/main` remained `0864524`.

## What was exercised

Configured OpenRouter model: `deepseek/deepseek-v4.1-flash`. Four isolated API turns used real public exchange catalogs/candles, followed by three actual browser chat turns. No fixture LLM or synthetic candles were used for these seven turns. Monitoring was disabled; no signal rule was saved or activated. Test draft name was restored after the browser check.

| Check | Observed result |
| --- | --- |
| Gate instrument lookup | TSLA/USDT returned as an exchange reference perpetual in the stocks category. |
| All-source stock search | TSLA/USDT on Binance, Bybit, OKX, Bitget and Gate; TESLA/USDT on MEXC. UI search and tool output agreed. |
| Mixed-source name edit | Only the name changed; Binance BTC/USDT and Gate TSLA/USDT exact targets were retained. |
| Gate evidence inspection | Public closed candles, source and evaluation/reference timestamps returned; no draft edit. |
| Browser name edit | Editor, chat draft card and one-field change receipt agreed; other settings were preserved. |
| Ask Snaap shortcut | Prefilled the condition and focused the chat; actual tools inspected both saved Gate pairs. TSLA close 377.83 versus EMA200 378.036470 and XAU close 4117.03 versus EMA200 4139.134201 matched the tool evidence for the closed 15m candle at 2026-10-07 20:45 UTC. |
| Read-only browser asset search | Aggregated stocks search executed, saved Gate source retained, closed-bar evidence stayed visible after the fix. |

Browser completion timings from stored run/assistant timestamps: rename 3.745s, two-pair inspection 20.606s, search 6.698s. These are individual samples including model/tool work, not percentile measurements or a concurrent-user benchmark. Internal estimated cost for all seven turns was about USD 0.132 using configured Snaap rates; this is not an OpenRouter billing reconciliation.

## UX finding fixed

`renderDesigner` called `queueDraftSave` even for an unchanged draft. That emitted `setup-changed`, cleared the condition evidence and selected-bar state, while the chart correctly skipped recomputation for the unchanged request. The UI temporarily showed “รอคำนวณ” with valid chart data already present.

The existing save function now emits the change event only when the conversation/workspace scope or draft actually changes. Autosave behavior is retained. A regression check covers repeated unchanged saves, a real draft edit and changing conversations. The browser recheck confirmed identical price, EMA and reference-time text before and during a read-only real-model request.

The pair help tooltip also parsed the compact “2 คู่เทรด” button caption as a pair, displaying an `undefined` quote currency. It now receives the first canonical pair through explicit button metadata and labels the explanation as an example. A regression check covers the multi-pair caption.

## Remaining usability observations

- The inspected desktop chat column was 300px wide (262px text width) at a 1920px viewport. Long model explanations require considerable vertical scrolling. The existing resize separators allow adjustment; a wider desktop default and shorter replies would help.
- Model replies sometimes expose `valid`, `READY`, contract enum terminology, or add an irrelevant note about absent images despite existing prose guidance. Tool/data correctness passed; presentation should be evaluated separately before claiming consistently concise replies.
- The asset selector briefly displays a zero selection count while its initial catalog is loading, then restores both saved selections. Keeping the previous count visible would reduce uncertainty.
- Source dropdown used the existing custom listbox, retained its selection and fit inside the 320px viewport. The dialog was 304px wide with no horizontal overflow. Categories and longer menus use their own scrolling.
- Search results in chat are prose; selecting assets through the picker remains a separate step, or the user must explicitly ask Harness to edit the draft. No clickable batch-selection card was added in this audit.

Verification: 578 unit tests, TypeScript, Harness smoke protocol; no browser console errors/warnings observed. Screenshots and real-provider traces are under ignored `.local/audit/`. This checks the inspected native-market paths, not all model behaviors, exchange uptime or thousand-user latency.

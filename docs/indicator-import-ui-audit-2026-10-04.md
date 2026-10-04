# Indicator import UI check — 2026-10-04

The import action previously occupied a cell in the operand field grid, interrupting the field rows. It now sits in the operand card heading, with an explicit button style and the shared help icon. Field rows contain only operand settings.

Real browser flow: opened import dialog, selected dist/assets/indicator-example.json using the file picker, server validated the formula, the operand changed to CUSTOM (EMA 12 − EMA 26), and the chart computed 500 closed bars. Invalid JSON was rejected with an actionable error. A valid JSON file containing unsupported PINE terms was rejected by server schema validation. No setup was activated. The draft was restored using undo after the successful sample import.

Further fixes: import preserves the target operand timeframe and price source; closing the dialog cancels late application; changing workspace or draft during validation requires reopening; focus returns to the import action; unsupported-schema errors now explain what to check. Scope: SNAAP JSON v1 only. No direct execution or automatic conversion of arbitrary Pine Script.

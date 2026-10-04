# Interaction design — 2026-10-03

## Follow-up correction after user review

The initial four-card notifications layout did not establish a primary task and exposed a blank, unusable channel selector when providers were unconfigured. Replaced it with inbox/channels/activity views, a single content region, explicit channel readiness and a connection form only for a configured provider (Webhook URL only for Webhook). Removed the old prototype notification markup to prevent a flash of obsolete UI. Initial routing now selects the requested page before loading data. Aligned the welcome conversation selector with the composer and reduced the decorative emblem.

Verified empty inbox, channel readiness, activity navigation, refresh route, no unavailable-provider form, keyboard focus preservation, dark/light and 320/390px layouts. Browser console clean. Provider connection submission remains untested because provider credentials are absent.

## Direction

Keep SNAAP's neutral surfaces, lime accent, readable Thai text and existing navigation. Use icons to identify actions and motion to explain changes. No decorative looping animation while idle.

References reviewed:
- [Linear UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui): consistent alignment, neutral hierarchy and contrast across themes.
- [Linear interface refresh](https://linear.app/now/behind-the-latest-design-refresh): predictable action placement and compact controls.
- [Material motion](https://m3.material.io/styles/motion/overview/how-it-works): transitions communicating changes of state.

Icons are original SVG paths; no external artwork, animation library or third-party icon package is loaded.

## Implemented

- Welcome shortcuts with icon, clear label and directional affordance.
- Chat attachment/context toolbar, labeled send icon, empty guidance and actual request progress indicator.
- Editor jump navigation (conditions/test/save), section symbols, selectable exchange chips, undo/crop/remove icons with accessible names and hover/focus tooltips.
- Save-state dot with text; replay placeholder while the actual request runs.
- Alert empty illustration, active-state marker, action icons; import file picker; channel/history section icons; plan allowance tiles.
- Short 160–280 ms control/panel transitions. Interactive undo/image/crop/save/send icon feedback. Reduced-motion media query disables transitions and repeating motion.

Critical actions retain text, including activating rules, disconnecting accounts and buying a plan. The editor route is navigation, not a claim that a step has passed validation.

## Verification

- Browser checked in both themes. Editor has no horizontal overflow at 320, 390, 768, 1024 and 1440 px.
- Editor jump places keyboard focus on the target input; compact controls have accessible names; mobile chat/editor tabs switch correctly.
- History picker, notification sections, plan allowances and alert empty state inspected. Browser error log clean after correction of a broad decoration selector; decoration now explicitly excludes non-button containers.
- Existing 19 unit tests and TypeScript check passed. No full screen-reader or reduced-motion OS emulation audit performed.

## Editor layout correction

The earlier page-level overflow check missed crowded controls inside the right column. The editor now takes the main content width by default, with chat/editor tabs on all screen sizes. Side-by-side mode is optional at 1600 px and above. Each operand has labeled fields, and comparison reads vertically: inspected value, operator, comparison value. Container queries reduce fields to two or one column based on actual panel width. Mobile save actions scroll with the form instead of covering it. Empty conversation selectors are hidden; history helper text has separation before the next field.

Verified the default editor at 320, 390, 768, 1024 and 1440 px: no page overflow and no visible input/select/button extending outside the editor. Visually inspected dark/light editor and mobile notifications (all four tabs), history and billing. Browser error log empty. Syntax check, TypeScript check and 19 unit tests passed. This does not establish every nested-rule or populated-data state as visually verified.

## Chat consolidation — 4 October 2026

Consolidated follow-up textarea, attachments, mode, evidence tools and expandable sources into one rounded composer. Replaced the visible native conversation selector with a searchable native modal dialog (dates, empty results, Escape, focus return). The hidden selector retains the existing conversation-loading logic. Tabs use softer pill surfaces and an active accent; state changes animate for 200–360 ms and honor prefers-reduced-motion. No idle decorative loop.

Browser checks: search/no matches, selection closes dialog and opens chat, Escape, context expansion, chat/design switching, dark/light, 320/390/768/1440 layouts. No horizontal page overflow in these states and no browser errors. JavaScript syntax and TypeScript checks passed. Real AI remains unavailable in the local configuration.

## Shared dropdowns — 4 October 2026

Added selects.js/selects.css to style the expanded list as well as the trigger throughout the live app and standalone system-design page. Keeps original selects for form values and existing change handlers; the saved-conversation selector remains hidden behind its dedicated search dialog. Menus use semantic combobox/listbox/option roles, selected/disabled states, arrows/Home/End/Enter/Escape/Tab and typeahead; close outside, on resize/outer scroll, and preserve focus across rule rerenders. Reduced-motion respected.

Browser verified: AI mode skips disabled Pro, rule comparison changes value and supports undo/focus return, history exchange keyboard selection, standalone scenario selection. No unconverted eligible selects in inspected DOM. At 320px open menu stayed within viewport without horizontal overflow. Both themes inspected; browser error log empty. JavaScript syntax and TypeScript checks passed. Full screen-reader compatibility not audited.

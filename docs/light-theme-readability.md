# Light theme readability audit

Checked the rendered chat, setup list, designer with advanced conditions, market dropdown, workspace dialog, My Data, billing and notification inbox/channels/activity. Browser measurements include visible text and placeholders, computed foreground/background colors, background alpha composition, nested opacity and large-text thresholds. Modal checks exclude the covered page; disabled controls and decorative icons are not counted as normal text. This is a scoped contrast check, not a complete accessibility certification.

The Snaap wordmark in the chat used button-fill lime `#d0f64c` on `#f8f9f5`, contrast 1.17:1. Light mode now uses the separate foreground token `--accent-ink: #4d6b00`, contrast 5.81:1. Dark mode retains the bright lime. The sidebar star follows the same foreground token.

Also strengthened essential form borders (3.18:1 on the page background), selected controls, active-status dots, selected chat tabs and keyboard focus. Composer focus has an explicit dark-green boundary. Chart marker labels use darker green/red on light surfaces. Button fills remain the brand lime with dark text.

After correction, no below-threshold text was found in the ten checked states. Mobile checks at 390px verified the light accent, focus boundary, no horizontal overflow, and the unchanged dark accent. Contrast uses the W3C relative-luminance method with 4.5:1 for ordinary text and 3:1 for large text: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

Local QA: `qa/light-contrast-audit.js` and `qa/light-readable-mobile.js`; screenshots are saved under `qa/light-audit-*` and `qa/light-readable-mobile.png`.

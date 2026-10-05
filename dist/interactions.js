"use strict";
// Original, consistent 24px line icons. Decoration never changes business actions.
const snaapIcons = {
  chat: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H8l-5 2 1.5-5A8.5 8.5 0 1 1 21 11.5Z"/>',
  chart: '<path d="M4 4v16h16M8 15l4-5 4 2 4-6"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14" transform="translate(0 -2)"/>',
  save: '<path d="M5 3h12l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M7 3v6h10V3M7 21v-7h10v7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  pencil: '<path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  crop: '<path d="M6 3v15h15M3 6h15v15"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 17l10 5 10-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  branch:
    '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M6 14h6a6 6 0 0 0 6-5"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  sliders:
    '<path d="M4 7h4m6 0h6M4 17h10m4 0h2"/><circle cx="11" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  arrowUp: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  trendUp: '<path d="m4 17 6-6 4 4 6-10M14 5h6v6"/>',
  trendDown: '<path d="m4 7 6 6 4-4 6 10M14 19h6v-6"/>',
  spotBuy: '<circle cx="10" cy="12" r="7"/><path d="M10 9v6M7 12h6M17 6a7 7 0 0 1 0 12"/>',
  send: '<path d="m3 3 18 9-18 9 4-9Zm4 9h14"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9ZM14 3v6h6M8 13h8M8 17h5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  link: '<path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 9h18c0-1-3-1-3-9M10 21h4"/>',
  card: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h4"/>',
  qr: '<path d="M3 3h6v6H3ZM15 3h6v6h-6ZM3 15h6v6H3ZM15 15h2v2h4v4h-6ZM21 12v2M12 3v3M12 12h2M12 19v2"/>',
  exit: '<path d="M10 4H4v16h6M10 12h11m-5-5 5 5-5 5"/>',
  inbox: '<path d="M5 4h14l3 11v5H2v-5Zm-3 11h6l2 3h4l2-3h6"/>',
  shield:
    '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/>',
};
function uiIcon(name, extra = "") {
  if (!snaapIcons[name]) return "";
  return `<svg class="ui-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${snaapIcons[name]}</svg>`;
}
function uiEmpty(icon, title, description, action = "") {
  return `<div class="visual-empty"><div class="empty-symbol">${uiIcon(icon)}<span class="empty-orbit"></span></div><h2>${title}</h2><p>${description}</p>${action}</div>`;
}
const iconActions = [
  ["[data-attach-image]", "image"],
  ["[data-context]", "layers"],
  ["[data-undo]", "undo", true],
  ["[data-crop-image]", "crop", true],
  ["[data-remove-image]", "close", true],
  ["[data-remove]", "close", true],
  ["[data-save]", "save"],
  ["[data-replay]", "chart"],
  ["[data-group]", "branch"],
  ["[data-hold]", "clock"],
  ["[data-stage],[data-add]", "plus"],
  ["[data-optional=exit]", "exit"],
  ["[data-optional=cancel]", "close"],
  ["[data-open-rule]:not(.watch-edit)", "sliders"],
  ["[data-export]", "file"],
  ["[data-checkout=card]", "card"],
  ["[data-checkout=promptpay]", "qr"],
  ["[data-portal]", "sliders"],
  ["[data-confirm-import]", "check"],
  ["[data-confirm],[data-apply]", "check"],
  ["[data-cancel],[data-keep]", "undo"],
  ["[data-disconnect]", "link"],
  ["[data-tab=design]", "sliders"],
  ["#followup-form button", "send", true],
  ["#channel-form button", "link"],
  ["#connect-history button", "shield"],
  ["[data-sync] button", "clock"],
  ["[data-revoke-key]", "link"],
];
function decorateControls(root = document) {
  const query = selector => [
    ...(root.matches?.(selector) ? [root] : []),
    ...root.querySelectorAll(selector),
  ];
  for (const [selector, icon, compact] of iconActions) {
    query(selector).forEach((button) => {
      if (button.tagName !== "BUTTON" || button.classList.contains("snaap-select-trigger") || button.getAttribute('role') === 'switch') return;
      const text = button.textContent.trim();
      if (button.dataset.iconLabel === text && button.querySelector(".ui-icon"))
        return;
      button.dataset.iconLabel = text;
      button.classList.add("with-icon");
      const svg = document.createElement("span");
      svg.className = "control-symbol";
      svg.innerHTML = uiIcon(icon);
      const label = document.createElement("span");
      label.textContent = text;
      if (compact) {
        button.classList.add("compact-control");
        label.className = "sr-only";
        button.setAttribute("aria-label", text);
        button.dataset.tooltip = text;
      }
      button.replaceChildren(svg, label);
    });
  }
  query("[data-activate-rule]").forEach((button) => {
    if (button.querySelector(".ui-icon")) return;
    button.classList.add("with-icon");
    button.insertAdjacentHTML(
      "afterbegin",
      uiIcon(button.textContent.includes("หยุด") ? "pause" : "play"),
    );
  });
  query(".runtime-card h2").forEach((heading) => {
    if (heading.querySelector(".ui-icon")) return;
    const text = heading.textContent;
    const icon = text.includes("Pro")
      ? "spark"
      : text.includes("สัญญาณ")
        ? "inbox"
        : text.includes("ตรวจ")
          ? "chart"
          : text.includes("ช่องทาง")
            ? "bell"
            : text.includes("ส่ง")
              ? "send"
              : text.includes("API")
                ? "link"
                : "file";
    heading.insertAdjacentHTML("afterbegin", uiIcon(icon));
  });
  query(".setup-section h3").forEach((heading) => {
    if (heading.querySelector(".step-symbol")) return;
    heading.insertAdjacentHTML(
      "afterbegin",
      `<span class="step-symbol">${uiIcon(heading === document.querySelector('.setup-section h3') ? "sliders" : heading.textContent.includes("ออก") ? "exit" : "clock")}</span>`,
    );
  });
}
// Only decorates newly rendered controls; text/attribute updates do not restart motion.
let decorationFrame;
const decorationRoots = new Set();
new MutationObserver((records) => {
  for (const record of records) {
    const control = record.target.closest?.('button, .runtime-card h2, .setup-section h3');
    if (control) decorationRoots.add(control);
    for (const node of record.addedNodes) {
      if (node.nodeType === 1) decorationRoots.add(node);
    }
  }
  if (!decorationRoots.size) return;
  if (decorationFrame) return;
  decorationFrame = requestAnimationFrame(() => {
    decorationFrame = null;
    const roots = [...decorationRoots].filter(root => root.isConnected);
    decorationRoots.clear();
    const rootSet = new Set(roots);
    // A list rendered in one batch can add hundreds of siblings. Scan their
    // shared parent once instead of running every selector for each row.
    const siblings = new Map();
    for (const root of roots) {
      const parent = root.parentElement;
      if (!parent) continue;
      const count = (siblings.get(parent) ?? 0) + 1;
      siblings.set(parent, count);
      if (count > 1) rootSet.add(parent);
    }
    for (const root of rootSet) {
      let parent = root.parentElement;
      while (parent && !rootSet.has(parent)) parent = parent.parentElement;
      if (!parent) decorateControls(root);
    }
  });
}).observe(document.body, { childList: true, subtree: true });
decorateControls();

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-jump]");
  if (!target) return;
  const panel = document.querySelector(".design-panel");
  const destination = panel?.querySelector(target.dataset.jump);
  if (!destination) return;
  if (destination.tagName === "DETAILS") destination.open = true;
  destination.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
    block: "center",
  });
  const focus = destination.matches("button")
    ? destination
    : destination.querySelector("summary,input,select,button");
  focus?.focus({ preventScroll: true });
  destination.classList.remove("attention-ring");
  requestAnimationFrame(() => destination.classList.add("attention-ring"));
});

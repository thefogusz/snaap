const logo = document.querySelector(".logo-play");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let pointerFrame = 0;
logo.addEventListener("pointermove", (event) => {
  if (reducedMotion.matches || event.pointerType === "touch") return;
  cancelAnimationFrame(pointerFrame);
  pointerFrame = requestAnimationFrame(() => {
    const bounds = logo.getBoundingClientRect();
    logo.style.setProperty(
      "--y",
      `${((event.clientX - bounds.left) / bounds.width - 0.5) * 24}deg`,
    );
    logo.style.setProperty(
      "--x",
      `${((event.clientY - bounds.top) / bounds.height - 0.5) * -18}deg`,
    );
  });
});
logo.addEventListener("pointerleave", () => {
  cancelAnimationFrame(pointerFrame);
  logo.style.setProperty("--x", "0deg");
  logo.style.setProperty("--y", "0deg");
});
logo.addEventListener("click", () => {
  const expanded = logo.getAttribute("aria-pressed") !== "true";
  logo.setAttribute("aria-pressed", String(expanded));
  document.querySelector("#play-label").textContent = expanded
    ? "CLICK TO BRING IT TOGETHER"
    : "CLICK TO SNAAP";
});

if (!reducedMotion.matches && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove("pending");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 },
  );
  document.querySelectorAll(".reveal").forEach((section) => {
    section.classList.add("pending");
    observer.observe(section);
  });
}
const experience = document.querySelector(".experience");
const next = document.querySelector("#story-next");
const back = document.querySelector("#story-back");
let phase = "idea";
let idea = "pullback";
let destination = "Telegram";
const strategies = {
  pullback: {
    trend: "ราคาเหนือ EMA 200",
    timing: "RSI ตัดขึ้นเหนือ 30",
    label: "PULLBACK SETUP",
    caption: "ราคาเหนือ EMA 200 + RSI ตัดขึ้น 30",
    alert: "BTC เข้าเงื่อนไขย่อในขาขึ้น",
    indicator: "EMA 200",
    path: "M25 269C220 262 300 205 440 209S700 192 955 150",
    values: [
      230, 213, 224, 181, 200, 163, 174, 141, 151, 114, 130, 152, 165, 176, 161,
      138, 145, 112, 83, 94, 56, 71, 36, 42,
    ],
  },
  breakout: {
    trend: "ราคาทะลุจุดสูงสุด 20 แท่ง",
    timing: "Volume เหนือค่าเฉลี่ย 20 แท่ง",
    label: "BREAKOUT SETUP",
    caption: "ทะลุแนวต้าน 20 แท่ง + Volume ยืนยัน",
    alert: "BTC ทะลุแนวต้านพร้อม Volume",
    indicator: "RESISTANCE · 20",
    path: "M25 150H955",
    values: [
      238, 212, 225, 197, 213, 179, 194, 174, 187, 169, 180, 170, 188, 176, 164,
      136, 143, 108, 91, 102, 64, 76, 40, 49,
    ],
  },
};
function updateStrategy() {
  const data = strategies[idea];
  document.querySelector("#rule-trend").textContent = data.trend;
  document.querySelector("#rule-timing").textContent = data.timing;
  document.querySelector("#chart-strategy").textContent = data.label;
  document.querySelector("#condition-caption").textContent = data.caption;
  document.querySelector("#delivery-title").textContent = data.alert;
  document.querySelector("#indicator-label").textContent = data.indicator;
  document.querySelector("#indicator-path").setAttribute("d", data.path);
  const candleRoot = document.querySelector("#story-candles");
  candleRoot.replaceChildren();
  const ns = "http://www.w3.org/2000/svg";
  data.values.forEach((close, index) => {
    const open = index ? data.values[index - 1] : 243;
    const x = 30 + index * 40;
    const group = document.createElementNS(ns, "g");
    group.classList.add("candle");
    group.classList.toggle("candle-down", close > open);
    if (index >= 15) group.classList.add("future-candle");
    group.style.setProperty("--i", index);
    const wick = document.createElementNS(ns, "path");
    wick.setAttribute(
      "d",
      `M${x} ${Math.min(open, close) - 9}V${Math.max(open, close) + 9}`,
    );
    const body = document.createElementNS(ns, "rect");
    body.setAttribute("x", x - 8);
    body.setAttribute("y", Math.min(open, close));
    body.setAttribute("width", 16);
    body.setAttribute("height", Math.max(Math.abs(open - close), 3));
    group.append(wick, body);
    candleRoot.append(group);
  });
  document
    .querySelector(".chart-area")
    .setAttribute(
      "d",
      `M${data.values.map((y, i) => `${30 + i * 40} ${y}`).join("L")}L950 310H30Z`,
    );
}
function showPhase(value) {
  phase = value;
  experience.dataset.phase = phase;
  experience.dataset.delivered = "false";
  document.querySelectorAll("[data-scene]").forEach((scene) => {
    scene.hidden = scene.dataset.scene !== phase;
  });
  document
    .querySelectorAll("[data-progress]")
    .forEach((item) =>
      item.classList.toggle("active", item.dataset.progress === phase),
    );
  const copy = {
    idea: [
      "คุณมีไอเดีย ที่เหลือให้ Snaap ช่วย",
      "What if becomes what’s next.",
      "ให้ Snaap ออกแบบ",
      "01",
    ],
    build: [
      "จากสิ่งที่คุณคิด สู่เงื่อนไขที่มองเห็น",
      "An idea. Connected.",
      "เห็นเซ็ตอัพบนกราฟ",
      "02",
    ],
    chart: [
      "เลือกที่รับ แล้วลองปล่อยให้ตลาดเดิน",
      "Your setup. In motion.",
      "จำลองสัญญาณเข้า",
      "03",
    ],
  }[phase];
  document.querySelector("#story-kicker").textContent = copy[0];
  document.querySelector("#experience-title").textContent = copy[1];
  next.replaceChildren(document.createTextNode(copy[2] + " "));
  const arrow = document.createElement("span");
  arrow.textContent = "↗";
  arrow.setAttribute("aria-hidden", "true");
  next.append(arrow);
  document.querySelector("#story-count").textContent = copy[3];
  back.hidden = phase === "idea";
}
document.querySelectorAll("[data-idea]").forEach((button) =>
  button.addEventListener("click", () => {
    idea = button.dataset.idea;
    document
      .querySelectorAll("[data-idea]")
      .forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
    updateStrategy();
  }),
);
document.querySelectorAll("[data-destination]").forEach((button) =>
  button.addEventListener("click", () => {
    destination = button.dataset.destination;
    document
      .querySelectorAll("[data-destination]")
      .forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
    document.querySelector("#delivery-channel").textContent =
      `${destination} · ตัวอย่างแจ้งเตือน`;
    experience.style.setProperty(
      "--destination-x",
      `${["Telegram", "Discord", "LINE"].indexOf(destination) * 130 - 130}px`,
    );
    if (experience.dataset.delivered === "true") showPhase("chart");
  }),
);
next.addEventListener("click", () => {
  experience.scrollIntoView({
    behavior: reducedMotion.matches ? "instant" : "smooth",
    block: "start",
  });
  if (phase === "idea") showPhase("build");
  else if (phase === "build") showPhase("chart");
  else if (experience.dataset.delivered === "true") showPhase("idea");
  else {
    experience.dataset.delivered = "true";
    document.querySelector("#story-kicker").textContent =
      `จากไอเดียของคุณ ถึง ${destination}`;
    document.querySelector("#experience-title").textContent = "And… Snaap.";
    next.textContent = "ลองอีกไอเดีย ↺";
  }
});
back.addEventListener("click", () => showPhase("idea"));
updateStrategy();

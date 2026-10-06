const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const logo = document.querySelector(".logo-play");
logo.addEventListener("click", () =>
  logo.setAttribute(
    "aria-pressed",
    String(logo.getAttribute("aria-pressed") !== "true"),
  ),
);
logo.addEventListener("pointermove", (event) => {
  if (reducedMotion.matches || event.pointerType === "touch") return;
  const bounds = logo.getBoundingClientRect();
  logo.style.setProperty(
    "--ry",
    `${((event.clientX - bounds.left) / bounds.width - 0.5) * 20}deg`,
  );
  logo.style.setProperty(
    "--rx",
    `${((event.clientY - bounds.top) / bounds.height - 0.5) * -15}deg`,
  );
});
logo.addEventListener("pointerleave", () => {
  logo.style.setProperty("--ry", "0deg");
  logo.style.setProperty("--rx", "0deg");
});
const demo = document.querySelector(".demo");
const progress = document.querySelector("#progress");
const play = document.querySelector("#play");
const svgNS = "http://www.w3.org/2000/svg";
let value = 0,
  playing = false,
  previousTime = 0,
  frame = 0,
  channel = "Telegram",
  strategy = "pullback";
const strategies = {
  pullback: {
    values: [
      270, 250, 262, 222, 235, 201, 210, 176, 188, 155, 174, 186, 199, 212, 205,
      192, 170, 178, 148, 130, 145, 108, 92, 106,
    ],
    line: "M20 288 Q350 245 550 220 T980 195",
    label: "EMA 200",
    rules: ["ราคาอยู่เหนือ EMA 200", "ราคาย่อแตะเส้น แล้วปิดกลับขึ้น"],
    alert: "BTC เข้าเงื่อนไขย่อในขาขึ้น",
  },
  breakout: {
    values: [
      270, 250, 259, 224, 236, 206, 217, 186, 204, 180, 195, 211, 188, 200, 180,
      143, 119, 130, 102, 116, 83, 96, 65, 78,
    ],
    line: "M20 165H980",
    label: "RESISTANCE",
    rules: ["ราคาทะลุแนวต้าน", "ปิดเหนือจุดสูงสุด 20 แท่ง"],
    alert: "BTC ปิดเหนือแนวต้าน 20 แท่ง",
  },
};
const phases = [
  "เริ่มจากไอเดียของคุณ",
  "AI วางเงื่อนไข แล้วเฝ้ากราฟ",
  "พบสัญญาณที่ตรงกับเซ็ตอัพ",
  "ส่งสัญญาณไปยังช่องทางของคุณ",
];
let candleNodes = [];
function makeSVG(tag, attrs) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, val] of Object.entries(attrs)) node.setAttribute(key, val);
  return node;
}
function buildChart() {
  const data = strategies[strategy];
  const root = document.querySelector("#candles");
  root.replaceChildren();
  candleNodes = data.values.map((close, index) => {
    const open = index ? data.values[index - 1] : 282;
    const x = 35 + index * 40;
    const group = makeSVG("g", {
      class: `candle${close > open ? " down" : ""}`,
    });
    group.append(
      makeSVG("path", {
        d: `M${x} ${Math.min(open, close) - 9}V${Math.max(open, close) + 9}`,
      }),
      makeSVG("rect", {
        x: x - 7,
        y: Math.min(open, close),
        width: 14,
        height: Math.max(4, Math.abs(open - close)),
        rx: 1,
      }),
    );
    root.append(group);
    return group;
  });
  document.querySelector("#indicator").setAttribute("d", data.line);
  document.querySelector("#indicator-label").textContent = data.label;
  document
    .querySelector("#indicator-label")
    .setAttribute("y", strategy === "breakout" ? 154 : 230);
  document.querySelector("#rule-one").textContent = data.rules[0];
  document.querySelector("#rule-two").textContent = data.rules[1];
  document.querySelector("#notification-title").textContent = data.alert;
  document
    .querySelector("#signal-mark")
    .setAttribute("transform", `translate(635 ${data.values[15]})`);
}
function render() {
  const phase = value < 15 ? 0 : value < 66 ? 1 : value < 85 ? 2 : 3;
  if (demo.dataset.phase !== String(phase)) {
    demo.dataset.phase = phase;
    document.querySelector("#phase-label").textContent = phases[phase];
  }
  progress.value = value;
  const count = value < 28 ? 10 : Math.min(24, 10 + (value - 28) / 4.8);
  candleNodes.forEach((node, index) => {
    const reveal = Math.max(0, Math.min(1, count - index));
    node.style.opacity = index < 10 ? 0.6 : reveal;
  });
  document
    .querySelector("#market-head")
    .setAttribute(
      "transform",
      `translate(${35 + Math.min(23, Math.floor(count) - 1) * 40} 0)`,
    );
  document.querySelector("#market-head").style.opacity =
    value >= 28 && value < 85 ? 1 : 0;
  document.querySelector("#signal-mark").style.opacity = value >= 66 ? 1 : 0;
  document.querySelector(".signal-zone").style.opacity = value >= 66 ? 1 : 0;
  const travel = Math.max(0, Math.min(1, (value - 72) / 13));
  const dot = document.querySelector(".travel-dot");
  dot.style.opacity = travel > 0 && travel < 1 ? 1 : 0;
  dot.style.left = `${60 + travel * 23}%`;
  dot.style.top = `${travel * 45}px`;
  document.querySelector(".delivery-line").style.opacity = value >= 72 ? 1 : 0;
  const arrival = Math.max(0, Math.min(1, (value - 85) / 6));
  const notification = document.querySelector(".notification");
  notification.style.opacity = arrival;
  notification.style.transform = `translateY(${(1 - arrival) * 15}px)`;
  document
    .querySelectorAll(".timeline-labels span")
    .forEach((item, index) => item.classList.toggle("active", index === phase));
  play.replaceChildren(
    document.createTextNode(
      playing
        ? "หยุดชั่วคราว "
        : value >= 100
          ? "เล่นอีกครั้ง "
          : value > 0
            ? "เล่นต่อ "
            : "เล่นโฟลว์ ",
    ),
  );
  const icon = document.createElement("span");
  icon.textContent = playing ? "Ⅱ" : value >= 100 ? "↻" : "▶";
  play.append(icon);
  progress.setAttribute(
    "aria-valuetext",
    `${Math.round(value)}% — ${phases[phase]}`,
  );
}
function stop() {
  playing = false;
  cancelAnimationFrame(frame);
  previousTime = 0;
  render();
}
function tick(time) {
  if (!playing) return;
  if (previousTime) value = Math.min(100, value + (time - previousTime) / 140);
  previousTime = time;
  if (value >= 100) {
    stop();
    return;
  }
  render();
  frame = requestAnimationFrame(tick);
}
play.addEventListener("click", () => {
  if (playing) {
    stop();
    return;
  }
  if (value >= 100) value = 0;
  if (reducedMotion.matches) {
    value = value < 15 ? 28 : value < 66 ? 66 : 100;
    render();
    return;
  }
  playing = true;
  previousTime = 0;
  render();
  frame = requestAnimationFrame(tick);
});
progress.addEventListener("input", () => {
  const requested = Number(progress.value);
  stop();
  value = requested;
  render();
});
// Read the slider before stop() renders its previous value.
progress.addEventListener("pointerdown", () => {
  if (playing) stop();
});
document.querySelectorAll("[data-idea]").forEach((button) =>
  button.addEventListener("click", () => {
    stop();
    strategy = button.dataset.idea;
    value = 0;
    document.querySelectorAll("[data-idea]").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", selected);
    });
    buildChart();
    render();
  }),
);
document.querySelectorAll("[data-channel]").forEach((button) =>
  button.addEventListener("click", () => {
    channel = button.dataset.channel;
    document
      .querySelectorAll("[data-channel]")
      .forEach((item) => item.setAttribute("aria-pressed", item === button));
    document.querySelector("#notification-channel").textContent =
      `SNAAP → ${channel.toUpperCase()}`;
  }),
);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && playing) stop();
});
new IntersectionObserver(
  (entries) => {
    if (!entries[0].isIntersecting && playing) stop();
  },
  { threshold: 0.1 },
).observe(demo);
reducedMotion.addEventListener("change", () => {
  stop();
});
buildChart();
render();

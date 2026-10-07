(() => {
  "use strict";
  // Preserve app bookmarks created before the public homepage was introduced.
  if (location.pathname === "/") {
    const legacyView = location.hash.slice(1);
    const appViews = ["home", "notifications", "history", "watch", "billing"];
    if (appViews.includes(legacyView) || new URLSearchParams(location.search).has("import")) {
      location.replace(`/${appViews.includes(legacyView) ? legacyView : "home"}${location.search}`);
      return;
    }
  }
  const $ = (selector) => document.querySelector(selector);
  const all = (selector) => [...document.querySelectorAll(selector)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const stage = $(".story-stage");
  const story = $(".story");
  const play = $("#play");
  const hero = $(".hero-visual");
  const ns = "http://www.w3.org/2000/svg";
  const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
  const ease = (n) => {
    n = clamp(n);
    return n * n * (3 - 2 * n);
  };
  const range = (n, a, b) => ease((n - a) / (b - a));
  const strategies = {
    breakout: {
      quote: "“แจ้งเมื่อ BTC ทะลุแนวต้าน”",
      rule: "ปิดเหนือแนวต้าน → จับสัญญาณ",
      message: "BTC ปิดเหนือแนวต้านแล้ว",
      label: "แนวต้าน",
      values: [
        285, 260, 272, 232, 245, 210, 225, 192, 208, 225, 205, 181, 198, 183,
        168, 173, 133, 117, 138, 98, 110, 75, 90, 59,
      ],
    },
    pullback: {
      quote: "“หาจังหวะ BTC ย่อในขาขึ้น”",
      rule: "ย่อแตะ EMA 200 แล้วปิดกลับขึ้น → จับสัญญาณ",
      message: "BTC ย่อแตะ EMA แล้วปิดกลับขึ้น",
      label: "EMA 200",
      values: [
        285, 260, 272, 232, 245, 210, 225, 192, 208, 218, 238, 252, 267, 245,
        253, 247, 217, 190, 206, 165, 179, 139, 150, 119,
      ],
    },
  };
  let strategy = "breakout";
  let progress = 0;
  let phase = -1;
  let playing = false;
  let frame = 0;
  let previousTime = 0;
  let scrollFrame = 0;
  let manual = false;
  const sceneCopy = [
    [
      "01 · THE IDEA",
      "เริ่มจากสิ่งที่คุณมองหา.",
      "บอกไอเดียด้วยภาษาของคุณ ที่เหลือให้ AI ออกแบบ.",
    ],
    [
      "02 · THE SETUP",
      "ไอเดียกลายเป็นเซ็ตอัพ.",
      "AI วางเงื่อนไขบนกราฟ แล้ว Snaap เฝ้าจังหวะให้คุณ.",
    ],
    [
      "03 · THE SIGNAL",
      "จังหวะที่ใช่. ส่งถึงคุณ.",
      "เมื่อราคาเข้าเงื่อนไข รับสัญญาณในช่องทางที่คุณเลือก.",
    ],
  ];
  const createSvg = (tag, attrs) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs))
      node.setAttribute(key, value);
    return node;
  };
  function drawCandles(target, values, start, gap, width) {
    target.replaceChildren();
    values.forEach((close, i) => {
      const open = i ? values[i - 1] : close + 12;
      const x = start + i * gap;
      const group = createSvg("g", {
        class: `${target.id === "hero-candles" ? "hero-candle" : "candle"}${close > open ? " down" : ""}`,
      });
      group.append(
        createSvg("path", {
          d: `M${x} ${Math.min(open, close) - 10}V${Math.max(open, close) + 11}`,
        }),
      );
      group.append(
        createSvg("rect", {
          x: x - width / 2,
          y: Math.min(open, close),
          width,
          height: Math.max(5, Math.abs(open - close)),
          rx: 1,
        }),
      );
      target.append(group);
    });
  }
  const heroValues = [
    250, 226, 235, 190, 202, 167, 181, 144, 160, 151, 192, 205, 170, 183, 135,
    145, 103, 117, 73, 90, 51,
  ];
  drawCandles($("#hero-candles"), heroValues, 100, 42, 12);
  function buildChart() {
    const data = strategies[strategy];
    drawCandles($("#candles"), data.values, 40, 40, 13);
    $("#market-area").setAttribute(
      "d",
      `M40 380L${data.values.map((v, i) => `${40 + i * 40} ${v}`).join("L")}V380Z`,
    );
    $("#setup-line").setAttribute(
      "d",
      strategy === "breakout"
        ? "M30 155H970"
        : "M30 322C250 300 400 258 580 248S820 220 970 200",
    );
    $("#setup-label").textContent = data.label;
    $("#setup-label").setAttribute(
      "y",
      strategy === "breakout" ? "142" : "249",
    );
    $("#signal-mark").setAttribute(
      "transform",
      `translate(680 ${data.values[16]})`,
    );
    $("#idea-quote").textContent = data.quote;
    $("#setup-rule").textContent = data.rule;
    $("#notification-message").textContent = data.message;
  }
  function render(value) {
    progress = clamp(value);
    const nextPhase = progress < 0.29 ? 0 : progress < 0.72 ? 1 : 2;
    if (phase !== nextPhase) {
      phase = nextPhase;
      stage.dataset.phase = String(phase);
      const [kicker, title, description] = sceneCopy[phase];
      $("#scene-kicker").textContent = kicker;
      $("#scene-title").textContent = title;
      $("#scene-description").textContent = description;
      all("[data-scene]").forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(Number(button.dataset.scene) === phase),
        ),
      );
      $(".idea-scene").inert = phase !== 0;
      $("#demo-status").textContent = title;
    }
    $(".alert-scene").inert = progress < 0.94;
    $(".setup-scene").setAttribute("aria-hidden", String(phase === 0));
    const morph = range(progress, 0.14, 0.34);
    stage.style.setProperty("--agent-transform", morph === 0 ? "none" : `translateX(${-morph * stage.clientWidth * 0.24}px) scale(${1 - morph * 0.7})`);
    stage.style.setProperty("--idea-opacity", 1 - range(progress, 0.13, 0.26));
    stage.style.setProperty("--agent-opacity", 1 - range(progress, 0.24, 0.38));
    stage.style.setProperty(
      "--chart-opacity",
      range(progress, 0.24, 0.38) * (1 - range(progress, 0.85, 1) * 0.65),
    );
    stage.style.setProperty(
      "--chart-scale",
      0.84 +
        range(progress, 0.24, 0.45) * 0.16 -
        range(progress, 0.83, 1) * 0.07,
    );
    // The crossing candle closes before the signal appears; later candles follow.
    const reveal =
      420 +
      clamp((progress - 0.38) / 0.34) * 267 +
      clamp((progress - 0.74) / 0.12) * 283;
    $("#reveal-rect").setAttribute("width", String(reveal));
    $("#market-edge-fade").setAttribute("x2", String(reveal));
    $("#chart-head").setAttribute("transform", `translate(${reveal} 0)`);
    $("#signal-mark").style.opacity = range(progress, 0.72, 0.75);
    stage.style.setProperty(
      "--route-opacity",
      range(progress, 0.75, 0.78) * (1 - range(progress, 0.89, 0.94)),
    );
    // Connect the actual SVG signal and notification despite responsive scaling.
    const routeMatrix = $(".delivery-route").getScreenCTM();
    const signalMatrix = $("#signal-mark").getScreenCTM();
    if (routeMatrix && signalMatrix) {
      const inverse = routeMatrix.inverse();
      const origin = new DOMPoint(0, 0)
        .matrixTransform(signalMatrix)
        .matrixTransform(inverse);
      const destination = $(".notification").getBoundingClientRect();
      const end = new DOMPoint(
        destination.left + 42,
        destination.top + destination.height / 2,
      ).matrixTransform(inverse);
      $("#delivery-path").setAttribute(
        "d",
        `M${origin.x} ${origin.y}C${origin.x + 140} ${origin.y} ${end.x + 170} ${end.y} ${end.x} ${end.y}`,
      );
    }
    const path = $("#delivery-path");
    const point = path.getPointAtLength(
      clamp((progress - 0.77) / 0.13) * path.getTotalLength(),
    );
    $("#travel-dot").setAttribute("cx", point.x);
    $("#travel-dot").setAttribute("cy", point.y);
    stage.style.setProperty("--alert-opacity", range(progress, 0.88, 0.96));
    stage.style.setProperty(
      "--alert-y",
      `${40 * (1 - range(progress, 0.88, 0.96))}px`,
    );
  }
  function stop() {
    playing = false;
    cancelAnimationFrame(frame);
    play.querySelector("path").setAttribute("d", "M8 5v14l11-7Z");
    play.setAttribute(
      "aria-label",
      progress >= 0.99 ? "เล่นโฟลว์จำลองอีกครั้ง" : "เล่นโฟลว์จำลอง",
    );
  }
  function tick(time) {
    if (!playing) return;
    const delta = previousTime ? Math.min(time - previousTime, 80) : 0;
    previousTime = time;
    render(progress + delta / 10500);
    if (progress >= 1) {
      stop();
      $("#demo-status").textContent =
        `พบสัญญาณ ${strategies[strategy].message} แจ้งเตือนไปที่ ${$("#notification-channel").textContent}`;
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  function run() {
    manual = true;
    if (reduced.matches) {
      render(progress < 0.29 ? 0.5 : progress < 0.72 ? 1 : 0);
      return;
    }
    if (progress >= 0.99) render(0);
    playing = true;
    previousTime = 0;
    play.querySelector("path").setAttribute("d", "M6 5h4v14H6zM14 5h4v14h-4z");
    play.setAttribute("aria-label", "หยุดโฟลว์จำลองชั่วคราว");
    frame = requestAnimationFrame(tick);
  }
  play.addEventListener("click", () => (playing ? stop() : run()));
  all("[data-idea]").forEach((button) =>
    button.addEventListener("click", () => {
      stop();
      strategy = button.dataset.idea;
      all("[data-idea]").forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
      buildChart();
      render(0);
      run();
    }),
  );
  all("[data-scene]").forEach((button) =>
    button.addEventListener("click", () => {
      stop();
      manual = true;
      render([0, 0.63, 1][Number(button.dataset.scene)]);
    }),
  );
  const icons = {
    Telegram: "/assets/brands/telegram.svg",
    Discord: "/assets/brands/discord.svg",
    LINE: "/assets/brands/line.png",
  };
  all("[data-channel]").forEach((button) =>
    button.addEventListener("click", () => {
      $("#notification-channel").textContent = button.dataset.channel;
      $("#channel-icon").src = icons[button.dataset.channel];
      all("[data-channel]").forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
      if (!reduced.matches)
        $(".notification").animate(
          [
            { transform: "translateY(6px)", opacity: 0.4 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 420, easing: "ease-out" },
        );
      $("#demo-status").textContent = `ช่องทางจำลอง ${button.dataset.channel}`;
    }),
  );
  function syncScroll() {
    scrollFrame = 0;
    const mobile = matchMedia("(max-width: 700px)").matches;
    $(".hero-pair").setAttribute("x", mobile ? "300" : "100");
    $(".story-chart").setAttribute(
      "viewBox",
      mobile ? "220 20 750 360" : "0 0 1000 400",
    );
    $(".hero-chart").setAttribute(
      "viewBox",
      mobile ? "200 0 800 330" : "0 0 1000 330",
    );
    const rect = story.getBoundingClientRect();
    if (manual) {
      render(progress);
      return;
    }
    stop();
    render(
      clamp(-rect.top / Math.max(1, story.offsetHeight - stage.offsetHeight)),
    );
  }
  addEventListener(
    "scroll",
    () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(syncScroll);
    },
    { passive: true },
  );
  addEventListener("resize", syncScroll);
  // User scroll input takes over playback. Browser focus scrolling does not.
  const resumeScroll = () => {
    manual = false;
    stop();
  };
  addEventListener("wheel", resumeScroll, { passive: true });
  addEventListener("touchmove", resumeScroll, { passive: true });
  addEventListener("keydown", (event) => {
    if (
      [
        "PageDown",
        "PageUp",
        "ArrowDown",
        "ArrowUp",
        "Home",
        "End",
        " ",
      ].includes(event.key) &&
      (event.key !== " " || !event.target.closest("button"))
    )
      resumeScroll();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) stop();
    },
    { threshold: 0.1 },
  ).observe(stage);
  reduced.addEventListener("change", stop);
  let heroFrame = 0;
  const exchangeNames = ["BINANCE", "BYBIT", "OKX", "BITGET", "MEXC"];
  const exchangeLabel = $("#hero-exchange");
  let exchangeIndex = 0;
  let exchangeAnimation;
  setInterval(() => {
    const rect = hero.getBoundingClientRect();
    if (document.hidden || reduced.matches || rect.bottom <= 0 || rect.top >= innerHeight) return;
    exchangeAnimation = exchangeLabel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards", easing: "ease-in" });
    exchangeAnimation.onfinish = () => {
      exchangeIndex = (exchangeIndex + 1) % exchangeNames.length;
      exchangeLabel.textContent = exchangeNames[exchangeIndex];
      exchangeAnimation.cancel();
      exchangeAnimation = exchangeLabel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: "ease-out" });
    };
  }, 3200);
  reduced.addEventListener("change", () => exchangeAnimation?.cancel());
  const heroCandles = all(".hero-candle");
  function moveHeroAgent(index) {
    const i = Math.floor(index);
    const fraction = index - i;
    const y =
      heroValues[i] +
      ((heroValues[i + 1] ?? heroValues[i]) - heroValues[i]) * fraction;
    $("#hero-agent").setAttribute(
      "transform",
      `translate(${100 + index * 42} ${y})`,
    );
    heroCandles.forEach((candle, n) =>
      candle.classList.toggle("agent-watch", n === Math.round(index)),
    );
  }
  function finishHeroScan() {
    cancelAnimationFrame(heroFrame);
    heroFrame = 0;
    moveHeroAgent(14);
    hero.classList.remove("is-scanning");
    hero.classList.add("is-signalling");
    $("#hero-hint").textContent = "Snaap พบสัญญาณแล้ว";
  }
  hero.addEventListener("click", () => {
    const active = hero.getAttribute("aria-pressed") !== "true";
    cancelAnimationFrame(heroFrame);
    heroFrame = 0;
    hero.classList.remove("is-signalling", "is-scanning");
    hero.setAttribute("aria-pressed", String(active));
    hero.setAttribute(
      "aria-label",
      active
        ? "รีเซ็ตการจับสัญญาณจำลอง"
        : "ให้ Snaap เฝ้ากราฟและจับสัญญาณจำลอง",
    );
    moveHeroAgent(6);
    $("#hero-hint").textContent = active
      ? "Snaap กำลังเฝ้ากราฟ…"
      : "ให้ Snaap จับสัญญาณ";
    if (!active) return;
    if (reduced.matches) {
      finishHeroScan();
      return;
    }
    hero.classList.add("is-scanning");
    let start = null;
    function scan(time) {
      start ??= time;
      const t = clamp((time - start) / 2200);
      moveHeroAgent(6 + ease(t) * 8);
      if (t >= 1) {
        finishHeroScan();
        return;
      }
      heroFrame = requestAnimationFrame(scan);
    }
    heroFrame = requestAnimationFrame(scan);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && heroFrame) finishHeroScan();
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches && heroFrame) finishHeroScan();
  });
  let heroVisible = false;
  const updateSweep = () => hero.classList.toggle("sweep-active", heroVisible && !document.hidden);
  document.addEventListener("visibilitychange", updateSweep);
  new IntersectionObserver(
    ([entry]) => {
      heroVisible = entry.isIntersecting;
      updateSweep();
      if (!entry.isIntersecting && heroFrame) finishHeroScan();
    },
    { threshold: 0.05 },
  ).observe(hero);
  moveHeroAgent(6);
  hero.addEventListener("pointermove", (event) => {
    if (reduced.matches || event.pointerType !== "mouse") return;
    const rect = hero.getBoundingClientRect();
    hero.style.setProperty(
      "--tilt",
      `${((event.clientX - rect.left) / rect.width - 0.5) * 2}deg`,
    );
  });
  hero.addEventListener("pointerleave", () =>
    hero.style.setProperty("--tilt", "0deg"),
  );
  buildChart();
  syncScroll();
})();

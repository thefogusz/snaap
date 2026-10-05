"use strict";
(() => {
  const studio = document.createElement("section");
  studio.className = "setup-studio";
  studio.setAttribute("aria-label", "กราฟจำลองเซตอัพ");
  studio.innerHTML = `<header><div class="studio-header-info"><strong data-chart-title>กราฟเซตอัพ</strong><p data-chart-status role="status">เลือกคู่เทรดเพื่อดูกราฟ</p></div><div class="studio-header-actions"><button type="button" class="secondary" data-chart-refresh>รีเฟรช</button></div></header><div class="chart-legend"></div><div class="studio-canvas" aria-label="กราฟแท่งราคาและอินดิเคเตอร์"></div><div class="replay-controls"><button type="button" class="secondary" data-play disabled>เล่นย้อนหลัง</button><button type="button" class="secondary" data-step disabled aria-label="เลื่อนไปแท่งถัดไป">ถัดไป</button><input type="range" data-scrub aria-label="เลือกแท่งย้อนหลัง" min="0" max="0" value="0" disabled><button type="button" class="text-button" data-latest disabled>ล่าสุด</button></div><p class="chart-disclaimer">จำลองสัญญาณจากแท่งปิด · ไม่ใช่ออเดอร์จริง · อัปเดตข้อมูลทุก 30 วินาที</p><div class="setup-insights" data-setup-insights></div><details class="chart-evidence"><summary>รายละเอียดเงื่อนไข · คลิกแท่งบนกราฟเพื่อดูย้อนหลัง</summary><div data-chart-evidence></div></details><a class="chart-credit" href="https://www.tradingview.com/" target="_blank" rel="noopener">Charts by TradingView</a>`;
  setupPane.insertBefore(studio, panel);
  const status = studio.querySelector("[data-chart-status]");
  const canvas = studio.querySelector(".studio-canvas");
  const scrub = studio.querySelector("[data-scrub]");
  let chartPair=null, chartFrame=null, selectedBarTime=null, requestedBarTime=null;
  window.SnaapChart = {
    get pair(){return chartPair;}, get frame(){return chartFrame ?? state.draft?.timeframe;},
    get selectedTime(){return selectedBarTime;}, get data(){return result;},
    view(frame, pair, time){
      chartFrame=frame; if(pair)chartPair=pair; selectedBarTime=time??null; requestedBarTime=time??null;
      key=""; stop(); update(true);
    },
    refresh(){key="";schedule();},
    reset(){
      generation++;
      clearTimeout(timer);
      key="";
      chartPair=null;chartFrame=null;selectedBarTime=null;requestedBarTime=null;
      clear();
      chartPickerWrap.hidden=true;
      scrub.value=0;
      studio.querySelector('[data-chart-title]').textContent='กราฟเซตอัปใหม่';
      status.textContent='เพิ่มเงื่อนไขเพื่อดูกราฟและสัญญาณของเซตอัปนี้';
      canvas.inert=false;canvas.style.opacity='1';
    },
    visibility(){lines.forEach(({series,operand})=>series.applyOptions({visible:!window.SnaapStudio?.isHidden(operand)}));},
  };
  const chartPicker=document.createElement("select");chartPicker.className="studio-pair-select";chartPicker.setAttribute("aria-label","คู่เทรดที่แสดงบนกราฟ");const chartPickerWrap=document.createElement("div");chartPickerWrap.className="studio-pair-control";chartPickerWrap.append(chartPicker);studio.querySelector(".studio-header-actions").append(chartPickerWrap);
  panel.addEventListener('click', e => {
    const button = e.target.closest('[data-open-condition-chart]');
    if (button) window.SnaapChart.view(button.dataset.openConditionChart);
  });
  chartPicker.onchange=()=>{chartPair=chartPicker.value;update(true);};
  let chart,
    candles,
    markers,
    lines = [],
    result,
    key = "",
    pendingKey = "",
    timer,
    playTimer,
    generation = 0,
    at = 0;
  let colors = ["#aa87ff", "#32a9df", "#e8ab42", "#ee79bb", "#4cbda5"];
  function stop() {
    clearInterval(playTimer);
    playTimer = null;
    studio.querySelector("[data-play]").textContent = "เล่นย้อนหลัง";
  }
  function clear() {
    stop();
    result = null;
    if (chart) {
      chart.remove();
      chart = null;
    }
    lines = [];
    canvas.replaceChildren();
    studio.querySelector(".chart-legend").replaceChildren();
    studio.querySelector("[data-chart-evidence]").replaceChildren();
    studio.querySelector("[data-setup-insights]").replaceChildren();
    studio
      .querySelectorAll(".replay-controls button,.replay-controls input")
      .forEach((e) => (e.disabled = true));
  }
  function fitFrame() {
    if (!chart || !result || canvas.clientWidth < 1) return;
    const visibleBars = Math.min(at + 1, Math.max(40, Math.min(160, Math.floor(canvas.clientWidth / 6))));
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(-1, at - visibleBars + 1), to: at + Math.max(2, Math.round(visibleBars * .035)) });
  }
  let wasVisible = false;
  function fitStudyPanes() {
    if (!chart) return;
    const studies = chart.panes().slice(1);
    const height = Math.max(32, Math.min(110, canvas.clientHeight * .35 / Math.max(1,studies.length)));
    studies.forEach(p => p.setHeight(height));
  }
  new ResizeObserver(() => {
    const visible = canvas.clientWidth > 0 && canvas.clientHeight > 0;
    if (visible) fitStudyPanes();
    if (visible && !wasVisible) requestAnimationFrame(() => { if (chart) fitFrame(); else update(); });
    wasVisible = visible;
  }).observe(canvas);
  document.addEventListener("workbench-mode-changed", () => {
    if (workbench.dataset.tab !== "split") return;
    requestAnimationFrame(() => { if (chart) fitFrame(); else update(); });
  });
  function draw(limit, fit = false) {
    if (!result || !chart) return;
    at = Math.max(0, Math.min(limit, result.candles.length - 1));
    scrub.value = at;
    const cut = result.candles[at].time;
    candles.setData(
      result.candles
        .slice(0, at + 1)
        .map((c) => ({ ...c, time: c.time / 1000 })),
    );
    lines.forEach(({ series, points }) =>
      series.setData(
        points
          .filter((p) => p.time <= cut)
          .map((p) =>
            p.value === null
              ? { time: p.time / 1000 }
              : { time: p.time / 1000, value: p.value, ...(p.color ? {color:p.color} : {}) },
          ),
      ),
    );
    markers.setMarkers(
      result.chartEvents
        .filter((e) => e.time <= cut && e.signalTime <= cut)
        .map((e) => ({
          time: e.time / 1000,
          position: (e.kind === "ENTRY") !== (e.side === "SHORT") ? "belowBar" : "aboveBar",
          color: document.documentElement.dataset.theme === "dark" ? (e.kind === "ENTRY" ? "#35ba8a" : "#f18088") : (e.kind === "ENTRY" ? "#137b55" : "#bc3546"),
          shape: (e.kind === "ENTRY") !== (e.side === "SHORT") ? "arrowUp" : "arrowDown",
          text: {
            ENTRY: "เข้า",
            EXIT: "ออก",
            CANCEL: "ยกเลิก",
            EXPIRED: "หมดเวลา",
          }[e.kind] + " · " + ({SPOT:"Spot",LONG:"Long",SHORT:"Short"}[e.side] ?? "ไม่ระบุฝั่ง"),
        })),
    );
    selectedBarTime = cut;
    const bar = result.chartTimeline[at];
    document.dispatchEvent(new CustomEvent('studio-evidence',{detail:{bar,selectedTime:cut,source:result.source}}));
    const historical=at<result.candles.length-1;
    const ready=result.freshness?.every(f=>f.status==='CURRENT')??true;
    studio.querySelector('[data-setup-insights]').innerHTML = freshnessUI(result.freshness) + (historical?'<p>กำลังดูสถานะย้อนหลังตามแท่งที่เลือก</p>':'') + (ready||historical?(bar?.branches??[]).map(b=>`<strong>${esc(directionLabel(b.side,b.side === "SPOT" ? "Spot" : "Perpetual Futures"))}</strong>${progressUI(b.progress)}`).join(''):'<p role="status">รอข้อมูลแท่งปิดให้ครบก่อนแสดงสถานะปัจจุบัน · ยังดูหลักฐานของแท่งย้อนหลังได้</p>');
    studio.querySelector("[data-chart-evidence]").innerHTML =
      (hasEntryCondition() ? (barEvidence(bar, { showProgress: false }) || "<p>ไม่มีข้อมูลประเมินในรอบตรวจแท่งนี้</p>") : "<p>ยังไม่มีเงื่อนไขสำหรับประเมินสัญญาณ</p>") +
      (bar?.cancel && !bar.branches && !bar.explanations ? "<p>เงื่อนไขยกเลิก</p>" + evidenceUI(bar.cancel) : "");
    if (fit) fitFrame();
  }
  function render(data) {
    const oldRange = result?.source.frame === data.source.frame ? chart?.timeScale().getVisibleLogicalRange() : null;
    const selectedTime = result?.candles[at]?.time;
    const paused = result && at < result.candles.length - 1;
    clear();
    result = data;
    canvas.inert=false;canvas.style.opacity="1";
    const dark = document.documentElement.dataset.theme === "dark";
    colors = dark ? ["#aa87ff", "#32a9df", "#e8ab42", "#ee79bb", "#4cbda5"] : ['#7549c4','#087aa6','#916400','#ad3576','#16725e'];
    const ink = getComputedStyle(studio).color;
    const bg = getComputedStyle(studio).backgroundColor;
    chart = LightweightCharts.createChart(canvas, {
      autoSize: true,
      layout: {
        background: { type: "solid", color: bg },
        textColor: ink,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: dark ? "#29292f" : "#eeeeee" },
        horzLines: { color: dark ? "#29292f" : "#eeeeee" },
      },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 3, lockVisibleTimeRangeOnResize: true },
      rightPriceScale: { borderVisible: false },
    });
    const lastPrice = data.candles.at(-1)?.close ?? 1;
    const precision = lastPrice >= 10 ? 2 : lastPrice >= 1 ? 4 : 8;
    candles = chart.addSeries(LightweightCharts.CandlestickSeries, {
      upColor: dark ? "#35ba8a" : '#168063',
      downColor: dark ? "#eb7480" : '#c13d51',
      wickUpColor: dark ? "#35ba8a" : '#168063',
      wickDownColor: dark ? "#eb7480" : '#c13d51',
      borderVisible: false,
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
    });
    markers = LightweightCharts.createSeriesMarkers(candles, []);
    let pane = 0;
    const macdPanes = new Map();
    lines = data.overlays.map((o, i) => {
      const overlay = window.SnaapIndicatorCatalog?.indicatorByName[o.operand.name]?.overlay ?? ["EMA", "SMA", "BB_UPPER", "BB_LOWER","WMA","RMA","VWMA","HIGHEST","LOWEST","DONCHIAN_UPPER","DONCHIAN_LOWER","DONCHIAN_MID","BB_MIDDLE"].includes(
        o.operand.name,
      );
      const title = operandText(o.operand);
      const histogram = ['VOLUME', 'MACD_HIST', 'AO'].includes(o.operand.name);
      const macd = ['MACD','MACD_SIGNAL','MACD_HIST'].includes(o.operand.name);
      const macdKey = macd ? JSON.stringify([o.operand.timeframe,o.operand.period,o.operand.slow??26,o.operand.signal??9,o.operand.source??'close']) : null;
      let studyPane = 0;
      if (!overlay) {
        studyPane = macdPanes.get(macdKey) ?? ++pane;
        if (macd) macdPanes.set(macdKey,studyPane);
      }
      const displayOperand = o.chartOperand ?? o.operand;
      const series = chart.addSeries(
        histogram ? LightweightCharts.HistogramSeries : LightweightCharts.LineSeries,
        {
          color: macd ? (o.operand.name==='MACD_SIGNAL' ? '#e8ab42' : '#32a9df') : colors[i % colors.length],
          lineWidth: 2,
          ...(o.operand.name === 'PSAR' ? {lineVisible:false,pointMarkersVisible:true,pointMarkersRadius:2} : {}),
          title,
          priceFormat: o.operand.name === 'VOLUME' ? {type:'volume'} : {type:'price',precision:overlay?precision:2,minMove:overlay?10**-precision:.01},
          priceLineVisible: false,
          lastValueVisible: false,
          visible: !window.SnaapStudio?.isHidden(displayOperand),
        },
        studyPane,
      );
      if (!overlay) chart.panes()[studyPane].setHeight(Math.max(32, Math.min(110, canvas.clientHeight * .25)));
      const candleByTime = new Map(data.candles.map(c => [c.time,c]));
      const points = histogram ? o.points.map(p => {
        const candle = candleByTime.get(p.time);
        const up = o.operand.name === 'VOLUME' ? candle && candle.close >= candle.open : p.value >= 0;
        return {...p,color:up ? (dark ? '#35ba8a' : '#168063') : (dark ? '#eb7480' : '#c13d51')};
      }) : o.points;
      return { series, points, operand:displayOperand };
    });
    fitStudyPanes();
    studio.querySelector(".chart-legend").innerHTML = data.overlays
      .map(
        (o, i) =>
          o.chartOperand || window.SnaapStudio?.isHidden(o.operand) ? "" : `<span class="studio-legend-chip" style="color:${colors[i % colors.length]}"><button type="button" class="studio-legend-item" data-chart-indicator="${i}">${esc(operandText(o.operand))} ⚙</button><button type="button" class="studio-legend-remove" data-remove-chart-indicator="${i}" aria-label="นำ ${esc(operandText(o.operand))} ออกจากกราฟ" title="นำออกจากกราฟ · คงเงื่อนไขไว้">×</button></span>`,
      )
      .join("");
    studio
      .querySelectorAll(".replay-controls button,.replay-controls input")
      .forEach((e) => (e.disabled = false));
    scrub.max = Math.max(0, data.candles.length - 1);
    const requestedTime = requestedBarTime ?? selectedTime;
    const selectedIndex = paused || requestedBarTime != null ? data.candles.findLastIndex(b=>b.time <= requestedTime) : -1;
    draw(selectedIndex >= 0 ? selectedIndex : data.candles.length - 1, !oldRange);
    if (oldRange && requestedBarTime == null) chart.timeScale().setVisibleLogicalRange(oldRange);
    requestedBarTime=null;
    chart.subscribeClick((p) => {
      if (!p.time) return;
      selectedBarTime = Number(p.time)*1000;
      const index = data.timeline.findLastIndex((b) => b.time <= selectedBarTime);
      if (index < 0) {
        document.dispatchEvent(new CustomEvent('studio-evidence',{detail:{bar:null,selectedTime:selectedBarTime,source:data.source}}));
        studio.querySelector('[data-chart-evidence]').textContent=hasEntryCondition() ? 'ข้อมูลไม่พอ · ยังไม่มีแท่งตรวจที่ปิดแล้ว ณ จุดนี้' : 'ยังไม่มีเงื่อนไขสำหรับประเมินสัญญาณ';
        return;
      }
      const bar = data.timeline[index];
      document.dispatchEvent(new CustomEvent('studio-evidence',{detail:{bar,selectedTime:selectedBarTime,source:data.source}}));
      studio.querySelector("[data-chart-evidence]").innerHTML =
        (hasEntryCondition() ? barEvidence(bar) : "<p>ยังไม่มีเงื่อนไขสำหรับประเมินสัญญาณ</p>") +
        (bar?.cancel ? "<p>เงื่อนไขยกเลิก</p>" + evidenceUI(bar.cancel) : "");
      studio.querySelector(".chart-evidence").open = true;
    });
    status.textContent = `${data.freshness?.some(f=>f.status!=="CURRENT")?"ข้อมูลยังไม่พร้อมสำหรับสัญญาณล่าสุด · ":""}${data.candles.length} แท่งปิด · ${data.events.length} สัญญาณ · ตรวจทุก ${data.source.evaluationFrame} · อัปเดต ${new Date(data.source.asOf).toLocaleTimeString("th-TH")}`;
  }
  async function update(force = false) {
    if (!state.draft || workbench.hidden || workbench.dataset.tab === "chat") return;
    if(!state.draft.pairs.includes(chartPair))chartPair=state.draft.pairs[0];
    chartPickerWrap.hidden=state.draft.pairs.length<2;
    chartPicker.innerHTML=state.draft.pairs.map(pair=>`<option value="${esc(pair)}">${esc(pair)}</option>`).join("");chartPicker.value=chartPair;
    chartFrame ??= state.draft.timeframe;
    const chartOnly = !hasEntryCondition();
    // Supply a valid transport spec for market fetching only; never evaluate it.
    const request = {spec:{...state.draft,pairs:[chartPair],...(chartOnly ? {entry:{kind:'COMPARE',op:'>',left:{kind:'CONSTANT',value:0},right:{kind:'CONSTANT',value:0}},stages:[],exit:undefined,cancel:undefined,short:undefined,mirrorShort:undefined,side:state.draft.market==='Spot'?'SPOT':'LONG'} : {})},chartOnly,chartTimeframe:chartFrame,indicators:window.SnaapStudio?.chartIndicators(chartFrame)??[]};
    const scope={conversation:state.conversation,workspace:state.workspaceId};
    const next = JSON.stringify({request:{spec:{...state.draft,pairs:[chartPair]},chartTimeframe:chartFrame,indicators:request.indicators},...scope});
    const draftAtRequest=JSON.stringify(state.draft);
    if (!force && ((next === key && result) || next === pendingKey)) return;
    pendingKey = next;
    const token = ++generation;
    canvas.inert=true;canvas.style.opacity=".35";
    stop();
    studio.querySelector("[data-chart-title]").textContent =
      `${state.draft.exchange.join(", ")} · ${chartPair} · ${chartFrame} · ${directionLabel(state.draft.side,state.draft.market)}`;
    if (state.draft.exchange.length !== 1 || !state.draft.pairs.length) {
      pendingKey = "";
      status.textContent = "เลือกหนึ่งกระดานและหนึ่งคู่เทรดเพื่อดูกราฟ";
      return;
    }
    status.textContent = "กำลังคำนวณกราฟและสัญญาณ…";
    try {
      const data = await api("/preview", "POST", request);
      if (token !== generation || JSON.stringify(state.draft) !== draftAtRequest || chartPair!==request.spec.pairs[0] || chartFrame!==request.chartTimeframe || state.conversation!==scope.conversation || state.workspaceId!==scope.workspace) return;
      render(data);
      key = next;
    } catch (e) {
      if (token === generation) {
        status.textContent = e.message;
        key = "";
      }
    } finally {
      if (token === generation) pendingKey = "";
    }
  }
  function schedule() {
    if (!state.draft) return;
    const next = JSON.stringify({request:{spec:{...state.draft,pairs:[chartPair]},chartTimeframe:chartFrame,indicators:window.SnaapStudio?.chartIndicators(chartFrame)??[]},conversation:state.conversation,workspace:state.workspaceId});
    if ((next === key && result) || next === pendingKey) return;
    generation++;
    selectedBarTime=null;
    stop();
    studio.querySelectorAll('.replay-controls button,.replay-controls input').forEach(e=>e.disabled=true);
    clearTimeout(timer);
    status.textContent = "เซตอัพเปลี่ยนแล้ว · กำลังอัปเดตกราฟ…";
    canvas.style.opacity = ".35";canvas.inert=true;
    studio.querySelector("[data-chart-evidence]").textContent="กำลังคำนวณร่างล่าสุด…";
    timer = setTimeout(() => {
      update();
    }, 120);
  }
  document.addEventListener("setup-rendered", schedule);
  document.addEventListener('studio-refresh',()=>update(true));
  document.addEventListener("setup-changed", schedule);
  studio.querySelector("[data-chart-refresh]").onclick = () => update(true);
  scrub.oninput = () => {
    stop();
    draw(Number(scrub.value));
  };
  studio.querySelector("[data-step]").onclick = () => {
    stop();
    draw(at + 1);
  };
  studio.querySelector("[data-latest]").onclick = () => {
    stop();
    draw(result.candles.length - 1, true);
  };
  studio.querySelector("[data-play]").onclick = () => {
    if (playTimer) {
      stop();
      return;
    }
    if (at >= result.candles.length - 1)
      draw(Math.min(40, result.candles.length - 1), true);
    studio.querySelector("[data-play]").textContent = "หยุด";
    playTimer = setInterval(() => {
      draw(at + 1);
      if (at >= result.candles.length - 1) stop();
    }, 350);
  };
  setInterval(() => {
    if (
      !document.hidden &&
      !workbench.hidden &&
      workbench.dataset.tab !== "chat" &&
      !playTimer && (!result || at === result.candles.length - 1)
    )
      update(true);
  }, 30000);
  new MutationObserver(() => {
    if (result) render(result);
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  let availabilityGeneration = 0;
  async function checkPairAvailability() {
    const token = ++availabilityGeneration;
    if (!state.draft) return;
    const exchange = state.draft.exchange[0], market = state.draft.market;
    const pairs = [...state.draft.pairs];
    const hint = panel.querySelector("[data-pair-availability]");
    if (!hint) return;
    hint.hidden = false;
    hint.textContent = `กำลังตรวจคู่เทรดบน ${exchange} · ${market}…`;
    try {
      const data = await api(`/instruments?exchange=${encodeURIComponent(exchange)}&market=${encodeURIComponent(market)}`);
      if (token !== availabilityGeneration || !hint.isConnected) return;
      const available = new Set(data.items.filter(m => m.supported).map(m => m.symbol));
      const missing = pairs.filter(pair => !available.has(pair));
      hint.textContent = missing.length
        ? `${missing.join(", ")} ไม่มีหรือยังไม่รองรับบน ${exchange} · ${market} กรุณาเลือกคู่เทรดใหม่`
        : "";
      hint.hidden = !missing.length;
      hint.style.color = missing.length ? "#f2bb70" : "";
    } catch (error) {
      if (token === availabilityGeneration && hint.isConnected) hint.textContent = error.message;
    }
  }
  document.addEventListener("setup-rendered", checkPairAvailability);
  checkPairAvailability();

  document.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-pair-picker]")) return;
    if (!state.draft) return;
    const exchange = state.draft.exchange[0], market = state.draft.market;
    const source = `${exchange} / ${market}`;
    const sourceMatches = () => state.draft&&state.draft.exchange.length === 1 && state.draft.exchange[0] === exchange && state.draft.market === market;
    const dialog = document.createElement("dialog");
    dialog.className = "conversation-dialog instrument-dialog";
    dialog.setAttribute("aria-labelledby", "instrument-dialog-title");
    let mode=state.draft.pairs.length>1?'multiple':'single',selected=new Set(state.draft.pairs),catalog=[];
    let manualSelection=new Set(selected);
    const maxPairs=state.me?.limits?.pairsPerSetup??10;
    dialog.innerHTML = `<header><h2 id="instrument-dialog-title">เลือกคู่เทรด</h2><button type="button" aria-label="ปิด">${uiIcon("close")}</button></header><p>${esc(source)} · ใช้เงื่อนไขเดียวกัน แยกสัญญาณแต่ละคู่</p><div class="pair-selection-modes" role="group" aria-label="วิธีเลือกคู่เทรด"><button type="button" data-pair-mode="single">คู่เดียว</button><button type="button" data-pair-mode="multiple">หลายคู่</button><button type="button" data-pair-mode="all">ทั้งหมด</button></div><div class="pair-catalog-tools"><input type="search" aria-label="ค้นหาคู่เทรด" placeholder="ค้นหา BTC, ETH หรือชื่อคู่เทรด"><button type="button" class="secondary" data-refresh-catalog>ซิงก์ล่าสุด</button></div><p data-catalog-status role="status">กำลังโหลดจากกระดาน…</p><div class="instrument-list"></div><footer class="pair-selection-footer"><span data-selection-count></span><button type="button" class="text-button" data-clear-pairs>ล้างที่เลือก</button><button type="button" class="primary" data-apply-pairs disabled>ใช้คู่ที่เลือก</button></footer><p class="pair-selection-note">เลือกได้สูงสุด 10 คู่ต่อเซตอัป · เลือกทั้งหมดเร็ว ๆ นี้</p>`;
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector("header button").onclick = () => dialog.close();
    dialog.onclose = () => {
      dialog.remove();
      panel.querySelector("[data-pair-picker]")?.focus();
    };
    const refreshButton = dialog.querySelector("[data-refresh-catalog]");
    let loading = false,paint=()=>{};
    const apply=dialog.querySelector('[data-apply-pairs]');
    function selectionUI(){
      dialog.querySelectorAll('[data-pair-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pairMode===mode)));
      dialog.querySelector('[data-selection-count]').textContent=`เลือก ${selected.size.toLocaleString('th-TH')} คู่`;
      apply.disabled=loading||!catalog.length||!selected.size||selected.size>maxPairs;
    }
    dialog.querySelectorAll('[data-pair-mode]').forEach(b=>b.onclick=()=>{
      if(b.dataset.pairMode==='all'){toast('เร็ว ๆ นี้');return;}
      const previousMode=mode;
      mode=b.dataset.pairMode;
      if(mode==='all'&&previousMode!=='all')manualSelection=new Set(selected);
      if(previousMode==='all'&&mode!=='all')selected=new Set(manualSelection);
      if(mode==='single')selected=new Set([...selected].slice(0,1));
      if(mode==='all')selected=new Set(catalog.map(m=>m.symbol));
      paint();selectionUI();
    });
    dialog.querySelector('[data-clear-pairs]').onclick=()=>{selected.clear();mode='multiple';paint();selectionUI();};
    apply.onclick=()=>{
      if(!selected.size||loading)return;
      if(selected.size>maxPairs){toast(`เลือกได้สูงสุด ${maxPairs} คู่`);return;}
      if(!sourceMatches()){dialog.querySelector('[data-catalog-status]').textContent='ตลาดเปลี่ยนแล้ว กรุณาเลือกใหม่';return;}
      snapshot();state.draft.pairs=[...selected];state.replay=null;renderDesigner();queueDraftSave();dialog.close();
    };
    selectionUI();
    refreshButton.onclick = () => load(true);
    async function load(refresh = false) {
      if (loading) return;
      loading = true; refreshButton.disabled = true;selectionUI();
      dialog.querySelector("input").oninput = null;
      dialog.querySelector(".instrument-list").innerHTML = "";
      dialog.querySelector("[data-catalog-status]").textContent = "กำลังซิงก์จากกระดาน…";
      try {
        const data = await api(
          `/instruments?exchange=${encodeURIComponent(exchange)}&market=${encodeURIComponent(market)}&refresh=${refresh}`,
        );
        if (!dialog.open) return;
        catalog=data.items.filter(m=>m.supported);
        const available=new Set(catalog.map(m=>m.symbol));selected=new Set([...selected].filter(pair=>available.has(pair)));
        manualSelection=new Set([...manualSelection].filter(pair=>available.has(pair)));
        if(mode==='all')selected=new Set(available);
        paint = () => {
          const q = dialog.querySelector("input").value.toUpperCase().trim();
          const normalize = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
          const matches = data.items.filter((m) => m.supported && normalize(m.symbol).includes(normalize(q)));
          dialog.querySelector("[data-catalog-status]").textContent =
            `${matches.length} คู่ · ${source} · ซิงก์ ${new Date(data.at).toLocaleTimeString("th-TH")} · แคชไม่เกิน 5 นาที`;
          dialog.querySelector(".instrument-list").innerHTML =
            matches
              .slice(0, 100)
              .map(
                (m) =>
                  `<button type="button" data-symbol="${esc(m.symbol)}" aria-pressed="${selected.has(m.symbol)}"><strong>${esc(m.symbol)}</strong><span>${selected.has(m.symbol)?"✓ เลือกแล้ว":"เลือก"}</span></button>`,
              )
              .join("") +
            (matches.length > 100
              ? "<p>แสดง 100 คู่แรก · พิมพ์เพิ่มเพื่อค้นหา</p>"
              : (matches.length ? "" : "<p>ไม่พบคู่เทรดที่ตรงกับคำค้นในตลาดนี้</p>"));
        };
        dialog.querySelector("input").oninput = paint;
        paint();selectionUI();
      } catch (err) {
        dialog.querySelector("[data-catalog-status]").textContent = err.message;
        const retry = document.createElement("button");
        retry.className = "secondary";
        retry.textContent = "ลองใหม่";
        retry.onclick = () => {
          retry.remove();
          load();
        };
        dialog.querySelector(".instrument-list").append(retry);
      } finally { loading = false; refreshButton.disabled = false;selectionUI(); }
    }
    dialog.querySelector(".instrument-list").onclick = (e) => {
      const b = e.target.closest("[data-symbol]");
      if (!b || b.disabled) return;
      if (!sourceMatches()) {
        dialog.querySelector(".instrument-list").innerHTML = "";
        dialog.querySelector("[data-catalog-status]").textContent = "กระดานหรือตลาดเปลี่ยนแล้ว กรุณาปิดและเลือกคู่เทรดใหม่";
        return;
      }
      const pair=b.dataset.symbol;
      if(mode==='single')selected=new Set([pair]);
      else {if(mode==='all')mode='multiple';if(selected.has(pair))selected.delete(pair);else {if(selected.size>=maxPairs){toast(`เลือกได้สูงสุด ${maxPairs} คู่`);return;}selected.add(pair);}}
      paint();selectionUI();
    };
    load();
  });
})();

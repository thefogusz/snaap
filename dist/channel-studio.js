/* Connection guides and previews use the same renderer as external delivery. */
(() => {
  const guides = {
    TELEGRAM: {
      name: "Telegram",
      format: "ข้อความ / ภาพพร้อมข้อความ",
      url: "https://core.telegram.org/bots",
      steps: [
        [
          "เปิดบอต Snaap",
          "กดเปิดบอตจากลิงก์หลังสร้างช่องทาง ใช้ Telegram บัญชีที่ต้องการรับสัญญาณ",
        ],
        [
          "กด Start เพื่อยืนยัน",
          "รหัสเชื่อมต่อใช้ได้ครั้งเดียวภายใน 10 นาที ไม่ต้องวาง Bot Token",
        ],
        [
          "ลองรับสัญญาณ",
          "กลับมาที่ Snaap ตรวจสถานะ แล้วส่งข้อความทดสอบก่อนเลือกใช้ในเซตอัป",
        ],
      ],
      operator:
        "สร้างบอตผ่าน @BotFather แล้วตั้ง TELEGRAM_BOT_TOKEN และ TELEGRAM_BOT_USERNAME ใน .env · dev รับคำสั่งผ่าน polling ได้โดยไม่เปิดเว็บไซต์สู่ภายนอก ใช้บอตทดสอบแยกจาก production",
    },
    LINE: {
      name: "LINE",
      format: "Flex Card / ข้อความ",
      url: "https://developers.line.biz/en/docs/messaging-api/using-flex-messages/",
      steps: [
        [
          "เพิ่มเพื่อน LINE OA",
          "ใช้บัญชี LINE ที่คุณต้องการรับสัญญาณ เพิ่มเพื่อน OA ของ Snaap",
        ],
        [
          "ส่งรหัสเชื่อมต่อ",
          "คัดลอกคำสั่ง /start จาก Snaap ไปส่งในแชต OA รหัสหมดอายุใน 10 นาที",
        ],
        [
          "ตรวจสถานะและโควตา",
          "ส่งสัญญาณทดสอบ แล้วเลือกช่องทางในเซตอัป การทดสอบนับรวมในโควตา LINE",
        ],
      ],
      operator:
        "ผู้ดูแลเปิด Messaging API ของ OA ตั้ง LINE_CHANNEL_SECRET, LINE_ACCESS_TOKEN และ LINE_OA_URL · ตั้ง webhook เป็น https://โดเมนของเรา/api/v1/hooks/line และเปิด Use webhook · LINE ต้องเข้าถึง HTTPS URL ได้ ตั้งโควตาให้ไม่เกินแพ็กเกจจริง",
    },
    DISCORD: {
      name: "Discord",
      format: "Embed Card / ข้อความ",
      url: "https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks",
      steps: [
        [
          "เลือกห้องรับสัญญาณ",
          "เปิด Server Settings → Integrations → Webhooks ต้องมีสิทธิ์ Manage Webhooks",
        ],
        [
          "สร้าง Webhook",
          "เลือก New Webhook ตั้งชื่อ Snaap แล้วเลือก text channel ที่ต้องการรับข้อความ",
        ],
        [
          "คัดลอก URL มาเชื่อม",
          "กด Copy Webhook URL แล้ววางในขั้นถัดไป Snaap จะส่งการ์ดทดสอบหนึ่งข้อความ",
        ],
      ],
      operator:
        "ไม่ต้องมีบอตหรือ Nitro · ผู้ดูแล Snaap ต้องตั้ง DATA_ENCRYPTION_KEY เพื่อเข้ารหัส URL · ถ้า URL ถูกเปิดเผย ให้ลบ webhook เดิมและสร้างใหม่ใน Discord",
    },
    WEBHOOK: {
      name: "Webhook",
      format: "JSON / ข้อความใน payload",
      url: null,
      steps: [
        [
          "เตรียม HTTPS endpoint",
          "ระบบของคุณต้องรับ POST application/json ได้ ให้ผู้ดูแล Snaap อนุญาตโดเมนก่อนเชื่อม",
        ],
        [
          "ตอบ challenge",
          "เมื่อ type เป็น snaap.verify ให้ตอบค่า challenge เป็นข้อความ HTTP 200 เพื่อยืนยันปลายทาง",
        ],
        [
          "เก็บ Signing Secret",
          "เชื่อมสำเร็จแล้วเก็บ secret ที่แสดงครั้งเดียว ตรวจลายเซ็นและ ID ซ้ำก่อนประมวลผลสัญญาณ",
        ],
      ],
      operator:
        'ตั้ง WEBHOOK_ALLOWED_HOSTS เป็นรายชื่อโดเมนที่อนุญาต และ DATA_ENCRYPTION_KEY · ใช้ x-snaap-signature-v1 = HMAC-SHA256(secret, timestamp + "." + rawBody), timestamp จาก x-snaap-timestamp · ปฏิเสธ timestamp เก่าเกิน 5 นาที และ deduplicate ด้วย id',
    },
  };
  let dialog,
    session,
    previewTimer,
    previewRequest = 0;
  const defaults = (kind) => ({
    layout: kind === "TELEGRAM" ? "minimal" : "card",
    accent: "lime",
    language: "th",
    heading: "",
    showPrice: true,
    showSetup: true,
    showTime: true,
    showId: false,
    showCreator: false,
    creatorName: "",
    showChart: true,
  });
  function status(message, error = false) {
    const slot = dialog.querySelector("[data-channel-status]");
    if (!slot || !dialog.open) return;
    slot.textContent = message;
    slot.dataset.error = String(error);
  }
  const safeLink = (value) => {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password
        ? u.href
        : null;
    } catch {
      return null;
    }
  };
  function connectionResult() {
    const result = session.result;
    if (!result) return "";
    const url = safeLink(result.connectUrl);
    return `<div class="channel-binding"><h3>${result.verified ? "เชื่อมต่อแล้ว" : "ยืนยันผู้รับ"}</h3><p>${esc(result.instruction)}</p>${result.command ? `<div class="channel-copy-row"><code>${esc(result.command)}</code><button type="button" class="secondary" data-copy-command>คัดลอก</button></div><p class="channel-help">หมดอายุ ${new Date(result.expiresAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} · ห้ามแชร์รหัสนี้</p>` : ""}${url ? `<a class="primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">เปิด ${guides[session.kind].name} ↗</a>` : ""}${!result.verified ? '<button type="button" class="secondary" data-check-binding>ตรวจสถานะการเชื่อมต่อ</button>' : ""}${result.signingSecret ? `<label>Signing Secret · แสดงครั้งเดียว<input type="password" readonly value="${esc(result.signingSecret)}" autocomplete="off"></label><button type="button" class="secondary" data-copy-secret>คัดลอก Secret</button><p class="channel-help">เก็บในระบบปลายทางก่อนปิดหน้าต่าง หากสูญหายให้เชื่อมช่องทางใหม่</p>` : ""}</div>`;
  }
  function paint() {
    const { kind, step, appearance, row } = session,
      guide = guides[kind];
    const available = session.channels.available[kind];
    let content;
    if (step === 0)
      content = `<div class="channel-flow-art" aria-hidden="true"><span class="channel-snaap-mark">s*</span><span class="channel-flow-line"><i></i></span><span class="channel-target-mark">${kind === "WEBHOOK" ? "{}" : `<img src="${channelInfo[kind].logo}" alt="">`}</span></div><h3>รับสัญญาณใน ${guide.name}</h3><p class="channel-intro">${guide.format} · ทุกสัญญาณยังเก็บใน Snaap</p><ol class="channel-guide-list">${guide.steps.map(([title, detail], i) => `<li style="--step:${i}"><span>${i + 1}</span><div><h4>${title}</h4><p>${detail}</p></div></li>`).join("")}</ol>${guide.url ? `<a class="text-button" href="${guide.url}" target="_blank" rel="noopener noreferrer">คู่มือทางการ ↗</a>` : ""}<details class="channel-admin-guide"><summary>สำหรับผู้ดูแลระบบ</summary><p>${guide.operator}</p></details>${kind === "WEBHOOK" ? `<details class="channel-admin-guide"><summary>ตัวอย่างรับ challenge และสัญญาณ</summary><a class="text-button" href="/assets/snaap-webhook-example.mjs" download>ดาวน์โหลดตัวอย่าง Node.js ↧</a><pre><code>${esc('if (body.type === "snaap.verify") {\n  // HTTP 200, Content-Type: text/plain\n  return body.challenge;\n}\n// ตรวจ HMAC จาก raw body ก่อน parse JSON\n// ตรวจ timestamp และบันทึก body.id กันซ้ำ\n// ตอบ HTTP 2xx หลังบันทึกสัญญาณแล้ว')}</code></pre></details>` : ""}`;
    else if (step === 1)
      content = `<h3>${row?.verified ? "ช่องทางของคุณ" : "เชื่อมต่อ " + guide.name}</h3><p class="channel-intro">${kind === "DISCORD" ? "เมื่อกดเชื่อม จะส่งสัญญาณตัวอย่างหนึ่งข้อความไปยังห้องที่เลือก" : kind === "WEBHOOK" ? "ยืนยัน URL แล้วรับ secret สำหรับตรวจสอบลายเซ็น" : "ยืนยันบัญชีที่รับสัญญาณด้วยรหัสใช้ครั้งเดียว"}</p>${!available ? '<p class="channel-config-notice">ผู้ดูแลยังไม่ได้เปิดช่องทางนี้ คุณอ่านคู่มือและลองปรับหน้าตาได้ก่อน</p>' : ""}${!session.result && !row ? `<form id="studio-connection"><label>ชื่อช่องทาง<input name="name" maxlength="80" required value="${esc(session.name)}" placeholder="เช่น สัญญาณส่วนตัว"></label>${["WEBHOOK", "DISCORD"].includes(kind) ? `<label>${kind === "DISCORD" ? "Discord Webhook URL" : "HTTPS endpoint"}<input name="url" type="${kind === "DISCORD" ? "password" : "url"}" required autocomplete="off" placeholder="${kind === "DISCORD" ? "https://discord.com/api/webhooks/…" : "https://your-domain.com/snaap"}"></label>` : ""}<p class="channel-help">${kind === "DISCORD" ? "URL เก็บแบบเข้ารหัส ไม่แสดงในรายการช่องทาง" : kind === "WEBHOOK" ? "ปลายทางต้องตอบ challenge กลับเป็นข้อความ" : "คุณไม่ต้องกรอก API key หรือรหัสผ่านบัญชี"}</p><button class="primary" type="submit" ${available ? "" : "disabled"}>${kind === "DISCORD" ? "เชื่อมและส่งทดสอบ" : "สร้างช่องทาง"}</button></form>` : connectionResult() || `<p>${esc(row.name)} · ${row.verified ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน / ตัดการเชื่อมต่อแล้ว"}</p>${!row.verified ? '<p class="channel-help">หากรหัสหมดอายุหรือช่องทางถูกตัด ให้เพิ่มช่องทางใหม่</p>' : ""}`}${kind === "LINE" ? `<div class="channel-quota-note">LINE เดือนนี้: ${session.channels.lineQuota?.used ?? 0} / ${session.channels.lineQuota?.limit ?? 30} ข้อความ · รวมการทดสอบ</div>` : ""}`;
    else
      content = `<h3>หน้าตาสัญญาณของคุณ</h3><p class="channel-intro">ตั้งแยกสำหรับแต่ละช่องทาง · พรีวิวอัปเดตตามที่เลือก</p><form id="studio-appearance"><label>ชื่อช่องทาง<input name="name" required maxlength="80" value="${esc(session.name)}"></label><fieldset class="channel-layout-options"><legend>รูปแบบ</legend>${[
        [
          "card",
          kind === "TELEGRAM"
            ? "ภาพ Snaap + ข้อความ"
            : kind === "WEBHOOK"
              ? "JSON พร้อมแบรนด์"
              : "การ์ด Snaap",
        ],
        ["minimal", "ข้อความมินิมอล"],
      ]
        .map(
          ([value, label]) =>
            `<label><input type="radio" name="layout" value="${value}" ${appearance.layout === value ? "checked" : ""}><span>${label}</span></label>`,
        )
        .join(
          "",
        )}</fieldset><fieldset class="channel-accent-options"><legend>สีการ์ด</legend>${[
        ["lime", "Lime", "#d0f64c"],
        ["cyan", "Cyan", "#65dceb"],
        ["violet", "Violet", "#c8b5ff"],
      ]
        .map(
          ([value, label, color]) =>
            `<label style="--swatch:${color}"><input type="radio" name="accent" value="${value}" ${appearance.accent === value ? "checked" : ""}><span>${label}</span></label>`,
        )
        .join(
          "",
        )}</fieldset><label>ภาษา<select name="language"><option value="th" ${appearance.language === "th" ? "selected" : ""}>ไทย</option><option value="en" ${appearance.language === "en" ? "selected" : ""}>English</option></select></label><label>หัวข้อข้อความ<input name="heading" maxlength="60" value="${esc(appearance.heading)}" placeholder="แจ้งเตือนสัญญาณ"></label><fieldset class="channel-field-options"><legend>ข้อมูลที่แสดง</legend>${[
        ["showPrice", "ราคาอ้างอิง"],
        ["showSetup", "ชื่อเซตอัป"],
        ["showTime", "เวลา (UTC+7)"],
        ["showId", "Signal ID"],
        ["showCreator", "ชื่อผู้สร้าง"],
        ["showChart", "แนบกราฟแท่งเทียน"],
      ]
        .map(
          ([key, label]) =>
            `<label><input type="checkbox" name="${key}" ${appearance[key] ? "checked" : ""}><span>${label}</span></label>`,
        )
        .join(
          "",
        )}</fieldset><label data-creator-name ${appearance.showCreator ? "" : "hidden"}>ชื่อผู้สร้างที่แสดง<input name="creatorName" maxlength="60" value="${esc(appearance.creatorName)}" placeholder="เช่น Gus Signals" ${appearance.showCreator ? "required" : ""}></label><p class="channel-help" data-chart-help>กราฟใช้คู่เหรียญ กระดาน และกรอบเวลาของสัญญาณ · สัญญาณเก่าที่ไม่มีข้อมูลกราฟจะแสดงเฉพาะข้อความ</p><p class="channel-help">คู่เทรด ฝั่ง ประเภทสัญญาณ และชื่อ Snaap แสดงเสมอ${kind === "WEBHOOK" ? " · ข้อมูล event ใน JSON ยังคงครบ" : ""}</p><button class="primary" type="submit">${session.id ? "บันทึกหน้าตาสัญญาณ" : "ใช้รูปแบบนี้และเชื่อมต่อ"}</button>${session.id && session.row?.verified ? '<button class="secondary" type="button" data-studio-test>ส่งตัวอย่างที่บันทึกแล้ว</button>' : ""}</form>`;
    dialog.innerHTML = `<header class="channel-studio-header"><div><span class="channel-studio-overline">SNAAP / CHANNEL STUDIO</span><h2 id="channel-studio-title">${guide.name}</h2></div><button type="button" class="icon-button" data-studio-close aria-label="ปิดคู่มือ">${uiIcon("close")}</button></header><div class="channel-studio-grid"><section class="channel-studio-work"><nav class="channel-step-nav" aria-label="ขั้นตอนเชื่อมต่อ">${["คู่มือ", "เชื่อมต่อ", "หน้าตาสัญญาณ"].map((label, i) => `<button type="button" data-studio-step="${i}" aria-current="${step === i ? "step" : "false"}"><span>${i + 1}</span>${label}</button>`).join("")}</nav><button class="channel-preview-jump text-button" type="button" data-preview-jump>ดูตัวอย่างสัญญาณ ↓</button><div class="channel-step-body">${content}</div><p data-channel-status role="status" aria-live="polite"></p><footer class="channel-step-footer">${step > 0 ? '<button type="button" class="text-button" data-studio-prev>← ย้อนกลับ</button>' : "<span>เชื่อมครั้งเดียว ใช้กับหลายเซตอัปได้</span>"}${step < 2 ? `<button type="button" class="secondary" data-studio-next>${step === 0 ? "เริ่มเชื่อมต่อ" : "ปรับหน้าตา"} →</button>` : ""}</footer></section><aside class="channel-preview-area"><button class="channel-preview-jump text-button" type="button" data-controls-jump>กลับไปปรับหน้าตา ↑</button><div class="channel-preview-label"><span>ตัวอย่างสัญญาณ</span><small>${guide.name}</small></div><div data-channel-preview aria-live="polite"><p>กำลังเตรียมตัวอย่าง…</p></div><p class="channel-preview-note">ข้อมูลตัวอย่าง · รูปแบบจริงอาจต่างตามอุปกรณ์${kind === "LINE" ? " · LINE รับภาพจริงเมื่อ Snaap มีโดเมน HTTPS สาธารณะ" : ""}</p></aside></div>`;
    syncAppearanceOptions();
    updatePreview();
  }
  function syncAppearanceOptions() {
    const minimal = session.appearance.layout === "minimal";
    const accents = dialog.querySelector(".channel-accent-options");
    if (accents) accents.hidden = minimal;
    const chart = dialog.querySelector('input[name="showChart"]');
    if (chart) {
      chart.closest("label").hidden = minimal;
      if (minimal) {
        chart.checked = false;
        session.appearance.showChart = false;
      }
    }
    const help = dialog.querySelector("[data-chart-help]");
    if (help)
      help.textContent = minimal
        ? "ข้อความล้วน · 🟢 Long / ซื้อ · 🔴 Short · 🟡 ออก · ⚪ ยกเลิกหรือหมดเวลา"
        : "กราฟใช้คู่เหรียญ กระดาน และกรอบเวลาของสัญญาณ · สัญญาณเก่าที่ไม่มีข้อมูลกราฟจะแสดงรูปแบบเดิม";
    const note = dialog.querySelector(".channel-preview-note");
    if (note)
      note.textContent =
        "ข้อมูลตัวอย่าง · รูปแบบจริงอาจต่างตามอุปกรณ์" +
        (session.kind === "LINE" && !minimal
          ? " · LINE รับภาพจริงเมื่อ Snaap มีโดเมน HTTPS สาธารณะ"
          : "");
  }
  function readAppearance() {
    const form = dialog.querySelector("#studio-appearance");
    if (!form) return;
    const data = new FormData(form);
    session.name = String(data.get("name"));
    for (const key of [
      "layout",
      "accent",
      "language",
      "heading",
      "creatorName",
    ])
      session.appearance[key] = String(data.get(key));
    for (const key of [
      "showPrice",
      "showSetup",
      "showTime",
      "showId",
      "showCreator",
      "showChart",
    ])
      session.appearance[key] = data.has(key);
  }
  async function updatePreview() {
    const request = ++previewRequest,
      current = session;
    try {
      const result = await api("/destinations/preview", "POST", {
        kind: session.kind,
        appearance: session.appearance,
      });
      if (request !== previewRequest || session !== current || !dialog.open)
        return;
      const en = result.language === "en",
        slot = dialog.querySelector("[data-channel-preview]");
      const banner = `/assets/snaap-signal-banner${session.appearance.accent === "lime" ? "" : "-" + session.appearance.accent}.png`;
      const signature = result.signature
        ? `<div class="channel-signature">${esc(result.signature)}</div>`
        : "";
      const message = result.text
        .split("\n")
        .map((line) =>
          line === result.signature
            ? `<span class="channel-signature">${esc(line)}</span>`
            : esc(line),
        )
        .join("\n");
      const chart = result.chartPreview
        ? `<img class="channel-chart-preview" src="${esc(result.chartPreview)}" alt="กราฟแท่งเทียนตัวอย่างของสัญญาณ">`
        : "";
      if (session.kind === "WEBHOOK")
        slot.innerHTML = `<div class="channel-json-head"><span class="channel-snaap-mini">s*</span><strong>snaap.signal</strong><small>POST · JSON</small></div>${chart}<pre class="channel-json-preview"><code>${esc(JSON.stringify(result.payload, null, 2))}</code></pre>`;
      else if (result.layout === "minimal")
        slot.innerHTML = `<div class="channel-preview-sender"><span class="channel-snaap-mini">s*</span><strong>Snaap <small>BOT</small></strong></div>${chart}<div class="channel-text-preview">${message}</div>`;
      else if (session.kind === "TELEGRAM")
        slot.innerHTML = `<div class="channel-preview-sender"><span class="channel-snaap-mini">s*</span><strong>Snaap <small>BOT</small></strong></div><div class="channel-photo-preview">${chart || `<img src="${banner}" alt="ภาพแบรนด์ Snaap">`}<div class="channel-text-preview">${message}</div></div>`;
      else
        slot.innerHTML = `<div class="channel-preview-sender"><span class="channel-snaap-mini">s*</span><strong>Snaap <small>${session.kind === "DISCORD" ? "APP" : "OA"}</small></strong></div><article class="channel-card-preview ${session.kind.toLowerCase()}" style="--signal-accent:${result.accent}"><header><strong class="signal-brand"><img src="/assets/snaap-card-wordmark.png" alt="Snaap"></strong><span>${esc(result.heading)}</span></header>${chart || (result.image ? `<img src="${banner}" alt="ภาพแบรนด์ Snaap">` : "")}<div class="channel-card-body"><span class="channel-signal-event">${esc(result.event)} · ${en ? "TEST" : "ทดสอบ"}</span><h3>${esc(result.title)}</h3><dl>${result.fields.map((x) => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`).join("")}</dl></div>${result.url || signature ? `<footer class="channel-card-footer">${result.url ? `<div class="channel-card-link">${en ? "Open Snaap" : "เปิด Snaap"} ↗</div>` : ""}${signature}</footer>` : ""}</article>`;
    } catch (error) {
      if (request === previewRequest && dialog.open)
        dialog.querySelector("[data-channel-preview]").innerHTML =
          `<p role="alert">${esc(error.message)}</p>`;
    }
  }
  async function syncChannels() {
    const channels = await api("/destinations");
    if (session) session.channels = channels;
    if (notificationData) notificationData.channels = channels;
    state.destinations = channels.items;
    document.dispatchEvent(new Event("setup-changed"));
    if (!document.querySelector("#view-notifications").hidden)
      await renderNotifications();
  }
  async function testChannel(id, button) {
    const active = session;
    button.disabled = true;
    try {
      const result = await api("/destinations/" + id + "/test", "POST", {});
      toast(
        result.status === "SENT"
          ? "ส่งตัวอย่างแล้ว · ตรวจข้อความที่ปลายทาง"
          : result.detail,
      );
      if (dialog?.open && session === active)
        status(result.detail, result.status !== "SENT");
      await syncChannels();
    } catch (error) {
      toast(error.message);
      if (dialog?.open && session === active) status(error.message, true);
    } finally {
      button.disabled = false;
    }
  }
  function open(kind, row, channels = notificationData?.channels) {
    if (!guides[kind]) return;
    if (!channels) {
      toast("กำลังโหลดช่องทาง ลองอีกครั้ง");
      return;
    }
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "channel-studio";
      dialog.setAttribute("aria-labelledby", "channel-studio-title");
      document.body.append(dialog);
      dialog.addEventListener("close", () => {
        session = null;
        ++previewRequest;
        clearTimeout(previewTimer);
        dialog.innerHTML = "";
      });
      dialog.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        if (button.hasAttribute("data-preview-jump")) {
          dialog.querySelector(".channel-preview-area").scrollIntoView({
            block: "start",
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
          });
          return;
        }
        if (button.hasAttribute("data-controls-jump")) {
          dialog.querySelector(".channel-step-nav").scrollIntoView({
            block: "start",
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
          });
          return;
        }
        if (button.hasAttribute("data-studio-close")) {
          dialog.close();
          return;
        }
        if (
          button.hasAttribute("data-studio-step") ||
          button.hasAttribute("data-studio-next") ||
          button.hasAttribute("data-studio-prev")
        ) {
          readAppearance();
          session.step = button.hasAttribute("data-studio-step")
            ? Number(button.dataset.studioStep)
            : session.step + (button.hasAttribute("data-studio-next") ? 1 : -1);
          paint();
          dialog.querySelector(`[data-studio-step="${session.step}"]`).focus();
          return;
        }
        if (
          button.hasAttribute("data-copy-command") ||
          button.hasAttribute("data-copy-secret")
        ) {
          try {
            await navigator.clipboard.writeText(
              button.hasAttribute("data-copy-secret")
                ? session.result.signingSecret
                : session.result.command,
            );
            status("คัดลอกแล้ว");
          } catch {
            status("คัดลอกจากข้อความด้านบนได้เลย", true);
          }
        }
        if (button.hasAttribute("data-check-binding")) {
          const active = session;
          button.disabled = true;
          try {
            const channels = await api("/destinations");
            if (session !== active) return;
            session.channels = channels;
            if (notificationData) notificationData.channels = channels;
            const row = channels.items.find((x) => x.id === session.id);
            if (row?.verified) {
              session.row = row;
              session.result = {
                verified: true,
                instruction: "ยืนยันผู้รับแล้ว ส่งทดสอบหรือปรับหน้าตาได้เลย",
              };
              session.step = 2;
              paint();
              await syncChannels();
            } else status("ยังไม่พบการยืนยัน ลองส่งรหัสในแชตแล้วตรวจอีกครั้ง");
          } catch (error) {
            status(error.message, true);
          } finally {
            button.disabled = false;
          }
        }
        if (button.hasAttribute("data-studio-test"))
          await testChannel(session.id, button);
      });
      dialog.addEventListener("input", (event) => {
        readAppearance();
        if (
          event.target.name === "layout" &&
          session.appearance.layout === "card"
        ) {
          session.appearance.showChart = true;
          dialog.querySelector('input[name="showChart"]').checked = true;
        }
        syncAppearanceOptions();
        const creator = dialog.querySelector("[data-creator-name]");
        if (creator) {
          creator.hidden = !session.appearance.showCreator;
          creator.querySelector("input").required =
            session.appearance.showCreator;
        }
        clearTimeout(previewTimer);
        previewTimer = setTimeout(updatePreview, 180);
      });
      dialog.addEventListener("submit", async (event) => {
        const active = session;
        event.preventDefault();
        const form = event.target,
          button = form.querySelector('button[type="submit"]');
        if (button.disabled) return;
        button.disabled = true;
        try {
          if (form.id === "studio-connection") {
            const data = Object.fromEntries(new FormData(form));
            session.name = data.name;
            const current = session;
            const result = await api("/destinations", "POST", {
              ...data,
              kind: session.kind,
              appearance: session.appearance,
            });
            if (session !== current) return;
            session.result = result;
            session.id = result.id;
            session.row = {
              id: result.id,
              kind: session.kind,
              name: session.name,
              appearance: session.appearance,
              verified: result.verified,
            };
            paint();
            await syncChannels();
          } else {
            readAppearance();
            if (!session.name.trim()) {
              status("ระบุชื่อช่องทาง", true);
              return;
            }
            if (!session.id) {
              session.step = 1;
              paint();
              return;
            }
            await api("/destinations/" + session.id, "PATCH", {
              name: session.name,
              appearance: session.appearance,
            });
            if (session !== active) return;
            session.row.appearance = { ...session.appearance };
            status("บันทึกแล้ว · สัญญาณถัดไปจะใช้รูปแบบนี้");
            await syncChannels();
          }
        } catch (error) {
          if (session === active) status(error.message, true);
        } finally {
          if (button.isConnected) button.disabled = false;
        }
      });
    }
    session = {
      kind,
      channels,
      row,
      id: row?.id,
      name: row?.name ?? "สัญญาณ " + guides[kind].name,
      appearance: { ...defaults(kind), ...row?.appearance },
      step: row ? 2 : 0,
    };
    dialog.showModal();
    paint();
    dialog.querySelector("[data-studio-close]").focus();
  }
  document.addEventListener("click", (event) => {
    const design = event.target.closest("[data-channel-design]");
    if (design) {
      const row = notificationData.channels.items.find(
        (x) => x.id === design.dataset.channelDesign,
      );
      if (row) open(row.kind, row);
    }
    const test = event.target.closest("[data-channel-test]");
    if (test) testChannel(test.dataset.channelTest, test);
  });
  window.SnaapChannels = { open };
})();

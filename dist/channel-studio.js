/* Connection guides and previews use the same renderer as external delivery. */
(() => {
  const guides = {
    TELEGRAM: {
      name: "Telegram",
      url: "https://t.me/BotFather",
      format:
        "สิ่งที่ต้องมี: บัญชี Telegram และบอตของคุณ · ถ้ามีบอตแล้ว ข้ามข้อ 1 ได้",
      steps: [
        [
          "สร้างบอตใน BotFather",
          "เปิด @BotFather ส่ง /newbot → ตั้งชื่อบอต → ตั้ง username ที่ลงท้ายด้วย bot เช่น mysignals_bot",
        ],
        [
          "คัดลอก Bot Token",
          "เมื่อสร้างสำเร็จ BotFather จะส่ง Token ให้ คัดลอกไปวางในช่อง Bot Token ของ Snaap ห้ามส่ง Token ในแชตอื่น",
        ],
        [
          "เปิดแชตที่จะรับสัญญาณ",
          "ส่วนตัว: เปิดบอตแล้วกด Start · กลุ่ม: เพิ่มบอตแล้วส่ง /start@ชื่อบอต · ช่อง: เพิ่มบอตเป็นผู้ดูแลที่โพสต์ได้ แล้วโพสต์ข้อความใหม่หนึ่งข้อความ",
        ],
        [
          "เลือกแชตใน Snaap",
          "กด “เริ่มเชื่อมต่อ” วาง Token แล้วกด “ค้นหาแชต” เลือกปลายทางที่ต้องการ ระบบจะเติม Chat ID ให้ หรือกรอก @ชื่อช่องสาธารณะเองได้",
        ],
        [
          "ส่งตัวอย่างแล้วเปิดใช้งาน",
          "กด “เชื่อมและส่งทดสอบ” แล้วดูว่าข้อความถึงปลายทาง จากนั้นปรับหน้าตา บันทึก และเลือกช่องทางนี้ในเซ็ตอัพ",
        ],
      ],
    },
    LINE: {
      name: "LINE",
      format: "รับผ่าน LINE OA ของ Snaap · ใช้บัญชี LINE ของคุณ",
      steps: [
        [
          "รับคำสั่งเชื่อมบัญชี",
          "กด “เริ่มเชื่อมต่อ” → “สร้างช่องทาง” แล้วคัดลอกคำสั่ง /start ที่แสดง",
        ],
        [
          "ส่งคำสั่งใน LINE",
          "กด “เปิด LINE” → เพิ่มเพื่อน OA ของ Snaap → วางคำสั่งที่คัดลอกในแชต OA แล้วส่ง ภายใน 10 นาที",
        ],
        [
          "ตรวจว่าเชื่อมสำเร็จ",
          "กลับ Snaap กด “ตรวจสถานะการเชื่อมต่อ” เมื่อยืนยันแล้ว จะเปิดหน้าปรับหน้าตาสัญญาณ",
        ],
        [
          "ตั้งหน้าตาและเริ่มรับสัญญาณ",
          "ปรับหน้าตา → บันทึก → ส่งตัวอย่าง แล้วเลือกช่องทางนี้ในเซ็ตอัพ การส่งตัวอย่างนับในโควตา LINE",
        ],
      ],
    },
    DISCORD: {
      name: "Discord",
      format: "ส่งเข้าห้องของคุณ · ต้องมีสิทธิ์ Manage Webhooks",
      url: "https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks",
      steps: [
        [
          "สร้าง Webhook",
          "ใน Discord เปิด Server Settings → Integrations → Webhooks → New Webhook",
        ],
        [
          "เลือกห้องและคัดลอก URL",
          "เลือกห้องข้อความที่จะรับสัญญาณ ตั้งชื่อตามต้องการ แล้วกด Copy Webhook URL",
        ],
        [
          "วาง URL ใน Snaap",
          "กด “เริ่มเชื่อมต่อ” วาง URL แล้วกด “เชื่อมและส่งทดสอบ” ตรวจว่ามีข้อความเข้าห้องที่เลือก",
        ],
        [
          "ตั้งหน้าตาและเริ่มรับสัญญาณ",
          "กด “ปรับหน้าตา” → บันทึก แล้วเลือกช่องทางนี้ในเซ็ตอัพ",
        ],
      ],
    },
    WEBHOOK: {
      name: "Webhook",
      format: "สำหรับระบบที่มี URL รับข้อมูลอยู่แล้ว · ต้องรองรับรูปแบบ Snaap",
      url: null,
      steps: [
        [
          "เตรียม URL ของระบบคุณ",
          "URL ต้องเป็น HTTPS และรับ POST JSON ได้ โดเมนต้องได้รับอนุญาตจาก Snaap ถ้ายังไม่มีระบบรับข้อมูล ดูตัวอย่าง Node.js ด้านล่าง",
        ],
        [
          "ตั้งให้ระบบตอบรหัสยืนยัน",
          "เมื่อรับ type: snaap.verify ให้ตอบค่า challenge เป็นข้อความ HTTP 200 ใช้ตัวอย่างด้านล่างได้",
        ],
        [
          "เชื่อมและเก็บ Secret",
          "กด “เริ่มเชื่อมต่อ” วาง URL → “สร้างช่องทาง” แล้วคัดลอก Signing Secret ไปเก็บในระบบปลายทาง สำหรับตรวจลายเซ็น ข้อมูลนี้แสดงครั้งเดียว",
        ],
        [
          "ตั้งหน้าตาและเริ่มรับสัญญาณ",
          "ปรับหน้าตา → บันทึก → ส่งตัวอย่าง แล้วเลือกช่องทางนี้ในเซ็ตอัพ ระบบของคุณต้องนำข้อมูลหน้าตาที่ได้รับไปแสดงเอง",
        ],
      ],
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
    const result =
      session.result ?? (session.row?.verified ? { verified: true } : null);
    if (!result) return "";
    const url = safeLink(result.connectUrl);
    if (result.verified)
      return `<section class="channel-connected-summary" aria-label="เชื่อมต่อ ${guides[session.kind].name} สำเร็จ"><div class="channel-connected-top"><span class="channel-target-mark" aria-hidden="true">${session.kind === "WEBHOOK" ? "{}" : `<img src="${channelInfo[session.kind].logo}" alt="">`}</span><span class="channel-connected-status"><span aria-hidden="true">✓</span> เชื่อมต่อแล้ว</span></div><h3>${esc(session.name)}</h3><p class="channel-connected-description">${guides[session.kind].name} พร้อมรับสัญญาณจากเซ็ตอัพของคุณ</p><div class="channel-connected-next"><span class="channel-connected-next-icon" aria-hidden="true">${uiIcon("sliders")}</span><div><strong>ถัดไป ตั้งหน้าตาสัญญาณ</strong><p>เลือกการ์ดหรือข้อความ แล้วบันทึก จากนั้นเลือกช่องทางนี้ในเซ็ตอัพ</p></div></div>${result.signingSecret ? `<div class="channel-connected-secret"><label>Signing Secret · แสดงครั้งเดียว<input type="password" readonly value="${esc(result.signingSecret)}" autocomplete="off"></label><button type="button" class="secondary" data-copy-secret>คัดลอก Secret</button><p class="channel-help">เก็บในระบบปลายทางก่อนปิดหน้านี้ เพื่อใช้ตรวจลายเซ็นของสัญญาณ</p></div>` : ""}<button type="button" class="primary channel-connected-action" data-studio-next>ตั้งหน้าตาสัญญาณ →</button></section>`;
    return `<div class="channel-binding"><h3>${result.verified ? "เชื่อมต่อแล้ว" : "ยืนยันผู้รับ"}</h3><p>${esc(result.instruction)}</p>${result.command ? `<div class="channel-copy-row"><code>${esc(result.command)}</code><button type="button" class="secondary" data-copy-command>คัดลอก</button></div><p class="channel-help">หมดอายุ ${new Date(result.expiresAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} · ห้ามแชร์รหัสนี้</p>` : ""}${url ? `<a class="primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">เปิด ${guides[session.kind].name} ↗</a>` : ""}${!result.verified ? '<button type="button" class="secondary" data-check-binding>ตรวจสถานะการเชื่อมต่อ</button>' : ""}${result.signingSecret ? `<label>Signing Secret · แสดงครั้งเดียว<input type="password" readonly value="${esc(result.signingSecret)}" autocomplete="off"></label><button type="button" class="secondary" data-copy-secret>คัดลอก Secret</button><p class="channel-help">เก็บในระบบปลายทางก่อนปิดหน้าต่าง หากสูญหายให้เชื่อมช่องทางใหม่</p>` : ""}</div>`;
  }
  function paint() {
    ++previewRequest;
    clearTimeout(previewTimer);
    const { kind, step, appearance, row } = session,
      guide = guides[kind];
    const available = session.channels.available[kind];
    let content;
    if (step === 0)
      content = `<div class="channel-flow-art" aria-hidden="true"><span class="channel-snaap-mark"><img class="brand-badge-symbol" src="/assets/snaap-favicon.svg?v=2" alt="" aria-hidden="true"></span><span class="channel-flow-line"><i></i></span><span class="channel-target-mark">${kind === "WEBHOOK" ? "{}" : `<img src="${channelInfo[kind].logo}" alt="">`}</span></div><h3>รับสัญญาณใน ${guide.name}</h3><p class="channel-intro">${guide.format}</p><ol class="channel-guide-list">${guide.steps.map(([title, detail], i) => `<li style="--step:${i}"><span>${i + 1}</span><div><h4>${title}</h4><p>${detail}</p></div></li>`).join("")}</ol>${guide.url && ["TELEGRAM", "DISCORD"].includes(kind) ? `<a class="text-button" href="${guide.url}" target="_blank" rel="noopener noreferrer">${kind === "TELEGRAM" ? "เปิด BotFather" : "วิธีสร้าง Webhook ใน Discord"} ↗</a>` : ""}${kind === "WEBHOOK" ? `<details class="channel-admin-guide"><summary>ตัวอย่างรับ challenge และสัญญาณ</summary><a class="text-button" href="/assets/snaap-webhook-example.mjs" download>ดาวน์โหลดตัวอย่าง Node.js ↧</a><pre><code>${esc('if (body.type === "snaap.verify") {\n  // HTTP 200, Content-Type: text/plain\n  return body.challenge;\n}\n// ตรวจ HMAC จาก raw body ก่อน parse JSON\n// ตรวจ timestamp และบันทึก body.id กันซ้ำ\n// ตอบ HTTP 2xx หลังบันทึกสัญญาณแล้ว')}</code></pre></details>` : ""}`;
    else if (step === 1)
      content =
        row?.verified || session.result?.verified
          ? connectionResult()
          : `<h3>${row?.verified ? "ช่องทางของคุณ" : "เชื่อมต่อ " + guide.name}</h3><p class="channel-intro">${kind === "TELEGRAM" ? "ระบุบอตและแชตของคุณ ระบบจะตรวจและส่งตัวอย่างก่อนยืนยัน" : kind === "DISCORD" ? "เมื่อกดเชื่อม จะส่งสัญญาณตัวอย่างหนึ่งข้อความไปยังห้องที่เลือก" : kind === "WEBHOOK" ? "ยืนยัน URL แล้วรับ secret สำหรับตรวจสอบลายเซ็น" : "ยืนยันบัญชีที่รับสัญญาณด้วยรหัสใช้ครั้งเดียว"}</p>${!available ? '<p class="channel-config-notice">ช่องทางนี้ยังไม่พร้อมเชื่อมต่อ คุณดูขั้นตอนและลองปรับหน้าตาสัญญาณได้ก่อน</p>' : ""}${!session.result && !row ? `<form id="studio-connection"><input type="hidden" name="name" value="${esc(session.name)}">${kind === "TELEGRAM" ? `<label>Bot Token<input name="botToken" type="password" required autocomplete="off" spellcheck="false" placeholder="Token จาก @BotFather"></label><button type="button" class="secondary" data-find-telegram-chats>ค้นหาแชต</button><div data-telegram-chats></div><label>Chat ID / @ชื่อช่อง<input name="recipient" required autocomplete="off" spellcheck="false" placeholder="เช่น 123456789, -1001234567890 หรือ @your_channel"></label><p class="channel-help">Token จะถูกเข้ารหัสและไม่แสดงอีก · การเชื่อมจะส่งตัวอย่างหนึ่งข้อความไปยังปลายทางที่คุณระบุ</p>` : ""}${["WEBHOOK", "DISCORD"].includes(kind) ? `<label>${kind === "DISCORD" ? "Discord Webhook URL" : "HTTPS endpoint"}<input name="url" type="${kind === "DISCORD" ? "password" : "url"}" required autocomplete="off" placeholder="${kind === "DISCORD" ? "https://discord.com/api/webhooks/…" : "https://your-domain.com/snaap"}"></label>` : ""}<p class="channel-help">${kind === "TELEGRAM" ? "ใช้บอตของคุณเอง ไม่ต้องเชื่อมกับบอต Snaap" : kind === "DISCORD" ? "URL เก็บแบบเข้ารหัส ไม่แสดงในรายการช่องทาง" : kind === "WEBHOOK" ? "ปลายทางต้องตอบ challenge กลับเป็นข้อความ" : "คุณไม่ต้องกรอก API key หรือรหัสผ่านบัญชี"}</p><button class="primary" type="submit" ${available ? "" : "disabled"}>${["TELEGRAM", "DISCORD"].includes(kind) ? "เชื่อมและส่งทดสอบ" : "สร้างช่องทาง"}</button></form>` : connectionResult() || `<p>${esc(row.name)} · ${row.verified ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน / ตัดการเชื่อมต่อแล้ว"}</p>${!row.verified ? '<p class="channel-help">หากรหัสหมดอายุหรือช่องทางถูกตัด ให้เพิ่มช่องทางใหม่</p>' : ""}`}${kind === "LINE" ? `<div class="channel-quota-note">LINE เดือนนี้: ${session.channels.lineQuota?.used ?? 0} / ${session.channels.lineQuota?.limit ?? "ไม่จำกัด"} ข้อความ · รวมการทดสอบ</div>` : ""}`;
    else
      content = `<h3>หน้าตาสัญญาณของคุณ</h3><p class="channel-intro">ตั้งแยกสำหรับแต่ละช่องทาง · พรีวิวอัปเดตตามที่เลือก</p><form id="studio-appearance"><label>หัวข้อข้อความ<input name="heading" maxlength="35" value="${esc(appearance.heading)}" placeholder="เช่น สัญญาณของฉัน"></label><fieldset class="channel-layout-options"><legend>รูปแบบ</legend>${[
        ["card", kind === "TELEGRAM" ? "ภาพ Snaap + ข้อความ" : "การ์ด Snaap"],
        ["minimal", "ข้อความ"],
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
        )}</fieldset><label>ภาษา<select name="language"><option value="th" ${appearance.language === "th" ? "selected" : ""}>ไทย</option><option value="en" ${appearance.language === "en" ? "selected" : ""}>English</option></select></label><fieldset class="channel-field-options"><legend>ข้อมูลที่แสดง</legend>${[
        ["showPrice", "ราคาอ้างอิง"],
        ["showSetup", "ชื่อเซ็ตอัพ"],
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
        )}</fieldset><label data-creator-name ${appearance.showCreator ? "" : "hidden"}>ชื่อผู้สร้างที่แสดง<input name="creatorName" maxlength="13" value="${esc(appearance.creatorName)}" placeholder="เช่น Gus Signals" ${appearance.showCreator ? "required" : ""}></label><p class="channel-help" data-chart-help>กราฟใช้คู่เหรียญ กระดาน และกรอบเวลาของสัญญาณ · สัญญาณเก่าที่ไม่มีข้อมูลกราฟจะแสดงเฉพาะข้อความ</p><p class="channel-help">คู่เทรด ฝั่ง ประเภทสัญญาณ และชื่อ Snaap แสดงเสมอ${kind === "WEBHOOK" ? " · ส่งหน้าตาเป็นข้อมูลให้ระบบปลายทางนำไปแสดง" : ""}</p><button class="primary" type="submit">${session.id ? "บันทึกหน้าตาสัญญาณ" : "ใช้รูปแบบนี้และเชื่อมต่อ"}</button>${session.id && session.row?.verified ? '<button class="secondary" type="button" data-studio-test>ส่งตัวอย่างที่บันทึกแล้ว</button>' : ""}</form>`;
    dialog.innerHTML = `<header class="channel-studio-header"><div><span class="channel-studio-overline">SNAAP / CHANNEL STUDIO</span><h2 id="channel-studio-title">${guide.name}</h2></div><button type="button" class="icon-button" data-studio-close aria-label="ปิดหน้าต่าง">${uiIcon("close")}</button></header><div class="channel-studio-grid ${step === 2 ? "" : "channel-studio-guide-only"}"><section class="channel-studio-work"><nav class="channel-step-nav" aria-label="ขั้นตอนเชื่อมต่อ">${["เตรียมพร้อม", "เชื่อมต่อ", "หน้าตาสัญญาณ"].map((label, i) => `<button type="button" data-studio-step="${i}" aria-current="${step === i ? "step" : "false"}"><span>${i + 1}</span>${label}</button>`).join("")}</nav>${step === 2 ? `<button class="channel-preview-jump text-button" type="button" data-preview-jump>ดูตัวอย่างสัญญาณ ↓</button>` : ""}<div class="channel-step-body">${content}</div><p data-channel-status role="status" aria-live="polite"></p><footer class="channel-step-footer">${step > 0 ? '<button type="button" class="text-button" data-studio-prev>← ย้อนกลับ</button>' : "<span>เชื่อมครั้งเดียว ใช้กับหลายเซ็ตอัพได้</span>"}${step < 2 && !(step === 1 && (row?.verified || session.result?.verified)) ? `<button type="button" class="secondary" data-studio-next>${step === 0 ? "เริ่มเชื่อมต่อ" : "ปรับหน้าตา"} →</button>` : ""}</footer></section>${step === 2 ? `<aside class="channel-preview-area"><button class="channel-preview-jump text-button" type="button" data-controls-jump>กลับไปปรับหน้าตา ↑</button><div class="channel-preview-label"><span>ตัวอย่างสัญญาณ</span><small>${guide.name}</small></div><div data-channel-preview aria-live="polite"><p>กำลังเตรียมตัวอย่าง…</p></div><p class="channel-preview-note">ข้อมูลตัวอย่าง · รูปแบบจริงอาจต่างตามอุปกรณ์${kind === "LINE" ? " · LINE รับภาพจริงเมื่อ Snaap มีโดเมน HTTPS สาธารณะ" : ""}</p></aside>` : ""}</div>`;
    syncAppearanceOptions();
    if (step === 2) updatePreview();
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
    session.name = String(data.get("heading") || "").trim() || session.name;
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
    if (!session || session.step !== 2) return;
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
      if (result.layout === "minimal")
        slot.innerHTML = `<div class="channel-preview-sender"><span class="channel-snaap-mini"><img class="brand-badge-symbol" src="/assets/snaap-favicon.svg?v=2" alt="" aria-hidden="true"></span><strong>Snaap <small>BOT</small></strong></div>${chart}<div class="channel-text-preview">${message}</div>`;
      else if (session.kind === "TELEGRAM")
        slot.innerHTML = `<div class="channel-preview-sender"><span class="channel-snaap-mini"><img class="brand-badge-symbol" src="/assets/snaap-favicon.svg?v=2" alt="" aria-hidden="true"></span><strong>Snaap <small>BOT</small></strong></div><div class="channel-photo-preview">${chart || `<img src="${banner}" alt="ภาพแบรนด์ Snaap">`}<div class="channel-text-preview">${message}</div></div>`;
      else
        slot.innerHTML = `<div class="channel-preview-sender"><span class="channel-snaap-mini"><img class="brand-badge-symbol" src="/assets/snaap-favicon.svg?v=2" alt="" aria-hidden="true"></span><strong>Snaap <small>${session.kind === "DISCORD" ? "APP" : session.kind === "WEBHOOK" ? "WEBHOOK" : "OA"}</small></strong></div><article class="channel-card-preview ${session.kind.toLowerCase()}" style="--signal-accent:${result.accent}"><header><strong class="signal-brand"><img src="/assets/snaap-card-symbol.png" alt="" aria-hidden="true">snaap.me</strong>${session.kind !== "DISCORD" ? (result.signature ? `<span class="channel-header-signature">${esc(result.signature)}</span>` : "") : ""}</header>${chart || (result.image ? `<img src="${banner}" alt="ภาพแบรนด์ Snaap">` : "")}<div class="channel-card-body">${session.appearance.heading ? `<p class="channel-card-heading">${esc(session.appearance.heading)}</p>` : ""}<span class="channel-signal-event">${esc(result.event)}</span><div class="channel-signal-headline"><h3>${esc(result.pair)}</h3><span class="channel-direction-badge" style="--direction-color:${result.directionBadge.color};--direction-bg:${result.directionBadge.background}">${esc(result.directionBadge.label)}</span></div><dl>${result.fields.map((x) => `<div><dt>${esc(x.label)}</dt><dd data-field="${esc(x.key || "")}">${esc(x.value)}</dd></div>`).join("")}</dl></div>${session.kind === "DISCORD" && signature ? `<footer class="channel-card-footer">${signature}</footer>` : ""}</article>`;
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
        if (button.hasAttribute("data-find-telegram-chats")) {
          const active = session;
          const tokenInput = dialog.querySelector('input[name="botToken"]');
          if (!tokenInput.value.trim()) {
            status("วาง Bot Token ก่อนค้นหาแชต", true);
            tokenInput.focus();
            return;
          }
          button.disabled = true;
          try {
            const result = await api("/destinations/telegram/chats", "POST", {
              botToken: tokenInput.value.trim(),
            });
            if (
              session !== active ||
              !dialog.open ||
              !dialog.querySelector("[data-telegram-chats]")
            )
              return;
            dialog.querySelector("[data-telegram-chats]").innerHTML = result
              .chats.length
              ? `<label>เลือกแชต<select data-telegram-chat-select><option value="">เลือกปลายทาง…</option>${result.chats.map((chat) => `<option value="${esc(chat.id)}">${esc(chat.label)} · ${esc(chat.id)}</option>`).join("")}</select></label>`
              : `<p class="channel-help">ยังไม่พบแชต เปิดบอตแล้วกด Start หรือส่ง /start@ชื่อบอต ในกลุ่ม จากนั้นกดค้นหาอีกครั้ง · ช่องสาธารณะกรอก @ชื่อช่อง ได้เลย</p>`;
            status(
              result.chats.length
                ? "พบแชตแล้ว เลือกปลายทางด้านล่าง"
                : "ยังไม่พบแชตที่บอตได้รับข้อความ",
            );
          } catch (error) {
            if (session === active) status(error.message, true);
          } finally {
            if (button.isConnected) button.disabled = false;
          }
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
      dialog.addEventListener("change", (event) => {
        if (event.target.matches("[data-telegram-chat-select]"))
          dialog.querySelector('input[name="recipient"]').value =
            event.target.value;
      });
      dialog.addEventListener("input", (event) => {
        if (!event.target.closest("#studio-appearance")) return;
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

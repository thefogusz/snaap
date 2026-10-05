const assert = require("node:assert/strict");
const { chromium } = require(process.env.SNAAP_PLAYWRIGHT_PATH || "playwright");
require("node:fs").mkdirSync(".local/audit", { recursive: true });
(async () => {
  const browser = await chromium.launch({
    channel: process.platform === "win32" ? "msedge" : undefined,
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGE ERROR", e.message);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && r.status() !== 401)
      console.log("HTTP", r.status(), r.url());
  });
  try {
    await page.goto("http://127.0.0.1:4189");
    await page
      .getByRole("button", { name: "ใช้บัญชีทดสอบ", exact: true })
      .click();
    await page
      .getByRole("button", { name: "แชท + เซตอัป", exact: true })
      .click();
    await page
      .locator("[data-chart-status]")
      .filter({ hasText: /\d+ แท่งปิด/ })
      .waitFor();
    assert.equal(await page.locator(".design-body > .studio-setup-settings").count(), 1);
    assert.ok(await page.locator(".studio-setup-settings .exchange-fieldset").isVisible());
    assert.equal(await page.locator('.studio-setup-settings [data-path="market"]').count(), 1);
    assert.ok(await page.locator('.studio-setup-settings > label').isVisible());
    assert.equal(await page.locator('.studio-toolbar-meta [data-draft-status]').count(), 1);
    assert.equal(await page.locator('.design-panel > [data-draft-status]').count(), 0);
    assert.equal(await page.locator('.design-body > .design-actions').isVisible(), false);
    assert.equal(await page.locator('.rule-review').getAttribute('open'), null);
    assert.ok(await page.locator(".studio-setup-settings").evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector(".studio-condition-overview")) & Node.DOCUMENT_POSITION_FOLLOWING)));
    const panelBox = (selector) => page.locator(selector).boundingBox();
    const beforeChat = await panelBox("#conversation");
    const beforeChart = await panelBox(".setup-studio");
    const dragDivider = async (name, delta) => {
      await page.locator(`[data-resize-panel="${name}"]`).click({trial:true});
      const box = await panelBox(`[data-resize-panel="${name}"]`);
      await page.mouse.move(box.x + box.width / 2, box.y + 80);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + delta, box.y + 80, { steps: 8 });
      await page.mouse.up();
    };
    await dragDivider("agent", 60);
    assert.ok((await panelBox("#conversation")).width > beforeChat.width + 50);
    assert.ok((await panelBox(".setup-studio")).width < beforeChart.width - 50);
    const beforeConditions = await panelBox(".design-panel");
    await dragDivider("conditions", -40);
    assert.ok((await panelBox(".design-panel")).width > beforeConditions.width + 30);
    const savedWidth = (await panelBox("#conversation")).width;
    await page.reload();
    await page.locator('[data-resize-panel="agent"]').waitFor({ state: "visible" });
    assert.ok(Math.abs((await panelBox("#conversation")).width - savedWidth) < 2);
    await page.locator('[data-resize-panel="agent"]').press("Home");
    await page.locator('[data-resize-panel="conditions"]').press("Home");
    assert.equal(Math.round((await panelBox("#conversation")).width), 300);
    console.log("PASS draggable panel widths, chart resizing, session restore and keyboard reset");
    for (const frame of ["30m", "1w", "15m"]) {
      await page.locator(`[data-chart-frame="${frame}"]`).click();
      await page.locator("[data-chart-title]").filter({hasText: `· ${frame} ·`}).waitFor();
      await page.locator("[data-chart-status]").filter({hasText: /\d+ แท่งปิด/}).waitFor();
      assert.ok((await page.locator(".studio-condition-overview").innerText()).includes("แท่ง 15M ปิด"));
    }
    assert.equal(await page.locator('[data-chart-frame="1m"]').count(), 0);
    assert.equal(await page.locator('[data-chart-frame="1M"]').count(), 0);
    console.log("PASS 30m and weekly chart views keep the evaluation timeframe unchanged");
    await page.locator('[data-chart-frame="4h"]').click();
    await page
      .locator("[data-chart-title]")
      .filter({ hasText: "4h" })
      .waitFor();
    assert.ok(
      (await page.locator(".studio-condition-overview").innerText()).includes(
        "แท่ง 15M ปิด",
      ),
    );
    await page.locator("[data-add-chart-indicator]").click();
    await page.locator("dialog[open] input[type=search]").fill("RSI");
    await page.locator('[data-pick-indicator="RSI"]').click();
    await page
      .locator("[data-chart-indicator]")
      .filter({ hasText: "RSI" })
      .waitFor();
    assert.equal(await page.locator('[data-indicator-form] .studio-indicator-actions > button[type=submit]').count(), 1);
    assert.equal(await page.locator('[data-indicator-form] .studio-indicator-actions > [data-indicator-condition]').count(), 1);
    assert.equal(await page.locator('[data-indicator-form] .studio-indicator-actions > [data-indicator-visibility]').count(), 1);
    assert.equal(await page.locator('[data-indicator-error]').isVisible(), false);
    await page.locator("[data-indicator-form] input[name=period]").fill("0");
    await page.locator("[data-indicator-form] button[type=submit]").click();
    assert.equal(await page.locator('[data-indicator-form] input[name=period]').evaluate(el => el.validity.valid), false);
    assert.ok((await page.locator('[data-chart-indicator]').filter({hasText:'RSI'}).innerText()).includes('14'));
    await page.locator("[data-indicator-form] input[name=period]").fill("21");
    await page.locator("[data-indicator-form] button[type=submit]").click();
    await page
      .locator("[data-chart-indicator]")
      .filter({ hasText: "RSI 21" })
      .waitFor();
    await page.locator("[data-indicator-condition]").click();
    await page.locator("dialog[open] input[name=value]").fill("50");
    await page.locator("dialog[open] button[type=submit]").click();
    await page
      .locator(".studio-overview-heading span")
      .filter({ hasText: "2/24" })
      .waitFor();
    assert.ok(
      (await page.locator(".studio-condition-overview").innerText()).includes(
        "RSI 21 (4h)",
      ),
    );
    await page.locator("[data-close-inspector]").click();
    await page.locator('[data-studio-edit="entry.children.1"]').click();
    await page
      .locator(
        '.studio-operand-inspector [data-path="entry.children.1.left.period"]',
      )
      .fill("25");
    await page
      .locator(
        '.studio-operand-inspector [data-path="entry.children.1.left.period"]',
      )
      .press("Tab");
    await page
      .locator(".studio-condition-overview")
      .filter({ hasText: "RSI 25 (4h)" })
      .waitFor();
    // Graph remains visible while an inspector scrolls.
    await page
      .locator(".design-panel")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    let box = await page.locator(".studio-canvas").boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 1000);
    await page.locator('[data-chart-frame="15m"]').click();
    await page
      .locator("[data-chart-title]")
      .filter({ hasText: "15m" })
      .waitFor();
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      if (width < 1280)
        await page.locator('[data-studio-tab="conditions"]').click();
      await page.waitForTimeout(350);
      box = await page.locator(".studio-canvas").boundingBox();
      assert.ok(
        box.width > 50 && box.height > 30 && box.y + box.height <= 1000,
        JSON.stringify({ width, box }),
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false, "horizontal overflow at " + width);
      await page.locator(".design-panel").evaluate((el) => (el.scrollTop = 0));
      await page.screenshot({
        path: ".local/audit/studio-" + width + "-light.png",
      });
      await page.getByRole("button", { name: "โหมดมืด", exact: true }).click();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: ".local/audit/studio-" + width + "-dark.png",
      });
      await page.getByRole("button", { name: "โหมดมืด", exact: true }).click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    // A slow older timeframe response must not replace the latest chart.
    await page.route("**/api/v1/preview", async (route) => {
      if (route.request().postDataJSON().chartTimeframe === "1h")
        await new Promise((r) => setTimeout(r, 900));
      await route.continue();
    });
    const older = page.waitForRequest(
      (r) =>
        r.url().endsWith("/preview") &&
        r.postDataJSON().chartTimeframe === "1h",
    );
    await page.locator('[data-chart-frame="1h"]').click();
    await older;
    await page.locator('[data-chart-frame="4h"]').click();
    await page
      .locator("[data-chart-indicator]")
      .filter({ hasText: "RSI 25 (4h)" })
      .waitFor();
    await page.waitForTimeout(1100);
    assert.ok(
      (await page.locator("[data-chart-title]").innerText()).includes("4h"),
    );
    await page.unroute("**/api/v1/preview");
    await page.locator('[data-chart-frame="15m"]').click();
    await page
      .locator("[data-chart-indicator]")
      .filter({ hasText: "EMA 200" })
      .waitFor();
    // Shared chart edits list affected conditions, and hiding never removes conditions.
    await page
      .locator("[data-chart-indicator]")
      .filter({ hasText: "EMA 200" })
      .click();
    await page.locator("[data-indicator-condition]").click();
    await page.locator("dialog[open] input[name=value]").fill("100");
    await page.locator("dialog[open] button[type=submit]").click();
    await page
      .locator(".studio-overview-heading span")
      .filter({ hasText: "3/24" })
      .waitFor();
    await page
      .locator("[data-chart-indicator]")
      .filter({ hasText: "EMA 200" })
      .click();
    await page.locator("[data-indicator-form] input[name=period]").fill("180");
    await page.locator("[data-indicator-form] button[type=submit]").click();
    await page.locator("dialog[open] [data-confirm-shared]").waitFor();
    assert.equal(await page.locator("dialog[open] li").count(), 2);
    await page.locator("dialog[open] [data-confirm-shared]").click();
    await page
      .locator("[data-chart-indicator]")
      .filter({ hasText: "EMA 180" })
      .waitFor();
    await page.locator("[data-indicator-visibility]").click();
    assert.ok(
      (await page.locator(".studio-condition-overview").innerText()).includes(
        "EMA 180",
      ),
    );
    await page.locator("[data-indicator-visibility]").click();
    await page.locator('[data-studio-edit="entry.children.0"]').click();
    await page
      .locator("#followup-input")
      .fill("ช่วยเปลี่ยนพักสัญญาณเป็น 7 แท่ง");
    const pending = page.waitForRequest((r) => r.url().endsWith("/turns"));
    await page.getByRole("button", { name: "ส่งข้อความ", exact: true }).click();
    await pending;
    await page
      .locator(
        '.studio-operand-inspector [data-path="entry.children.0.right.period"]',
      )
      .fill("50");
    await page
      .locator(
        '.studio-operand-inspector [data-path="entry.children.0.right.period"]',
      )
      .press("Tab");
    await page
      .locator("dialog[open]")
      .filter({ hasText: "ตรวจร่างที่ snaap เสนอ" })
      .waitFor();
    assert.ok(
      (await page.locator(".studio-condition-overview").innerText()).includes(
        "EMA 50",
      ),
    );
    await page.locator("dialog[open] [data-keep]").click();
    assert.ok(
      (await page.locator(".studio-condition-overview").innerText()).includes(
        "EMA 50",
      ),
    );
    // Uncontested follow-up applies, records the actual change, and has safe undo.
    await page
      .locator("#followup-input")
      .fill("ช่วยเปลี่ยนพักสัญญาณเป็น 7 แท่ง");
    await page.getByRole("button", { name: "ส่งข้อความ", exact: true }).click();
    await page.locator("[data-revert-change]").waitFor();
    await page.locator("[data-revert-change]").click();
    await page
      .locator(".setup-change-card")
      .filter({ hasText: "ย้อนการปรับครั้งนี้แล้ว" })
      .waitFor();
    await page.locator("[data-studio-save]").click();
    await page
      .locator("#editor-feedback")
      .filter({ hasText: "บันทึกเซตอัพแล้ว" })
      .waitFor();
    assert.equal(
      await page.locator("[data-studio-activate]").isEnabled(),
      true,
    );
    await page.locator("[data-studio-activate]").click();
    await page
      .getByRole("button", { name: "ยังไม่เปิดใช้งาน", exact: true })
      .click();
    assert.deepEqual(errors, []);
    console.log(
      "PASS studio interaction, MTF separation, stale preview rejection, 1440/1024/390 both themes, agent conflicts, receipts/undo and save/activation separation; no JS errors",
    );
  } catch (e) {
    console.log("BODY", (await page.locator("body").innerText()).slice(-3500));
    await page.screenshot({ path: ".local/audit/studio-error.png" });
    throw e;
  } finally {
    await browser.close();
  }
})();

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { hash } from "../src/api.js";
import { strategySchema } from "../src/domain/engine.js";

// Ten ordered virtual days, with persistent accounts and real routes/SQL.
// Wall-clock timers are not advanced: expiry boundaries are seeded explicitly.
export async function runUserJourneys(
  createApp: () => Promise<FastifyInstance>,
  db: pg.Pool,
  specFor: (text: string, current?: any) => any,
  providerRequests: any[],
) {
  const providerStart = providerRequests.length;
  let app = await createApp();
  try {
    const styles = [
      "มือใหม่ถามก่อนบันทึก",
      "รอบคอบเก็บร่างข้ามวัน",
      "Short ระยะสั้น",
      "Long/Short แยกเงื่อนไข",
      "Break & Retest",
      "ขั้นสูงหลายกรอบเวลา",
      "ใช้ตัวแก้ไขเองไม่เรียก AI",
      "แยกหลายเวิร์กสเปซ",
      "กดซ้ำและใช้สองแท็บ",
      "เครือข่ายล้มเหลวแล้วลองใหม่",
    ];
    const users = styles.map((style, index) => ({
      style,
      index,
      id: randomUUID(),
      token: randomUUID(),
      space: randomUUID(),
      otherSpace: randomUUID(),
      conv: "",
      draft: null as any,
      revision: 0,
      rule: null as any,
      card: "",
      oldCard: "",
      days: [] as any[],
      share: "",
      sharedSnapshot: null as any,
    }));
    let calls = 0;
    const events: any[] = [];
    async function request(
      u: (typeof users)[number],
      url: string,
      method: any = "GET",
      payload?: any,
    ) {
      calls++;
      return app.inject({
        url: "/api/v1" + url,
        method,
        payload,
        headers: {
          host: "127.0.0.1:4175",
          cookie: `snaap_session=${u.token}`,
          "x-snaap-client": "web",
          "x-snaap-workspace": u.space,
        },
      });
    }
    async function call(
      u: (typeof users)[number],
      url: string,
      method: any = "GET",
      payload?: any,
      expected = 200,
    ) {
      const r = await request(u, url, method, payload);
      assert.equal(r.statusCode, expected, `${u.style} ${url}: ${r.body}`);
      return r.json();
    }
    for (const u of users) {
      await db.query("INSERT INTO users(id,email) VALUES($1,$2)", [
        u.id,
        `journey${u.index}@snaap.invalid`,
      ]);
      await db.query(
        "INSERT INTO sessions VALUES($1,$2,now()+interval '30 days')",
        [hash(u.token), u.id],
      );
      if (u.index !== 0)
        await db.query(
          "INSERT INTO entitlements(owner_id,pro_until) VALUES($1,now()+interval '30 days')",
          [u.id],
        );
      await db.query(
        "INSERT INTO workspaces(id,owner_id,name,is_default) VALUES($1,$2,$3,true),($4,$2,'แยกทดลอง',false)",
        [u.space, u.id, u.style, u.otherSpace],
      );
      u.conv = (
        await call(u, "/conversations", "POST", { title: u.style }, 201)
      ).id;
    }
    for (let day = 1; day <= 10; day++) {
      if (day > 1) {
        await app.close();
        app = await createApp();
      }
      // Accounts operate concurrently; actions within each account remain ordered.
      const dayResults = await Promise.allSettled(
        users.map(async (u) => {
          const started = performance.now();
          const base = `/conversations/${u.conv}`;
          const returning = (await call(u, "/conversations")).find(
            (c: any) => c.id === u.conv,
          );
          assert.ok(returning, "returning user retains conversation");
          assert.equal(returning.draft_revision, u.revision);
          assert.deepEqual(returning.draft, u.draft);
          if (u.rule) {
            const persisted = (await call(u, "/rules")).find(
              (r: any) => r.id === u.rule.id,
            );
            assert.deepEqual(persisted.spec, u.rule.spec);
            assert.equal(persisted.revision, u.rule.revision);
          }
          if (day === 6 && u.index === 0) {
            await db.query(
              "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
              [hash(u.token)],
            );
            await call(u, "/conversations", "GET", undefined, 401);
            u.token = randomUUID();
            await db.query(
              "INSERT INTO sessions VALUES($1,$2,now()+interval '30 days')",
              [hash(u.token), u.id],
            );
            assert.ok(
              (await call(u, "/conversations")).some(
                (c: any) => c.id === u.conv,
              ),
            );
          }
          if (day === 9 && u.index === 5) {
            await db.query(
              "UPDATE entitlements SET pro_until=now()-interval '1 second' WHERE owner_id=$1",
              [u.id],
            );
            const blocked = await call(
              u,
              "/workspaces",
              "POST",
              { name: "Pro หมดอายุ" },
              403,
            );
            assert.equal(blocked.error.code, "PRO_REQUIRED");
          }
          if (day === 10 && u.index === 5)
            await db.query(
              "UPDATE entitlements SET pro_until=now()+interval '30 days' WHERE owner_id=$1",
              [u.id],
            );
          if (u.index === 0 && day === 1)
            assert.equal(
              (
                await call(u, base + "/turns", "POST", {
                  text: "text-only",
                  mode: "standard",
                  draft: null,
                })
              ).draft,
              null,
            );
          if (u.index === 9) {
            const failed = await call(
              u,
              base + "/turns",
              "POST",
              {
                text: day % 2 ? "provider-error" : "incomplete",
                mode: "standard",
                draft: u.draft,
              },
              502,
            );
            assert.equal(
              failed.error.code,
              day % 2 ? "AI_UNAVAILABLE" : "AI_INCOMPLETE",
            );
          }
          let draft;
          const styleText = [
            "simple",
            "simple",
            "short 15m",
            "both",
            "break",
            "maximum",
            "simple",
            "complex",
            "simple",
            "short",
          ][u.index];
          if (u.index === 6) draft = specFor("simple", u.draft);
          else if (u.index === 8 && day === 4) {
            const pending = request(u, base + "/turns", "POST", {
              text: "slow",
              mode: "standard",
              draft: u.draft,
            });
            let running = false;
            for (let i = 0; i < 100 && !running; i++)
              running = !!(
                await db.query(
                  "SELECT 1 FROM agent_runs WHERE owner_id=$1 AND status='RUNNING'",
                  [u.id],
                )
              ).rowCount;
            assert.ok(running, "slow turn reserved before duplicate");
            const duplicate = await call(
              u,
              base + "/turns",
              "POST",
              { text: "simple", mode: "standard", draft: u.draft },
              429,
            );
            assert.equal(duplicate.error.code, "AGENT_BUSY");
            const r = await pending;
            assert.equal(r.statusCode, 200, r.body);
            draft = r.json().draft;
          } else {
            const result = await call(u, base + "/turns", "POST", {
              text: styleText,
              mode: "standard",
              draft: u.draft,
            });
            draft = result.draft;
          }
          assert.ok(draft);
          draft = strategySchema.parse({
            ...draft,
            name: `${u.style} · วันที่ ${day}`,
          });
          if (u.index === 2) assert.equal(draft.side, "SHORT");
          if (u.index === 3) assert.equal(draft.side, "BOTH");
          if (u.index === 4) assert.equal(draft.stages.length, 2);
          if (u.index === 5) assert.equal(draft.mirrorShort, true);
          const oldRevision = u.revision;
          u.revision = (
            await call(u, base + "/draft", "PUT", {
              spec: draft,
              expectedRevision: u.revision,
            })
          ).draft_revision;
          u.draft = draft;
          if (u.index === 8) {
            await call(
              u,
              base + "/draft",
              "PUT",
              {
                spec: { ...draft, name: "แท็บเก่าพยายามทับ" },
                expectedRevision: oldRevision,
              },
              409,
            );
            assert.deepEqual(
              (await call(u, "/conversations")).find(
                (c: any) => c.id === u.conv,
              ).draft,
              draft,
            );
          }
          // Cautious user leaves an unsaved accepted draft on odd days.
          if (u.index === 1 && day % 2) {
            if (u.rule)
              assert.ok(
                (await call(u, "/rules")).find((r: any) => r.id === u.rule.id)
                  .active,
              );
          } else {
            const card = (
              await call(u, base + "/setup-card", "POST", {
                expectedRevision: u.revision,
              })
            ).message;
            assert.equal(
              (
                await call(u, base + "/setup-card", "POST", {
                  expectedRevision: u.revision,
                })
              ).message.id,
              card.id,
            );
            if (u.oldCard && u.oldCard !== card.id)
              await call(
                u,
                `${base}/setup-card/${u.oldCard}/save`,
                "POST",
                { expectedRevision: u.revision, destinations: [] },
                409,
              );
            u.card = card.id;
            const payload = {
              expectedRevision: u.revision,
              expectedRuleRevision: u.rule?.revision,
              destinations: [],
            };
            let saved;
            if (u.index === 8) {
              const results = await Promise.all(
                Array.from({ length: 3 }, () =>
                  request(
                    u,
                    `${base}/setup-card/${card.id}/save`,
                    "POST",
                    payload,
                  ),
                ),
              );
              assert.deepEqual(
                results.map((r) => r.statusCode).sort(),
                [200, 409, 409],
              );
              saved = results.find((r) => r.statusCode === 200)!.json();
            } else
              saved = await call(
                u,
                `${base}/setup-card/${card.id}/save`,
                "POST",
                payload,
              );
            if (u.rule)
              assert.equal(
                saved.rule.id,
                u.rule.id,
                "refinement retains rule identity across days",
              );
            assert.equal(
              saved.rule.active,
              false,
              "saving changed conditions pauses alerts",
            );
            assert.deepEqual(saved.rule.spec, draft);
            u.revision = saved.draft_revision;
            u.rule = saved.rule;
            u.oldCard = card.id;
            if ((u.index === 4 || u.index === 5) && day === 2) {
              u.rule = await call(u, `/rules/${u.rule.id}/risk-plan`, "PUT", {
                expectedRevision: u.rule.revision,
                riskPlan: {
                  enabled: true,
                  atrPeriod: 14,
                  stopAtr: 1.5,
                  rewardRisk: 2,
                },
              });
            }
            if ((u.index === 4 || u.index === 5) && day >= 2)
              assert.equal(u.rule.risk_plan.enabled, true);
            u.rule = await call(u, `/rules/${u.rule.id}/activation`, "POST", {
              active: true,
              expectedRevision: u.rule.revision,
              confirmation: "ACTIVATE",
            });
            const retry = await call(
              u,
              `${base}/setup-card/${card.id}/save`,
              "POST",
              { expectedRevision: u.revision, destinations: [] },
            );
            assert.equal(
              retry.rule.revision,
              u.rule.revision,
              "retry does not create extra revision",
            );
            assert.equal(
              retry.rule.active,
              true,
              "retry must not pause an unchanged saved setup",
            );
            u.revision = retry.draft_revision;
          }
          const history = await call(u, base + "/messages");
          assert.ok(history.every((m: any) => m.conversation_id === u.conv));
          if (u.card)
            assert.ok(
              history.some(
                (m: any) => m.id === u.card && m.ui_card.ruleId === u.rule.id,
              ),
            );
          if (u.index === 4) {
            if (day === 3) {
              u.share = (
                await call(
                  u,
                  "/setup-shares",
                  "POST",
                  { ruleId: u.rule.id },
                  201,
                )
              ).code;
              u.sharedSnapshot = await call(
                users[6],
                `/setup-shares/${u.share}`,
              );
              assert.equal(u.sharedSnapshot.riskPlan.enabled, true);
            } else if (day > 3 && day < 7) {
              assert.deepEqual(
                await call(users[6], `/setup-shares/${u.share}`),
                u.sharedSnapshot,
                "shared snapshot remains frozen despite subsequent revisions",
              );
            } else if (day === 7) {
              await call(u, `/setup-shares/${u.share}`, "DELETE");
              await call(
                users[6],
                `/setup-shares/${u.share}`,
                "GET",
                undefined,
                404,
              );
            }
          }
          if (day === 10 && u.index === 0) {
            const used = Number(
              (
                await db.query(
                  "SELECT count(*) AS n FROM usage_ledger WHERE owner_id=$1 AND status='COMPLETED'",
                  [u.id],
                )
              ).rows[0].n,
            );
            for (let i = used; i < 20; i++)
              await call(u, base + "/turns", "POST", {
                text: "text-only",
                mode: "standard",
                draft: u.draft,
              });
            const countBefore = (
              await db.query(
                "SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1",
                [u.conv],
              )
            ).rows[0].n;
            const blocked = await call(
              u,
              base + "/turns",
              "POST",
              { text: "simple", mode: "standard", draft: u.draft },
              429,
            );
            assert.equal(blocked.error.code, "QUOTA_EXCEEDED");
            assert.equal(
              (
                await db.query(
                  "SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1",
                  [u.conv],
                )
              ).rows[0].n,
              countBefore,
              "quota rejection does not pollute history",
            );
            assert.equal(
              (
                await db.query(
                  "SELECT count(*)::int AS n FROM usage_ledger WHERE owner_id=$1 AND status='COMPLETED'",
                  [u.id],
                )
              ).rows[0].n,
              20,
            );
          }
          // Cross-account isolation on every day, not only on the initial save.
          const intruder = users[(u.index + 1) % 10];
          assert.deepEqual(await call(intruder, base + "/messages"), []);
          await call(
            intruder,
            base + "/turns",
            "POST",
            { text: "simple", mode: "standard" },
            404,
          );
          if (u.rule)
            await call(
              intruder,
              `/rules/${u.rule.id}/activation`,
              "POST",
              {
                active: false,
                expectedRevision: u.rule.revision,
                confirmation: "PAUSE",
              },
              409,
            );
          if (u.index === 7) {
            const primary = u.space;
            u.space = u.otherSpace;
            assert.ok(
              !(await call(u, "/conversations")).some(
                (c: any) => c.id === u.conv,
              ),
            );
            assert.deepEqual(await call(u, base + "/messages"), []);
            await call(
              u,
              base + "/setup-card",
              "POST",
              { expectedRevision: u.revision },
              404,
            );
            await call(
              u,
              `/rules/${u.rule.id}/activation`,
              "POST",
              {
                active: false,
                expectedRevision: u.rule.revision,
                confirmation: "PAUSE",
              },
              409,
            );
            await call(
              u,
              `/rules/${u.rule.id}/activation`,
              "POST",
              {
                active: true,
                expectedRevision: u.rule.revision,
                confirmation: "ACTIVATE",
              },
              409,
            );
            u.space = primary;
            if (day === 8) {
              // Move a real conversation and its rule into the secondary workspace,
              // then exercise deletion's migration back to the default workspace.
              await db.query(
                "UPDATE conversations SET workspace_id=$1 WHERE id=$2",
                [u.otherSpace, u.conv],
              );
              await db.query("UPDATE rules SET workspace_id=$1 WHERE id=$2", [
                u.otherSpace,
                u.rule.id,
              ]);
              assert.equal(
                (await call(u, `/workspaces/${u.otherSpace}`, "DELETE"))
                  .workspaceId,
                primary,
              );
              assert.ok(
                (await call(u, "/conversations")).some(
                  (c: any) => c.id === u.conv,
                ),
              );
              u.otherSpace = (
                await call(
                  u,
                  "/workspaces",
                  "POST",
                  { name: "แยกทดลองใหม่" },
                  201,
                )
              ).id;
            }
          }
          await call(u, "/signals");
          await call(u, "/monitor");
          const event = {
            day,
            persona: u.index + 1,
            style: u.style,
            draftRevision: u.revision,
            ruleRevision: u.rule?.revision ?? null,
            history: history.length,
            ms: Math.round(performance.now() - started),
          };
          u.days.push(event);
          events.push(event);
        }),
      );
      for (const result of dayResults)
        if (result.status === "rejected") throw result.reason;
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM agent_runs WHERE status='RUNNING'",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM usage_ledger WHERE status='RESERVED'",
          )
        ).rows[0].n,
        0,
      );
      console.log(
        `PASS: virtual day ${day}/10 — ten persistent users, isolation, revisions, recovery`,
      );
    }
    for (const u of users) {
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM rules WHERE owner_id=$1",
          [u.id],
        )
      ).rows[0].n;
      assert.equal(count, 1, "no duplicate rules after ten days");
      const revisions = (
        await db.query(
          "SELECT revision,spec FROM rule_revisions WHERE rule_id=$1 ORDER BY revision",
          [u.rule.id],
        )
      ).rows;
      assert.deepEqual(
        revisions.map((r) => r.revision),
        Array.from({ length: u.rule.revision }, (_, i) => i + 1),
      );
      assert.deepEqual(revisions.at(-1).spec, u.rule.spec);
      const used = (
        await db.query(
          "SELECT status,count(*)::int AS n FROM usage_ledger WHERE owner_id=$1 GROUP BY status",
          [u.id],
        )
      ).rows;
      if (u.index === 6)
        assert.equal(used.length, 0, "editor-only user invokes no AI");
      if (u.index === 9)
        assert.equal(used.find((r) => r.status === "REFUNDED").n, 10);
    }
    // Real fixed-window rate-limit boundary on a fresh app, without weakening
    // production limits to make accelerated journeys pass.
    await app.close();
    app = await createApp();
    for (let i = 0; i < 180; i++) await call(users[6], "/rules");
    const throttled = await call(users[6], "/rules", "GET", undefined, 429);
    assert.equal(throttled.error.code, "RATE_LIMITED");
    assert.match(throttled.error.message, /กรุณารอ/);
    await call(users[0], "/rules");
    await mkdir(".local", { recursive: true });
    await writeFile(
      ".local/user-journeys-results.json",
      JSON.stringify(
        {
          virtualDays: 10,
          users: 10,
          userDays: 100,
          apiCalls: calls,
          providerRequests: providerRequests.length - providerStart,
          events,
        },
        null,
        2,
      ),
    );
    console.log(
      `PASS: 100 user-days, ${calls} authenticated API calls; results .local/user-journeys-results.json`,
    );
  } finally {
    await app.close();
  }
}

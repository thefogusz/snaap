import type { FastifyInstance } from "fastify";
import type pg from "pg";
import Stripe from "stripe";
import { z } from "zod";
import { ApiError } from "./errors.js";
import { transaction } from "./data/db.js";
export async function registerBilling(
  app: FastifyInstance,
  db: pg.Pool,
  origin: string,
) {
  const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;
  app.post("/api/v1/billing/checkout", async (req) => {
    if (!stripe)
      throw new ApiError(
        503,
        "BILLING_NOT_CONFIGURED",
        "ยังไม่ได้เชื่อมระบบชำระเงิน",
      );
    if (
      process.env.BILLING_LIVE_ENABLED !== "true" &&
      !process.env.STRIPE_SECRET_KEY!.startsWith("sk_test_")
    )
      throw new ApiError(503, "BILLING_LIVE_DISABLED", "ยังไม่เปิดรับเงินจริง");
    const { method } = z
      .object({ method: z.enum(["card", "promptpay"]) })
      .strict()
      .parse(req.body);
    const row = (
      await db.query(
        "SELECT stripe_customer FROM entitlements WHERE owner_id=$1",
        [req.userId],
      )
    ).rows[0];
    let customer = row?.stripe_customer;
    if (!customer) {
      const created = await stripe.customers.create(
        { metadata: { ownerId: req.userId } },
        { idempotencyKey: `customer:${req.userId}` },
      );
      customer = created.id;
      await db.query(
        "INSERT INTO entitlements(owner_id,stripe_customer) VALUES($1,$2) ON CONFLICT(owner_id) DO UPDATE SET stripe_customer=excluded.stripe_customer",
        [req.userId, customer],
      );
    }
    const session = await stripe.checkout.sessions.create({
      customer,
      mode: method === "card" ? "subscription" : "payment",
      allowed_payment_method_types: [method],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "thb",
            unit_amount: 19900,
            product_data: { name: "SNAAP Pro" },
            ...(method === "card"
              ? { recurring: { interval: "month" as const } }
              : {}),
          },
        },
      ],
      metadata: { ownerId: req.userId, kind: method, snaapPlan: "pro_199" },
      ...(method === "card"
        ? {
            subscription_data: {
              metadata: { ownerId: req.userId, snaapPlan: "pro_199" },
            },
          }
        : { payment_intent_data: { metadata: { ownerId: req.userId } } }),
      success_url: `${origin}/#billing`,
      cancel_url: `${origin}/#billing`,
    });
    return { url: session.url };
  });
  app.post("/api/v1/billing/portal", async (req) => {
    if (!stripe)
      throw new ApiError(
        503,
        "BILLING_NOT_CONFIGURED",
        "ยังไม่ได้เชื่อมระบบชำระเงิน",
      );
    const row = (
      await db.query(
        "SELECT stripe_customer FROM entitlements WHERE owner_id=$1",
        [req.userId],
      )
    ).rows[0];
    if (!row?.stripe_customer)
      throw new ApiError(404, "CUSTOMER_NOT_FOUND", "ยังไม่มีบัญชีชำระเงิน");
    return {
      url: (
        await stripe.billingPortal.sessions.create({
          customer: row.stripe_customer,
          return_url: origin + "/#billing",
        })
      ).url,
    };
  });
  await app.register(async (hooks) => {
    hooks.removeContentTypeParser("application/json");
    hooks.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (req, body, done) => done(null, body),
    );
    hooks.post("/api/v1/hooks/stripe", async (req) => {
      if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)
        throw new ApiError(
          503,
          "BILLING_NOT_CONFIGURED",
          "ยังไม่ได้เชื่อม webhook",
        );
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          req.headers["stripe-signature"] as string,
          process.env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        throw new ApiError(400, "SIGNATURE", "ลายเซ็นไม่ถูกต้อง");
      }
      if (event.type === "invoice.paid") {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.payments)
          event.data.object = await stripe.invoices.retrieve(invoice.id, {
            expand: ["payments"],
          });
      }
      await applyBillingEvent(db, event);
      return { received: true };
    });
  });
}

/** Pure event-to-ledger boundary; signature verification occurs before calling this function. */
export async function applyBillingEvent(
  db: pg.Pool,
  event: { id: string; type: string; data: { object: any } },
) {
  const data = event.data.object;
  await transaction(db, async (c) => {
    // Serialize payment/refund events, including refunds arriving before their payment.
    // No provider calls occur under this lock. Initial service supports 20–100 users.
    await c.query("SELECT pg_advisory_xact_lock(1936613744, 1)");
    if (
      !(
        await c.query(
          "INSERT INTO billing_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id",
          [event.id],
        )
      ).rowCount
    )
      return;
    let owner: string | undefined,
      payment: string | undefined,
      start: number | undefined,
      end: number | undefined,
      kind = "";
    if (
      (event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded") &&
      data.mode === "payment" &&
      data.payment_status === "paid" &&
      data.amount_total === 19900 &&
      data.currency === "thb" &&
      data.metadata?.snaapPlan === "pro_199"
    ) {
      owner = data.metadata.ownerId;
      payment =
        typeof data.payment_intent === "string"
          ? data.payment_intent
          : data.payment_intent?.id;
      kind = "promptpay";
      if (!z.string().uuid().safeParse(owner).success) return;
      const customer = (
        await c.query(
          "SELECT stripe_customer,pro_until FROM entitlements WHERE owner_id=$1 FOR UPDATE",
          [owner],
        )
      ).rows[0];
      if (customer?.stripe_customer !== data.customer) return;
      start = Math.max(
        Date.now(),
        customer?.pro_until ? new Date(customer.pro_until).getTime() : 0,
      );
      end = start + 30 * 86400000;
    }
    if (
      event.type === "invoice.paid" &&
      data.currency === "thb" &&
      data.amount_paid === 19900 &&
      data.parent?.subscription_details?.metadata?.snaapPlan === "pro_199"
    ) {
      owner = (
        await c.query(
          "SELECT owner_id FROM entitlements WHERE stripe_customer=$1 FOR UPDATE",
          [data.customer],
        )
      ).rows[0]?.owner_id;
      const paid = (data.payments?.data ?? []).find(
        (p: any) => p.status === "paid" && p.payment?.type === "payment_intent",
      );
      payment =
        typeof paid?.payment.payment_intent === "string"
          ? paid.payment.payment_intent
          : paid?.payment.payment_intent?.id;
      start =
        Math.min(
          ...(data.lines?.data ?? []).map(
            (l: any) => l.period?.start ?? Infinity,
          ),
        ) * 1000;
      end =
        Math.max(
          ...(data.lines?.data ?? []).map((l: any) => l.period?.end ?? 0),
        ) * 1000;
      kind = "card";
      if (!payment) throw new Error("PAID_INVOICE_MISSING_PAYMENT");
    }
    if (
      owner &&
      payment &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end! > start!
    ) {
      const refunded = !!(
        await c.query(
          "SELECT 1 FROM billing_refunds WHERE payment_id=$1 AND full_refund",
          [payment],
        )
      ).rowCount;
      const unique = await c.query(
        "INSERT INTO billing_grants(payment_id,owner_id,amount,kind,refunded,starts_at,ends_at) VALUES($1,$2,19900,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING payment_id",
        [payment, owner, kind, refunded, new Date(start!), new Date(end!)],
      );
      if (unique.rowCount && !refunded) await rebuildEntitlement(c, owner);
    }
    if (
      event.type === "charge.refunded" &&
      typeof data.payment_intent === "string"
    ) {
      const full = data.refunded === true;
      await c.query(
        "INSERT INTO billing_refunds VALUES($1,$2,$3) ON CONFLICT(payment_id) DO UPDATE SET amount=greatest(billing_refunds.amount,excluded.amount),full_refund=billing_refunds.full_refund OR excluded.full_refund",
        [data.payment_intent, data.amount_refunded ?? 0, full],
      );
      if (full) {
        const grant = (
          await c.query(
            "UPDATE billing_grants SET refunded=true WHERE payment_id=$1 AND NOT refunded RETURNING owner_id",
            [data.payment_intent],
          )
        ).rows[0];
        if (grant) await rebuildEntitlement(c, grant.owner_id);
      }
    }
  });
}

async function rebuildEntitlement(c: pg.PoolClient, owner: string) {
  const grants = (
    await c.query(
      "SELECT * FROM billing_grants WHERE owner_id=$1 AND NOT refunded ORDER BY received_at,payment_id",
      [owner],
    )
  ).rows;
  let expiry: number | null = null;
  for (const grant of grants) {
    let end = new Date(grant.ends_at).getTime();
    if (grant.kind === "promptpay") {
      // Each surviving purchase contributes 30 days from purchase or previous expiry.
      // Removing an earlier purchase must also remove its extension of later purchases.
      const start = Math.max(
        new Date(grant.received_at).getTime(),
        expiry ?? 0,
      );
      end = start + 30 * 86400000;
      await c.query(
        "UPDATE billing_grants SET starts_at=$2,ends_at=$3 WHERE payment_id=$1",
        [grant.payment_id, new Date(start), new Date(end)],
      );
    }
    expiry = Math.max(expiry ?? 0, end);
  }
  await c.query("UPDATE entitlements SET pro_until=$2 WHERE owner_id=$1", [
    owner,
    expiry === null ? null : new Date(expiry),
  ]);
}

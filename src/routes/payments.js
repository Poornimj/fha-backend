import express from "express";
import { config } from "../config.js";
import { pool } from "../db.js";
import { optionalAuth } from "../middleware/auth.js";
import { asyncRoute, text, uuid } from "../lib/http.js";
import { checkoutUrls, getStripe, toMinorUnits } from "../services/stripe.js";

const router = express.Router();

function owns(row, user, suppliedEmail) {
  return (user && row.user_id === user.id)
    || (!row.user_id && suppliedEmail && row.email.toLowerCase() === suppliedEmail.toLowerCase());
}

async function paymentSource(kind, referenceId) {
  if (kind === "order") {
    const result = await pool.query(`SELECT o.*,
      COALESCE(json_agg(json_build_object('name',oi.product_name,'quantity',oi.quantity,'unit_price',oi.unit_price) ORDER BY oi.product_name),'[]') items
      FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.id=$1 GROUP BY o.id`, [referenceId]);
    const row = result.rows[0];
    if (!row) return null;
    const lines = row.items.map((item) => ({
      price_data: { currency: row.currency.trim().toLowerCase(), product_data: { name: item.name }, unit_amount: toMinorUnits(item.unit_price) },
      quantity: item.quantity,
    }));
    if (Number(row.shipping_amount) > 0) lines.push({
      price_data: { currency: row.currency.trim().toLowerCase(), product_data: { name: "Delivery" }, unit_amount: toMinorUnits(row.shipping_amount) }, quantity: 1,
    });
    return { row, lines, label: `Order ${row.order_number}`, paymentColumn: "order_id" };
  }
  if (kind === "workshop_booking") {
    const result = await pool.query(`SELECT b.*,w.title FROM workshop_bookings b
      JOIN workshop_sessions s ON s.id=b.session_id JOIN workshops w ON w.id=s.workshop_id WHERE b.id=$1`, [referenceId]);
    const row = result.rows[0];
    if (!row) return null;
    return { row, lines: [{ price_data: { currency: row.currency.trim().toLowerCase(), product_data: { name: row.title }, unit_amount: toMinorUnits(row.total) }, quantity: 1 }], label: row.title, paymentColumn: "workshop_booking_id" };
  }
  if (kind === "workshop_request") {
    const result = await pool.query(`SELECT wr.*,w.title,w.currency,(w.default_price*wr.participant_count) total
      FROM workshop_requests wr JOIN workshops w ON w.id=wr.workshop_id WHERE wr.id=$1`, [referenceId]);
    const row = result.rows[0];
    if (!row) return null;
    if (row.status !== "APPROVED") throw Object.assign(new Error("This workshop request must be approved before payment."), { status: 409 });
    return { row, lines: [{ price_data: { currency: row.currency.trim().toLowerCase(), product_data: { name: row.title }, unit_amount: toMinorUnits(row.total) }, quantity: 1 }], label: row.title, paymentColumn: "workshop_request_id" };
  }
  throw Object.assign(new Error("Unsupported payment type."), { status: 400 });
}

router.post("/checkout-session", optionalAuth, asyncRoute(async (req, res) => {
  const kind = text(req.body.kind, "Payment type", { required: true, max: 40 });
  const referenceId = uuid(req.body.referenceId, "Reference ID");
  const source = await paymentSource(kind, referenceId);
  if (!source) return res.status(404).json({ message: "Payment reference not found." });
  if (!owns(source.row, req.user, String(req.body.email || ""))) return res.status(403).json({ message: "You cannot pay this reference." });
  if (source.row.payment_status === "PAID") return res.status(409).json({ message: "This reference is already paid." });
  if (["CANCELLED", "REFUNDED"].includes(source.row.status)) return res.status(409).json({ message: "This reference can no longer be paid." });

  const amount = Number(source.row.total);
  if (!(amount > 0)) return res.status(409).json({ message: "The payment amount is not valid." });
  const payment = await pool.query(`INSERT INTO payments(${source.paymentColumn},provider,method_type,amount,currency,status,updated_at)
    VALUES($1,'stripe','checkout',$2,$3,'PENDING',now()) RETURNING id`, [referenceId, amount, source.row.currency]);
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: source.lines,
    customer_email: source.row.email,
    client_reference_id: referenceId,
    metadata: { payment_id: payment.rows[0].id, payment_kind: kind, reference_id: referenceId },
    payment_intent_data: { metadata: { payment_id: payment.rows[0].id, payment_kind: kind, reference_id: referenceId } },
    ...checkoutUrls(),
  }, { idempotencyKey: `happy-drops-${kind}-${referenceId}-${payment.rows[0].id}` });
  await pool.query("UPDATE payments SET provider_transaction_id=$1,stripe_checkout_session_id=$1,updated_at=now() WHERE id=$2", [session.id, payment.rows[0].id]);
  res.status(201).json({ sessionId: session.id, url: session.url });
}));

router.get("/checkout-session/:id", asyncRoute(async (req, res) => {
  const session = await getStripe().checkout.sessions.retrieve(req.params.id);
  res.json({ payment: { status: session.payment_status, referenceId: session.client_reference_id } });
}));

async function markPaid(client, session) {
  if (session.payment_status !== "paid") return;
  const paymentId = session.metadata?.payment_id;
  if (!paymentId) return;
  const payment = await client.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [paymentId]);
  if (!payment.rows[0] || payment.rows[0].status === "PAID") return;
  await client.query(`UPDATE payments SET status='PAID',paid_at=now(),stripe_payment_intent_id=$1,method_type=COALESCE($2,method_type),updated_at=now() WHERE id=$3`,
    [typeof session.payment_intent === "string" ? session.payment_intent : null, session.payment_method_types?.[0] || null, paymentId]);
  if (payment.rows[0].order_id) {
    await client.query("UPDATE orders SET status='CONFIRMED',payment_status='PAID',updated_at=now() WHERE id=$1", [payment.rows[0].order_id]);
    await client.query("INSERT INTO order_status_history(order_id,status,note) VALUES($1,'CONFIRMED','Stripe payment confirmed')", [payment.rows[0].order_id]);
  }
  if (payment.rows[0].workshop_booking_id) await client.query("UPDATE workshop_bookings SET status='CONFIRMED',payment_status='PAID',updated_at=now() WHERE id=$1", [payment.rows[0].workshop_booking_id]);
  if (payment.rows[0].workshop_request_id) await client.query("UPDATE workshop_requests SET payment_status='PAID',updated_at=now() WHERE id=$1", [payment.rows[0].workshop_request_id]);
}

async function cancelExpired(client, session) {
  const paymentId = session.metadata?.payment_id;
  if (!paymentId) return;
  const payment = await client.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [paymentId]);
  const row = payment.rows[0];
  if (!row || row.status !== "PENDING") return;
  await client.query("UPDATE payments SET status='CANCELLED',failure_message='Stripe Checkout session expired',updated_at=now() WHERE id=$1", [paymentId]);
  if (row.order_id) {
    const order = await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [row.order_id]);
    if (order.rows[0]?.status === "PENDING" && order.rows[0]?.payment_status === "PENDING") {
      const items = await client.query("SELECT product_id,quantity FROM order_items WHERE order_id=$1 AND product_id IS NOT NULL", [row.order_id]);
      for (const item of items.rows) {
        await client.query("UPDATE products SET stock_quantity=stock_quantity+$1,updated_at=now() WHERE id=$2", [item.quantity, item.product_id]);
        await client.query("INSERT INTO inventory_transactions(product_id,quantity,reason,reference,notes) VALUES($1,$2,'RETURN',$3,'Stripe Checkout session expired')", [item.product_id, item.quantity, order.rows[0].order_number]);
      }
      await client.query("UPDATE orders SET status='CANCELLED',payment_status='CANCELLED',updated_at=now() WHERE id=$1", [row.order_id]);
      await client.query("INSERT INTO order_status_history(order_id,status,note) VALUES($1,'CANCELLED','Stripe Checkout session expired; reserved stock released')", [row.order_id]);
    }
  }
  if (row.workshop_booking_id) await client.query("UPDATE workshop_bookings SET status='CANCELLED',payment_status='CANCELLED',updated_at=now() WHERE id=$1 AND payment_status='PENDING'", [row.workshop_booking_id]);
  if (row.workshop_request_id) await client.query("UPDATE workshop_requests SET payment_status='CANCELLED',updated_at=now() WHERE id=$1 AND payment_status='PENDING'", [row.workshop_request_id]);
}

export const stripeWebhook = asyncRoute(async (req, res) => {
  if (!config.stripe.webhookSecret) return res.status(503).json({ message: "Stripe webhook is not configured." });
  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, req.get("stripe-signature"), config.stripe.webhookSecret);
  } catch {
    return res.status(400).json({ message: "Invalid Stripe webhook signature." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query("INSERT INTO stripe_webhook_events(event_id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_id", [event.id, event.type]);
    if (inserted.rowCount && ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) await markPaid(client, event.data.object);
    if (inserted.rowCount && event.type === "checkout.session.expired") await cancelExpired(client, event.data.object);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  res.json({ received: true });
});

export default router;

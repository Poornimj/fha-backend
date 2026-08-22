import Stripe from "stripe";
import { config } from "../config.js";

let client;

export function getStripe() {
  if (!config.stripe.secretKey) {
    const error = new Error("Online payments are not configured yet.");
    error.status = 503;
    throw error;
  }
  client ||= new Stripe(config.stripe.secretKey);
  return client;
}

export function toMinorUnits(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid payment amount.");
  return Math.round((amount + Number.EPSILON) * 100);
}

export function checkoutUrls() {
  const base = config.frontendUrl.replace(/\/$/, "");
  return {
    success_url: `${base}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/payment/cancelled`,
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { checkoutUrls, toMinorUnits } from "../src/services/stripe.js";

test("converts euro amounts to Stripe minor units without float drift", () => {
  assert.equal(toMinorUnits(19.9), 1990);
  assert.equal(toMinorUnits("65.00"), 6500);
});

test("rejects invalid or negative payment amounts", () => {
  assert.throws(() => toMinorUnits(-1), /Invalid payment amount/);
  assert.throws(() => toMinorUnits("not-a-number"), /Invalid payment amount/);
});

test("checkout redirects never contain a secret", () => {
  const urls = checkoutUrls();
  assert.match(urls.success_url, /payment\/success\?session_id=\{CHECKOUT_SESSION_ID\}$/);
  assert.match(urls.cancel_url, /payment\/cancelled$/);
});

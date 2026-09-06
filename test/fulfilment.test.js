import assert from "node:assert/strict";
import test from "node:test";
import { calculateShipping, normalizeFulfilmentMethod } from "../src/lib/fulfilment.js";

test("delivery and pickup shipping rules", () => {
  assert.equal(calculateShipping(40, "DELIVERY"), 5.9);
  assert.equal(calculateShipping(40, "PICKUP"), 0);
  assert.equal(calculateShipping(60, "DELIVERY"), 0);
  assert.equal(calculateShipping(60, "PICKUP"), 0);
  assert.equal(calculateShipping(40, "PICKUP"), 0);
  assert.equal(calculateShipping(40, "DELIVERY"), 5.9);
});

test("fulfilment method defaults and validation", () => {
  assert.equal(normalizeFulfilmentMethod(), "DELIVERY");
  assert.equal(normalizeFulfilmentMethod("pickup"), "PICKUP");
  assert.throws(() => normalizeFulfilmentMethod("COURIER"), /DELIVERY or PICKUP/);
});

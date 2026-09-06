export const FULFILMENT_METHODS = ["DELIVERY", "PICKUP"];

export function normalizeFulfilmentMethod(value) {
  const method = String(value || "DELIVERY").trim().toUpperCase();
  if (!FULFILMENT_METHODS.includes(method)) {
    throw Object.assign(new Error("Delivery method must be DELIVERY or PICKUP."), { status: 400 });
  }
  return method;
}

export function calculateShipping(subtotal, fulfilmentMethod) {
  return fulfilmentMethod === "PICKUP" ? 0 : subtotal >= 50 ? 0 : 5.9;
}

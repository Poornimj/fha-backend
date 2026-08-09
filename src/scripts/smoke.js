import crypto from "node:crypto";
import { pool } from "../db.js";

const base = process.env.API_BASE_URL || "http://127.0.0.1:4000";
const marker = crypto.randomBytes(5).toString("hex");
const email = `smoke-${marker}@example.test`;
const supplierEmail = `supplier-${marker}@example.test`;

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${body.message || ""}`);
  return body;
}

let token;
try {
  const signup = await request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email, password: "SmokeTest!234", firstName: "Smoke", familyName: "Test", dateOfBirth: "1990-01-15",
      familyMembers: [{ firstName: "Family", familyName: "Test", relationship: "Child", dateOfBirth: "2015-05-10", wellnessNotes: "Smoke family profile", guardianConfirmed: true }],
    }),
  });
  token = signup.token;
  const auth = { Authorization: `Bearer ${token}` };
  await request("/api/auth/me", { headers: auth });
  const family = await request("/api/account/family-members", { headers: auth });
  const familyMember = family.familyMembers[0];
  if (!familyMember || familyMember.first_name !== "Family") throw new Error("Family member registration persistence failed.");
  await request(`/api/account/family-members/${familyMember.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ firstName: "Family", familyName: "Test", relationship: "Child", dateOfBirth: "2015-05-10", wellnessNotes: "Updated smoke family profile", guardianConfirmed: true }) });
  const extraFamily = await request("/api/account/family-members", { method: "POST", headers: auth, body: JSON.stringify({ firstName: "Adult", familyName: "Test", relationship: "Sibling", dateOfBirth: "1988-08-08", wellnessNotes: "No current concerns", guardianConfirmed: false }) });
  await request(`/api/account/family-members/${extraFamily.familyMember.id}`, { method: "DELETE", headers: auth });
  const updatedAccount = await request("/api/auth/me", { method: "PATCH", headers: auth, body: JSON.stringify({ phone: "+358 40 000 0000", preferredLanguage: "English" }) });
  if (updatedAccount.user.phone !== "+358 40 000 0000") throw new Error("Personal details update failed.");
  const createdWish = await request("/api/account/happy-wishes", { method: "POST", headers: auth, body: JSON.stringify({ title: "A joyful family celebration", wishType: "FAMILY", description: "Bring our family together for a meaningful celebration filled with shared memories and wellbeing.", targetDate: "2027-06-01", importance: 5, firstStep: "Choose a date and ask the family which experience would feel most meaningful." }) });
  if (!createdWish.wish?.momentum_score) throw new Error("Happy Wish score generation failed.");
  await request(`/api/account/happy-wishes/${createdWish.wish.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "A joyful family celebration", wishType: "FAMILY", description: "Bring our family together for a meaningful celebration filled with shared memories and wellbeing.", targetDate: "2027-06-01", importance: 5, firstStep: "Choose a date and ask the family which experience would feel most meaningful.", status: "ACHIEVED" }) });
  const wishes = await request("/api/account/happy-wishes", { headers: auth });
  if (!wishes.wishes.some((wish) => wish.id === createdWish.wish.id && wish.status === "ACHIEVED")) throw new Error("Happy Wish persistence failed.");
  await request(`/api/account/happy-wishes/${createdWish.wish.id}`, { method: "DELETE", headers: auth });
  const { products } = await request("/api/products?search=Dew");
  const product = products.find((item) => item.name === "Dew");
  await request("/api/account/wellness-profile", {
    method: "PUT", headers: auth,
    body: JSON.stringify({
      currentSymptoms: "Smoke test symptom",
      symptomsDuration: "One week",
      symptomsFrequency: "Occasionally",
      takesMedication: false,
      wellnessGoals: "Verify profile persistence",
      consentGiven: true,
    }),
  });
  const wellnessProfile = await request("/api/account/wellness-profile", { headers: auth });
  if (!wellnessProfile.wellnessProfile) throw new Error("Wellness profile persistence failed.");
  const favoriteResult = await request("/api/account/favorites", {
    method: "POST", headers: auth, body: JSON.stringify({ productId: product.id }),
  });
  const favorites = await request("/api/account/favorites", { headers: auth });
  if (!favorites.favorites.some((favorite) => favorite.product_id === product.id)) {
    throw new Error("Wishlist persistence failed.");
  }
  if (favoriteResult.favorite) {
    await request(`/api/account/favorites/${favoriteResult.favorite.id}`, { method: "DELETE", headers: auth });
  }
  const cart = await request("/api/cart/items", {
    method: "POST", headers: auth, body: JSON.stringify({ productId: product.id, quantity: 1 }),
  });
  if (cart.cart.items.length !== 1) throw new Error("Cart persistence failed.");
  await request("/api/assessments", {
    method: "POST", headers: auth,
    body: JSON.stringify({ consentGiven: true, overallScore: 4, categoryScores: { rest: 4 }, recommendations: [], answers: [{ questionKey: "rest-1", categoryKey: "rest", answer: 4, score: 4 }] }),
  });
  const submittedQuestion = await request("/api/knowledge/questions", {
    method: "POST", headers: auth,
    body: JSON.stringify({ topic: "Smoke test", question: "Which wellness routine supports restful sleep?" }),
  });
  const knowledge = await request("/api/knowledge/questions", { headers: auth });
  if (!knowledge.questions.some((question) => question.id === submittedQuestion.question.id)) {
    throw new Error("Knowledge question persistence failed.");
  }
  const workshopCatalog = await request("/api/workshops");
  const workshop = workshopCatalog.workshops[0];
  if (!workshop) throw new Error("Workshop catalog is empty.");
  const forbiddenWorkshopEdit = await fetch(`${base}/api/admin/workshops/${workshop.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ theme: "Unauthorized edit" }),
  });
  if (forbiddenWorkshopEdit.status !== 403) throw new Error("Workshop admin authorization failed.");
  await request("/api/workshops/requests", {
    method: "POST", headers: auth,
    body: JSON.stringify({
      workshopId: workshop.id,
      fullName: "Smoke Test",
      email,
      preferredDate: "2026-08-25",
      preferredTime: "1:00 PM - 3:00 PM",
      location: "Happy Drops Studio, Helsinki",
      participantCount: 2,
      purpose: "Workshop integration test",
    }),
  });
  const ownWorkshopRequests = await request("/api/workshops/requests/me", { headers: auth });
  if (!ownWorkshopRequests.requests.some((item) => item.email === email)) {
    throw new Error("Customer workshop history failed.");
  }
  const forbiddenParticipantList = await fetch(`${base}/api/admin/workshops/requests`, { headers: auth });
  if (forbiddenParticipantList.status !== 403) throw new Error("Workshop participant privacy failed.");
  await request("/api/suppliers", {
    method: "POST",
    body: JSON.stringify({ companyName: `Smoke ${marker}`, contactName: "Smoke Test", email: supplierEmail, address: "Test address", supplierType: "nutrition-supplier", offering: "Test offering", documents: [{ type: "quality-certificate", name: "test.pdf", dataUrl: "data:application/pdf;base64,JVBERi0xLjQK" }], consentGiven: true }),
  });
  const forbiddenSuppliers = await fetch(`${base}/api/admin/suppliers`, { headers: auth });
  if (forbiddenSuppliers.status !== 403) throw new Error("Supplier admin privacy failed.");
  const created = await request("/api/orders", {
    method: "POST",
    headers: { ...auth, "Idempotency-Key": `smoke-${marker}` },
    body: JSON.stringify({ email, paymentMethod: "card", billingAddress: { fullName: "Smoke Test" }, items: [{ productId: product.id, quantity: 1 }] }),
  });
  await request(`/api/orders/track/${created.order.order_number}?email=${encodeURIComponent(email)}`);
  const reset = await request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
  if (reset.resetToken) await request("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token: reset.resetToken, password: "SmokeTest!567" }) });
  console.log("Smoke test passed: auth, personal details, family profiles, Happy Wishes, catalog, cart, assessment, knowledge, workshop, supplier, order, tracking, password reset.");
} finally {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orders = await client.query("SELECT id,order_number FROM orders WHERE email=$1", [email]);
    for (const order of orders.rows) {
      const items = await client.query("SELECT product_id,quantity FROM order_items WHERE order_id=$1", [order.id]);
      for (const item of items.rows) await client.query("UPDATE products SET stock_quantity=stock_quantity+$1 WHERE id=$2", [item.quantity, item.product_id]);
      await client.query("DELETE FROM inventory_transactions WHERE reference=$1", [order.order_number]);
      await client.query("DELETE FROM orders WHERE id=$1", [order.id]);
    }
    await client.query("DELETE FROM supplier_applications WHERE email=$1", [supplierEmail]);
    await client.query("DELETE FROM workshop_requests WHERE email=$1", [email]);
    await client.query("DELETE FROM users WHERE email=$1", [email]);
    await client.query("DELETE FROM idempotency_keys WHERE key=$1", [`smoke-${marker}`]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

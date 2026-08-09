import crypto from "node:crypto";
import express from "express";
import { pool } from "../db.js";
import { optionalAuth } from "../middleware/auth.js";
import { asyncRoute, integer, uuid } from "../lib/http.js";

const router = express.Router();
router.use(optionalAuth);

async function getCart(req, create = true) {
  const sessionId = String(req.get("x-cart-session") || "").trim() || crypto.randomUUID();
  let result = req.user
    ? await pool.query("SELECT id FROM carts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1", [req.user.id])
    : await pool.query("SELECT id FROM carts WHERE session_id=$1 AND (expires_at IS NULL OR expires_at>now())", [sessionId]);
  if (!result.rows[0] && create) result = await pool.query(
    `INSERT INTO carts(user_id,session_id,expires_at,updated_at) VALUES($1,$2,now()+interval '30 days',now()) RETURNING id`,
    [req.user?.id || null, req.user ? null : sessionId],
  );
  return { id: result.rows[0]?.id, sessionId };
}
async function serialize(cart) {
  const result = await pool.query(
    `SELECT ci.id,ci.quantity,p.id product_id,p.name,p.slug,p.sku,p.price,p.currency,p.stock_quantity,
      (SELECT url FROM product_images WHERE product_id=p.id ORDER BY is_primary DESC,sort_order LIMIT 1) image_url
     FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.cart_id=$1 ORDER BY ci.created_at`, [cart.id]);
  const subtotal = result.rows.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  return { id: cart.id, sessionId: cart.sessionId, items: result.rows, subtotal: subtotal.toFixed(2), currency: result.rows[0]?.currency?.trim() || "EUR" };
}
router.get("/", asyncRoute(async (req,res) => res.json({ cart: await serialize(await getCart(req)) })));
router.post("/items", asyncRoute(async (req,res) => {
  const cart=await getCart(req); const productId=uuid(req.body.productId,"Product ID"); const quantity=integer(req.body.quantity,"Quantity",{min:1,max:99,required:true});
  const product=await pool.query("SELECT stock_quantity,status FROM products WHERE id=$1",[productId]);
  if(!product.rows[0]||product.rows[0].status!=="ACTIVE") return res.status(404).json({message:"Product not found."});
  if(quantity>product.rows[0].stock_quantity) return res.status(409).json({message:"Requested quantity is not available."});
  await pool.query(`INSERT INTO cart_items(cart_id,product_id,quantity,updated_at) VALUES($1,$2,$3,now())
    ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=LEAST(99,cart_items.quantity+EXCLUDED.quantity),updated_at=now()`,[cart.id,productId,quantity]);
  res.status(201).json({cart:await serialize(cart)});
}));
router.patch("/items/:id", asyncRoute(async(req,res)=>{
  const cart=await getCart(req); const quantity=integer(req.body.quantity,"Quantity",{min:1,max:99,required:true});
  const available=await pool.query(`SELECT p.stock_quantity FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.id=$1 AND ci.cart_id=$2`,[uuid(req.params.id),cart.id]);
  if(!available.rows[0]) return res.status(404).json({message:"Cart item not found."});
  if(quantity>available.rows[0].stock_quantity) return res.status(409).json({message:"Requested quantity is not available."});
  const result=await pool.query("UPDATE cart_items SET quantity=$1,updated_at=now() WHERE id=$2 AND cart_id=$3 RETURNING id",[quantity,uuid(req.params.id),cart.id]);
  if(!result.rows[0]) return res.status(404).json({message:"Cart item not found."}); res.json({cart:await serialize(cart)});
}));
router.delete("/items/:id", asyncRoute(async(req,res)=>{const cart=await getCart(req);await pool.query("DELETE FROM cart_items WHERE id=$1 AND cart_id=$2",[uuid(req.params.id),cart.id]);res.json({cart:await serialize(cart)});}));
router.delete("/",asyncRoute(async(req,res)=>{const cart=await getCart(req);await pool.query("DELETE FROM cart_items WHERE cart_id=$1",[cart.id]);res.status(204).end();}));
export default router;

import express from "express";
import { pool } from "../db.js";
import { asyncRoute, uuid } from "../lib/http.js";

const router = express.Router();
const productSelect = `
 SELECT p.*, c.name category_name, c.slug category_slug,
   COALESCE((SELECT json_agg(json_build_object('id',i.id,'url',i.url,'altText',i.alt_text,'isPrimary',i.is_primary,'sortOrder',i.sort_order) ORDER BY i.sort_order) FROM product_images i WHERE i.product_id=p.id),'[]') images,
   COALESCE((SELECT json_agg(json_build_object('id',v.id,'name',v.name,'sku',v.sku,'price',v.price,'stockQuantity',v.stock_quantity) ORDER BY v.name) FROM product_variants v WHERE v.product_id=p.id AND v.is_active),'[]') variants
 FROM products p LEFT JOIN categories c ON c.id=p.category_id`;

router.get("/categories", asyncRoute(async (_req, res) => {
  const result = await pool.query(`SELECT id,name,slug,description FROM categories WHERE status='ACTIVE' ORDER BY name`);
  res.json({ categories: result.rows });
}));

router.get("/products", asyncRoute(async (req, res) => {
  const values = [];
  const where = [`p.status='ACTIVE'`];
  if (req.query.category) { values.push(req.query.category); where.push(`c.slug=$${values.length}`); }
  if (req.query.search) { values.push(`%${String(req.query.search).trim()}%`); where.push(`(p.name ILIKE $${values.length} OR p.description ILIKE $${values.length})`); }
  if (req.query.featured === "true") where.push("p.featured=true");
  const result = await pool.query(`${productSelect} WHERE ${where.join(" AND ")} ORDER BY p.featured DESC,p.name`, values);
  res.json({ products: result.rows });
}));

router.get("/products/:identifier", asyncRoute(async (req, res) => {
  const identifier = req.params.identifier;
  const result = await pool.query(`${productSelect} WHERE p.status='ACTIVE' AND (p.slug=$1 OR p.id::text=$1)`, [identifier]);
  if (!result.rows[0]) return res.status(404).json({ message: "Product not found." });
  res.json({ product: result.rows[0] });
}));

router.get("/articles", asyncRoute(async (_req, res) => {
  const result = await pool.query(`SELECT id,title,slug,category,summary,content,image_url,author_name,published_at FROM knowledge_articles WHERE status='ACTIVE' ORDER BY published_at DESC NULLS LAST`);
  res.json({ articles: result.rows });
}));

router.get("/articles/:slug", asyncRoute(async (req, res) => {
  const result = await pool.query(`SELECT id,title,slug,category,summary,content,image_url,author_name,published_at FROM knowledge_articles WHERE slug=$1 AND status='ACTIVE'`, [req.params.slug]);
  if (!result.rows[0]) return res.status(404).json({ message: "Article not found." });
  res.json({ article: result.rows[0] });
}));

export default router;

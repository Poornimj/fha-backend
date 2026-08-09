SET search_path TO public;

WITH items(name,slug,sku,summary,price) AS (VALUES
  ('Kombucha','kombucha','HD-FOOD-105','Refreshing fermented tea, 330 ml',5.00),
  ('Kefir','kefir','HD-FOOD-106','Naturally fermented milk drink, 500 ml',6.50)
)
INSERT INTO products(
  category_id,name,slug,sku,short_description,description,price,
  stock_quantity,featured,status,updated_at
)
SELECT
  c.id,i.name,i.slug,i.sku,i.summary,i.summary,i.price,
  100,false,'ACTIVE',now()
FROM items i
JOIN categories c ON c.slug='food-nutrition'
ON CONFLICT(slug) DO UPDATE SET
  category_id=EXCLUDED.category_id,
  name=EXCLUDED.name,
  sku=EXCLUDED.sku,
  short_description=EXCLUDED.short_description,
  description=EXCLUDED.description,
  price=EXCLUDED.price,
  status='ACTIVE',
  updated_at=now();

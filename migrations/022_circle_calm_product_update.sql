SET search_path TO public;

UPDATE products
SET
  name = 'Circle Calm',
  short_description = 'Circle Calm is designed for quiet self-care moments and a peaceful atmosphere. It brings a soft, soothing feel to your everyday routine.',
  description = 'Circle Calm is designed for quiet self-care moments and a peaceful atmosphere. It brings a soft, soothing feel to your everyday routine.',
  updated_at = now()
WHERE slug = 'flexibility';

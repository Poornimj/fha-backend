SET search_path TO public;

ALTER TABLE personalized_recipes
  ADD COLUMN IF NOT EXISTS price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','refunded')),
  ADD COLUMN IF NOT EXISTS preparation_status TEXT NOT NULL DEFAULT 'recipe_ready'
    CHECK (preparation_status IN ('recipe_ready','paid','preparing','ready','collected')),
  ADD COLUMN IF NOT EXISTS pickup_location TEXT,
  ADD COLUMN IF NOT EXISTS pickup_date DATE,
  ADD COLUMN IF NOT EXISTS pickup_time TIME,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

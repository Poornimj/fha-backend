SET search_path TO public;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'assessment_answers','assessment_submissions','audit_logs','cart_items','carts',
    'categories','contact_messages','email_verification_tokens','favorites',
    'inventory_transactions','knowledge_articles','newsletter_subscribers',
    'order_items','orders','password_reset_tokens','payments','product_images',
    'product_variants','products','refresh_tokens','supplier_applications',
    'supplier_documents','user_addresses','workshop_bookings','workshop_requests',
    'workshop_sessions','workshops'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT gen_random_uuid()', table_name);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
);

CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at_idx ON idempotency_keys(expires_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'assessment_submissions','carts','cart_items','categories','knowledge_articles',
    'orders','payments','products','supplier_applications','user_addresses',
    'workshop_bookings','workshop_requests','workshops'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      table_name, table_name
    );
  END LOOP;
END $$;

ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_quantity_check;
ALTER TABLE cart_items ADD CONSTRAINT cart_items_quantity_check CHECK (quantity > 0 AND quantity <= 99);
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_price_stock_check;
ALTER TABLE products ADD CONSTRAINT products_price_stock_check CHECK (price >= 0 AND stock_quantity >= 0);
ALTER TABLE workshop_bookings DROP CONSTRAINT IF EXISTS workshop_bookings_participant_count_check;
ALTER TABLE workshop_bookings ADD CONSTRAINT workshop_bookings_participant_count_check CHECK (participant_count > 0);

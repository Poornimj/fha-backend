ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS workshop_request_id uuid REFERENCES workshop_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id varchar(255),
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id varchar(255),
  ADD COLUMN IF NOT EXISTS failure_message text;

ALTER TABLE workshop_requests
  ADD COLUMN IF NOT EXISTS payment_status "PaymentStatus" NOT NULL DEFAULT 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_checkout_session_key
  ON payments(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_payment_intent_key
  ON payments(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id varchar(255) PRIMARY KEY,
  event_type varchar(120) NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

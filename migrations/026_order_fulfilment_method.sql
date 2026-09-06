ALTER TABLE orders
  ADD COLUMN fulfilment_method VARCHAR(20) NOT NULL DEFAULT 'DELIVERY';

ALTER TABLE orders
  ADD CONSTRAINT orders_fulfilment_method_check
  CHECK (fulfilment_method IN ('DELIVERY', 'PICKUP'));

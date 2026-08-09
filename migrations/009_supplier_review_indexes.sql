SET search_path TO public;

CREATE INDEX IF NOT EXISTS supplier_applications_email_idx
  ON supplier_applications (lower(email));
CREATE INDEX IF NOT EXISTS supplier_applications_type_status_idx
  ON supplier_applications (supplier_type, status, created_at DESC);

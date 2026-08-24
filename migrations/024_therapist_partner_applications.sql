SET search_path TO public;

CREATE TABLE IF NOT EXISTS therapist_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(320) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  location VARCHAR(250) NOT NULL,
  qualifications TEXT NOT NULL,
  years_experience INTEGER NOT NULL CHECK (years_experience >= 0 AND years_experience <= 80),
  customers_served INTEGER NOT NULL CHECK (customers_served >= 0 AND customers_served <= 100000),
  short_cv TEXT NOT NULL,
  passion TEXT NOT NULL,
  consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  status "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
  admin_notes TEXT,
  created_at TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS therapist_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES therapist_applications(id) ON UPDATE CASCADE ON DELETE CASCADE,
  document_type VARCHAR(80) NOT NULL,
  file_url TEXT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS therapist_applications_status_created_at_idx
  ON therapist_applications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS therapist_applications_email_idx
  ON therapist_applications(lower(email));
CREATE INDEX IF NOT EXISTS therapist_documents_application_id_idx
  ON therapist_documents(application_id);

DROP TRIGGER IF EXISTS therapist_applications_set_updated_at ON therapist_applications;
CREATE TRIGGER therapist_applications_set_updated_at
  BEFORE UPDATE ON therapist_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

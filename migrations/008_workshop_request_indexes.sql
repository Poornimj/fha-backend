SET search_path TO public;

CREATE INDEX IF NOT EXISTS workshop_requests_location_date_idx
  ON workshop_requests (location, preferred_date DESC);
CREATE INDEX IF NOT EXISTS workshop_requests_user_location_idx
  ON workshop_requests (user_id, location);
CREATE INDEX IF NOT EXISTS workshop_requests_status_idx
  ON workshop_requests (status);
CREATE INDEX IF NOT EXISTS workshop_requests_workshop_id_idx
  ON workshop_requests (workshop_id);

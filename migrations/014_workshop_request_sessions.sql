ALTER TABLE workshop_requests
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES workshop_sessions(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workshop_requests_session_id_idx
  ON workshop_requests(session_id);

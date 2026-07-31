CREATE TABLE IF NOT EXISTS wellness_review_cases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reference varchar(40) NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  wellness_profile_id uuid NOT NULL REFERENCES user_wellness_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE,
  profile_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(40) NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN (
      'SUBMITTED', 'UNDER_REVIEW', 'RECIPE_READY', 'PAYMENT_PENDING',
      'PAID', 'IN_PREPARATION', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED'
    )),
  reviewer_id uuid REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  reviewer_message text,
  recipe_title varchar(250),
  recipe_instructions text,
  recipe_ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  safety_notes text,
  price numeric(12,2),
  currency char(3) NOT NULL DEFAULT 'EUR',
  payment_status varchar(40) NOT NULL DEFAULT 'PENDING'
    CHECK (payment_status IN ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')),
  pickup_location text,
  pickup_date date,
  pickup_time time,
  submitted_at timestamp(3) with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp(3) with time zone,
  paid_at timestamp(3) with time zone,
  ready_at timestamp(3) with time zone,
  completed_at timestamp(3) with time zone,
  created_at timestamp(3) with time zone NOT NULL DEFAULT now(),
  updated_at timestamp(3) with time zone NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(recipe_ingredients) = 'array'),
  CHECK (jsonb_typeof(profile_snapshot) = 'object'),
  CHECK (price IS NULL OR price >= 0)
);

CREATE INDEX IF NOT EXISTS wellness_review_cases_user_id_idx
  ON wellness_review_cases(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wellness_review_cases_status_idx
  ON wellness_review_cases(status, created_at DESC);

CREATE TABLE IF NOT EXISTS wellness_review_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES wellness_review_cases(id) ON UPDATE CASCADE ON DELETE CASCADE,
  status varchar(40) NOT NULL,
  message text,
  changed_by uuid REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  visible_to_customer boolean NOT NULL DEFAULT true,
  created_at timestamp(3) with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wellness_review_history_case_id_idx
  ON wellness_review_history(case_id, created_at ASC);

DROP TRIGGER IF EXISTS wellness_review_cases_set_updated_at ON wellness_review_cases;
CREATE TRIGGER wellness_review_cases_set_updated_at
BEFORE UPDATE ON wellness_review_cases
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

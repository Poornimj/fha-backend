CREATE TABLE IF NOT EXISTS user_wellness_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  current_symptoms text NOT NULL,
  symptoms_duration varchar(250) NOT NULL,
  symptoms_frequency varchar(250) NOT NULL,
  takes_medication boolean NOT NULL DEFAULT false,
  medication_details text,
  ongoing_conditions text,
  family_medical_history text,
  treatments_tried text,
  chronic_diseases text,
  wellness_goals text,
  consent_given boolean NOT NULL DEFAULT false,
  created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS user_wellness_profiles_user_id_idx
  ON user_wellness_profiles(user_id);

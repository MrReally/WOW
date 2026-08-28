export const appSettingsMigration = `
CREATE SCHEMA IF NOT EXISTS app_settings;

CREATE TABLE IF NOT EXISTS app_settings.date_time (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  date_format text NOT NULL DEFAULT 'DD.MM.YYYY',
  time_format text NOT NULL DEFAULT '24h',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_settings.date_time (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE app_settings.date_time DROP CONSTRAINT IF EXISTS date_time_date_format_check;
ALTER TABLE app_settings.date_time ADD CONSTRAINT date_time_date_format_check CHECK (
  date_format IN ('DD.MM.YYYY','DD.MM.YY','DD/MM/YYYY','DD/MM/YY','DD-MM-YYYY','DD-MM-YY','DD MMM YYYY','DD MMM YY','D MMM YYYY','D MMM YY','DD MMMM YYYY','D MMMM YYYY','MM/DD/YYYY','MM/DD/YY','MMM DD, YYYY','MMMM DD, YYYY','YYYY-MM-DD','YYYY/MM/DD','YYYY.MM.DD')
);
ALTER TABLE app_settings.date_time DROP CONSTRAINT IF EXISTS date_time_time_format_check;
ALTER TABLE app_settings.date_time ADD CONSTRAINT date_time_time_format_check CHECK (time_format IN ('24h','12h'));

CREATE TABLE IF NOT EXISTS app_settings.dress_code_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_settings.dress_code_options (label, sort_order) VALUES
  ('total black', 10), ('опрятно', 20), ('нет дресс-кода', 30)
ON CONFLICT (label) DO NOTHING;
`;

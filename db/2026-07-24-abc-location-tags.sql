-- Add WMS location tag fields to ABC location master.
ALTER TABLE abc_location_master ADD COLUMN IF NOT EXISTS tag_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE abc_location_master ADD COLUMN IF NOT EXISTS tag_name TEXT;
ALTER TABLE abc_location_master ADD COLUMN IF NOT EXISTS tag_names JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_abc_location_tag_name ON abc_location_master(facility_code, tag_name);

CREATE TABLE IF NOT EXISTS facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_code TEXT UNIQUE NOT NULL,
  facility_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'US',
  timezone TEXT,
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'USER',
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_facility_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  access_role TEXT DEFAULT 'viewer',
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, facility_id)
);

CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
  item_number TEXT NOT NULL,
  item_description TEXT,
  location TEXT,
  lot_number TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  available_quantity NUMERIC NOT NULL DEFAULT 0,
  damaged_quantity NUMERIC NOT NULL DEFAULT 0,
  inventory_status TEXT DEFAULT 'AVAILABLE',
  last_counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
  asset_id TEXT NOT NULL,
  asset_name TEXT,
  asset_type TEXT,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  equipment_status TEXT DEFAULT 'ACTIVE',
  location TEXT,
  put_in_service_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(facility_id, asset_id)
);

CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  work_order_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'MEDIUM',
  status TEXT DEFAULT 'OPEN',
  assigned_to TEXT,
  scheduled_date TIMESTAMPTZ,
  completed_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(facility_id, work_order_number)
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
  task_number TEXT NOT NULL,
  task_type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'MEDIUM',
  status TEXT DEFAULT 'OPEN',
  assigned_to TEXT,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(facility_id, task_number)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID REFERENCES facilities(id) ON DELETE SET NULL,
  user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  previous_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location_tag_requests (
  id TEXT PRIMARY KEY,
  facility_code TEXT NOT NULL,
  payload JSONB NOT NULL,
  requested_by TEXT,
  status TEXT,
  requested_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facilities_code ON facilities(facility_code);
CREATE INDEX IF NOT EXISTS idx_user_facility_access_user ON user_facility_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_facility_access_facility ON user_facility_access(facility_id);
CREATE INDEX IF NOT EXISTS idx_inventory_facility ON inventory(facility_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory(item_number);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location);
CREATE INDEX IF NOT EXISTS idx_equipment_facility ON equipment(facility_id);
CREATE INDEX IF NOT EXISTS idx_equipment_asset_id ON equipment(asset_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_facility ON maintenance_work_orders(facility_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON maintenance_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_tasks_facility ON tasks(facility_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_facility ON audit_log(facility_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ltr_facility ON location_tag_requests(facility_code);
CREATE INDEX IF NOT EXISTS idx_ltr_status ON location_tag_requests(status);

INSERT INTO facilities (facility_code, facility_name, address, city, state, country, timezone, status)
VALUES
  ('LT_F1', 'Valley View', '6800 Valley View St.', 'Buena Park', 'CA', 'US', 'America/Los_Angeles', 'ACTIVE'),
  ('LT_F21', 'Cesanek', NULL, NULL, NULL, 'US', 'America/New_York', 'ACTIVE'),
  ('LT_F34', 'Cotton', NULL, NULL, NULL, 'US', 'America/Phoenix', 'ACTIVE')
ON CONFLICT (facility_code) DO UPDATE SET
  facility_name = EXCLUDED.facility_name,
  timezone = EXCLUDED.timezone,
  status = EXCLUDED.status,
  updated_at = now();

-- Andeco Horizon Suite — full relational schema (single-tenant deploy)

-- ---------------------------------------------------------------------------
-- Auth
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  allowed_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_username_idx ON users (username);

-- ---------------------------------------------------------------------------
-- Accounting
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT '',
  company_address TEXT NOT NULL DEFAULT '',
  company_email TEXT NOT NULL DEFAULT '',
  company_phone TEXT NOT NULL DEFAULT '',
  company_tax_id TEXT NOT NULL DEFAULT '',
  company_registration TEXT NOT NULL DEFAULT '',
  company_website TEXT NOT NULL DEFAULT '',
  logo TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'EUR',
  invoice_sequence_number INTEGER NOT NULL DEFAULT 1000,
  receipt_sequence_number INTEGER NOT NULL DEFAULT 1000,
  payment_order_sequence_number INTEGER NOT NULL DEFAULT 1000,
  proforma_sequence_number INTEGER NOT NULL DEFAULT 1000,
  default_tax_rate NUMERIC NOT NULL DEFAULT 0,
  default_payment_terms INTEGER NOT NULL DEFAULT 30,
  default_invoice_notes TEXT NOT NULL DEFAULT '',
  document_logos JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS payment_order_sequence_number INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS proforma_sequence_number INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS document_logos JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS subcontractors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  bank_iban TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  subcontractor_id TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payment_orders_subcontractor_id_idx ON payment_orders (subcontractor_id);

CREATE TABLE IF NOT EXISTS company_banks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  swift TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC NOT NULL DEFAULT 0,
  is_service BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  client_customer_id TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  client_address TEXT NOT NULL DEFAULT '',
  client_email TEXT NOT NULL DEFAULT '',
  client_phone TEXT NOT NULL DEFAULT '',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  document_type TEXT NOT NULL DEFAULT 'invoice',
  converted_to_invoice_id TEXT NOT NULL DEFAULT '',
  source_proforma_id TEXT NOT NULL DEFAULT '',
  item_columns JSONB NOT NULL DEFAULT '{"qty":true,"persons":false,"hours":true}'::jsonb,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGSERIAL PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_header BOOLEAN NOT NULL DEFAULT false,
  product_code TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC,
  persons NUMERIC,
  hours NUMERIC,
  price NUMERIC,
  service_date TEXT NOT NULL DEFAULT '',
  service_start TEXT NOT NULL DEFAULT '',
  service_end TEXT NOT NULL DEFAULT '',
  is_service BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON invoice_items (invoice_id);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS item_columns JSONB NOT NULL DEFAULT '{"qty":true,"persons":false,"hours":true}'::jsonb;
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'invoice';
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS converted_to_invoice_id TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS source_proforma_id TEXT NOT NULL DEFAULT '';
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS persons NUMERIC;
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS service_date TEXT NOT NULL DEFAULT '';
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS service_start TEXT NOT NULL DEFAULT '';
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS service_end TEXT NOT NULL DEFAULT '';
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  client_id TEXT NOT NULL DEFAULT '',
  on_account_balance BOOLEAN NOT NULL DEFAULT false,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS receipt_invoices (
  receipt_id TEXT NOT NULL REFERENCES receipts (id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL,
  PRIMARY KEY (receipt_id, invoice_id)
);

-- ---------------------------------------------------------------------------
-- Fleet
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vessels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  imo TEXT NOT NULL DEFAULT '',
  flag TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  build_year TEXT NOT NULL DEFAULT '',
  gross_tonnage TEXT NOT NULL DEFAULT '',
  length TEXT NOT NULL DEFAULT '',
  beam TEXT NOT NULL DEFAULT '',
  draft TEXT NOT NULL DEFAULT '',
  classification TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  manager TEXT NOT NULL DEFAULT '',
  call_sign TEXT NOT NULL DEFAULT '',
  mmsi TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  specs JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS vessel_photos (
  id TEXT PRIMARY KEY,
  vessel_id TEXT NOT NULL DEFAULT '',
  data_url TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vessel_documents (
  id TEXT PRIMARY KEY,
  vessel_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL DEFAULT '',
  expiry_date TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vessel_maintenance (
  id TEXT PRIMARY KEY,
  vessel_id TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vessel_drydock (
  id TEXT PRIMARY KEY,
  vessel_id TEXT NOT NULL DEFAULT '',
  scheduled_date TEXT NOT NULL DEFAULT '',
  completed_date TEXT NOT NULL DEFAULT '',
  yard TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vessel_inventory (
  id TEXT PRIMARY KEY,
  vessel_id TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL DEFAULT '',
  part_number TEXT NOT NULL DEFAULT '',
  quantity TEXT NOT NULL DEFAULT '',
  min_level TEXT NOT NULL DEFAULT '',
  max_level TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  supplier TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vessel_logbooks (
  id TEXT PRIMARY KEY,
  vessel_id TEXT NOT NULL DEFAULT '',
  log_date TEXT NOT NULL DEFAULT '',
  log_type TEXT NOT NULL DEFAULT '',
  entry TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vessel_crew_legacy (
  id TEXT PRIMARY KEY,
  vessel_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  certifications TEXT NOT NULL DEFAULT '',
  joining_date TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------------
-- Crew (central roster)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crew_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS crew_documents (
  id TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL DEFAULT '',
  expiry_date TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS crew_assignments (
  id TEXT PRIMARY KEY,
  vessel_id TEXT NOT NULL DEFAULT '',
  crew_member_id TEXT NOT NULL DEFAULT '',
  role_on_vessel TEXT NOT NULL DEFAULT '',
  joining_date TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  employee_id TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS shift_entries (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  break_minutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS shift_requests (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT NOT NULL DEFAULT '',
  requested_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS shift_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  standard_hours_per_day NUMERIC NOT NULL DEFAULT 8,
  overtime_threshold_weekly NUMERIC NOT NULL DEFAULT 40,
  company_holidays JSONB NOT NULL DEFAULT '[]'::jsonb
);
INSERT INTO shift_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Payroll / HR
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_employees (
  employee_id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  hire_date TEXT NOT NULL DEFAULT '',
  ceased_date TEXT NOT NULL DEFAULT '',
  tax_code TEXT NOT NULL DEFAULT '',
  social_insurance TEXT NOT NULL DEFAULT '',
  residential_address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  officer_status TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_iban TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS payslips (
  pay_key TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL DEFAULT '',
  employee_name TEXT NOT NULL DEFAULT '',
  month TEXT NOT NULL DEFAULT '',
  year INTEGER,
  pay_date TEXT NOT NULL DEFAULT '',
  payroll_number TEXT NOT NULL DEFAULT '',
  saved_at BIGINT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS payroll_company_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO payroll_company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- LMS (courses, enrollments, exams, purchases, applicants) as JSON document
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lms_data (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO lms_data (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Distribution (brands, models, options, quotations, sold vessels) as JSON
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distribution_data (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO distribution_data (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Legacy JSON blob (migration source + optional snapshot)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_data (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_data (id, payload)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

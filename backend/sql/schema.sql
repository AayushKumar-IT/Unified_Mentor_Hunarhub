CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'entrepreneur', 'admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (category_id, slug)
);

CREATE TABLE IF NOT EXISTS entrepreneur_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL,
  experience_years INTEGER NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
  category_id UUID NOT NULL REFERENCES categories(id),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  image_url TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  availability_status TEXT NOT NULL DEFAULT 'available'
    CHECK (availability_status IN ('available', 'unavailable')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entrepreneur_skills (
  entrepreneur_id UUID NOT NULL REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id),
  PRIMARY KEY (entrepreneur_id, skill_id)
);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrepreneur_id UUID NOT NULL REFERENCES entrepreneur_profiles(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_amount NUMERIC(10, 2) NOT NULL CHECK (price_amount >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),
  entrepreneur_id UUID NOT NULL REFERENCES entrepreneur_profiles(id),
  service_id UUID NOT NULL REFERENCES services(id),
  requested_for TIMESTAMPTZ,
  customer_message TEXT NOT NULL DEFAULT '',
  agreed_price NUMERIC(10, 2) NOT NULL CHECK (agreed_price >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrepreneur_id UUID NOT NULL REFERENCES entrepreneur_profiles(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_amount NUMERIC(10, 2) NOT NULL CHECK (price_amount >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),
  entrepreneur_id UUID NOT NULL REFERENCES entrepreneur_profiles(id),
  status TEXT NOT NULL DEFAULT 'pending_confirmation'
    CHECK (status IN ('pending_confirmation', 'confirmed', 'ready', 'rejected', 'completed', 'cancelled')),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_title TEXT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(10, 2) NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrepreneur_id UUID NOT NULL REFERENCES entrepreneur_profiles(id),
  customer_id UUID REFERENCES users(id),
  order_id UUID UNIQUE REFERENCES orders(id),
  service_request_id UUID UNIQUE REFERENCES service_requests(id),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('pending', 'published', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('order', 'service_request')),
  transaction_id UUID NOT NULL,
  actor_id UUID REFERENCES users(id),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id),
  order_id UUID REFERENCES orders(id),
  service_request_id UUID REFERENCES service_requests(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolution TEXT NOT NULL DEFAULT '',
  assigned_admin_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (order_id IS NULL OR service_request_id IS NULL),
  CHECK (order_id IS NOT NULL OR service_request_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS entrepreneur_profiles_category_active_idx
  ON entrepreneur_profiles (category_id, active, verification_status);
CREATE INDEX IF NOT EXISTS services_entrepreneur_active_price_idx
  ON services (entrepreneur_id, active, price_amount);
CREATE INDEX IF NOT EXISTS products_active_featured_created_idx
  ON products (active, featured, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_entrepreneur_status_idx
  ON reviews (entrepreneur_id, status);
CREATE INDEX IF NOT EXISTS skills_category_active_idx
  ON skills (category_id, active, name);
CREATE INDEX IF NOT EXISTS entrepreneur_skills_skill_idx
  ON entrepreneur_skills (skill_id, entrepreneur_id);
CREATE INDEX IF NOT EXISTS service_requests_entrepreneur_status_idx
  ON service_requests (entrepreneur_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_customer_created_idx
  ON service_requests (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_entrepreneur_status_idx
  ON orders (entrepreneur_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_created_idx
  ON orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_status_created_idx ON complaints (status, created_at);
CREATE INDEX IF NOT EXISTS admin_audit_log_entity_idx
  ON admin_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

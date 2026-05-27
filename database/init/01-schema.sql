-- Phase 1b: full schema per spec v2.1 section 3.
-- Replaces the Phase 1a minimal version. Requires fresh pgdata to re-init.
-- IMPORTANT: Postgres only runs files in /docker-entrypoint-initdb.d on an
-- empty data dir. To apply this, wipe database/pgdata first.

CREATE TABLE locations (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  city          TEXT NOT NULL,
  region        TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
  id            BIGSERIAL PRIMARY KEY,
  sku           TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  base_price    NUMERIC(12,2) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_methods (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT UNIQUE NOT NULL
);

CREATE TABLE transactions (
  id                  BIGSERIAL PRIMARY KEY,
  transaction_time    TIMESTAMPTZ NOT NULL,
  location_id         BIGINT NOT NULL REFERENCES locations(id),
  payment_method_id   BIGINT NOT NULL REFERENCES payment_methods(id),
  total_amount        NUMERIC(14,2) NOT NULL,
  total_discount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  item_count          INTEGER NOT NULL
);

CREATE TABLE transaction_items (
  id                  BIGSERIAL PRIMARY KEY,
  transaction_id      BIGINT NOT NULL REFERENCES transactions(id),
  product_id          BIGINT NOT NULL REFERENCES products(id),
  quantity            INTEGER NOT NULL,
  unit_price          NUMERIC(12,2) NOT NULL,
  line_discount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal            NUMERIC(14,2) NOT NULL
);

-- All 7 mandatory indexes from spec section 3.
CREATE INDEX idx_tx_time          ON transactions(transaction_time);
CREATE INDEX idx_tx_location      ON transactions(location_id);
CREATE INDEX idx_tx_payment       ON transactions(payment_method_id);
CREATE INDEX idx_tx_loc_time      ON transactions(location_id, transaction_time);
CREATE INDEX idx_txi_transaction  ON transaction_items(transaction_id);
CREATE INDEX idx_txi_product      ON transaction_items(product_id);
CREATE INDEX idx_txi_prod_tx      ON transaction_items(product_id, transaction_id);

-- Enable pg_prewarm so run-benchmark.sh can warm the buffer cache (spec section 6).
CREATE EXTENSION IF NOT EXISTS pg_prewarm;

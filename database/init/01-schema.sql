-- Phase 1a minimal schema. Phase 1b replaces with full spec schema + indexes.

CREATE TABLE IF NOT EXISTS transactions (
  id                  BIGSERIAL PRIMARY KEY,
  transaction_time    TIMESTAMPTZ NOT NULL,
  location_id         BIGINT NOT NULL,
  payment_method_id   BIGINT NOT NULL,
  total_amount        NUMERIC(14,2) NOT NULL,
  total_discount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  item_count          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_time ON transactions(transaction_time);

-- 100 dummy rows spread across 10 days, 2026-04-01 .. 2026-04-10.
INSERT INTO transactions (transaction_time, location_id, payment_method_id, total_amount, item_count)
SELECT
  (DATE '2026-04-01' + (i % 10) * INTERVAL '1 day' + (i % 8) * INTERVAL '1 hour') AT TIME ZONE 'Asia/Jakarta',
  (i % 5) + 1,
  (i % 3) + 1,
  (50000 + (i * 137) % 200000)::numeric(14,2),
  (i % 5) + 1
FROM generate_series(1, 100) AS s(i);

ANALYZE transactions;

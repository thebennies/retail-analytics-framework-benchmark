-- ============================================================================
-- Shared SQL queries — single source of truth for all 3 services.
-- Phase 1b: all 8 benchmark queries.
-- Rules: literal SQL only. No ORM. Same query string in every service.
-- ============================================================================

-- @name: daily-sales
SELECT
  DATE(transaction_time AT TIME ZONE 'Asia/Jakarta') AS date,
  COUNT(*) AS transaction_count,
  SUM(total_amount) AS revenue,
  AVG(total_amount) AS avg_basket
FROM transactions
GROUP BY DATE(transaction_time AT TIME ZONE 'Asia/Jakarta')
ORDER BY date;

-- @name: sales-by-location
SELECT
  l.id, l.name, l.city, l.region,
  COUNT(t.id) AS transaction_count,
  SUM(t.total_amount) AS revenue
FROM transactions t
JOIN locations l ON l.id = t.location_id
GROUP BY l.id, l.name, l.city, l.region
ORDER BY revenue DESC;

-- @name: sales-by-product
SELECT
  p.id, p.sku, p.name, p.category,
  SUM(ti.quantity) AS qty_sold,
  SUM(ti.subtotal) AS revenue
FROM transaction_items ti
JOIN products p ON p.id = ti.product_id
GROUP BY p.id, p.sku, p.name, p.category
ORDER BY revenue DESC;

-- @name: sales-by-payment
SELECT
  pm.id, pm.name AS payment_method,
  COUNT(t.id) AS transaction_count,
  SUM(t.total_amount) AS revenue
FROM transactions t
JOIN payment_methods pm ON pm.id = t.payment_method_id
GROUP BY pm.id, pm.name
ORDER BY revenue DESC;

-- @name: hourly-sales
SELECT
  EXTRACT(HOUR FROM transaction_time AT TIME ZONE 'Asia/Jakarta')::int AS hour_of_day,
  COUNT(*) AS transaction_count,
  SUM(total_amount) AS revenue
FROM transactions
GROUP BY hour_of_day
ORDER BY hour_of_day;

-- @name: top-products
SELECT
  p.id, p.sku, p.name, p.category,
  SUM(ti.quantity) AS qty_sold,
  SUM(ti.subtotal) AS revenue
FROM transaction_items ti
JOIN products p ON p.id = ti.product_id
GROUP BY p.id, p.sku, p.name, p.category
ORDER BY revenue DESC
LIMIT 100;

-- @name: location-product-matrix
SELECT
  l.id   AS location_id,
  l.name AS location_name,
  p.category,
  SUM(ti.subtotal) AS revenue,
  COUNT(DISTINCT t.id) AS transaction_count
FROM transaction_items ti
JOIN transactions t ON t.id = ti.transaction_id
JOIN locations l    ON l.id = t.location_id
JOIN products  p    ON p.id = ti.product_id
GROUP BY l.id, l.name, p.category
ORDER BY l.id, p.category;

-- @name: discount-impact
SELECT
  CASE WHEN total_discount > 0 THEN 'with_discount' ELSE 'no_discount' END AS cohort,
  COUNT(*)                            AS transaction_count,
  SUM(total_amount)                   AS revenue,
  AVG(total_amount)                   AS avg_basket,
  SUM(total_discount)                 AS total_discount_amount,
  AVG(total_discount)                 AS avg_discount_per_tx
FROM transactions
GROUP BY cohort
ORDER BY cohort;

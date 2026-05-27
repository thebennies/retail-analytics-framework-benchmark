-- ============================================================================
-- Shared SQL queries — single source of truth for all 3 services.
-- Phase 1a: daily-sales only. Phase 1b adds the remaining 7 queries.
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

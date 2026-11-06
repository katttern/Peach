-- Що ламається без дедуплікації: сирі події проти дедуплікованих платежів, по валютах.
SELECT
  r.ccy,
  r.rows_raw,
  d.payments,
  r.success_raw,
  d.success,
  r.failure_raw,
  d.failure,
  CAST(r.turnover_raw AS decimal(20, 2)) / 100 AS turnover_raw,
  CAST(d.turnover AS decimal(20, 2)) / 100 AS turnover
FROM (
  SELECT
    ccy,
    count(*) AS rows_raw,
    count_if(status = 'success') AS success_raw,
    count_if(status = 'failure') AS failure_raw,
    sum(finalAmount) AS turnover_raw
  FROM payment_events
  GROUP BY ccy
) r
JOIN (
  SELECT
    ccy,
    count(*) AS payments,
    count_if(status = 'success') AS success,
    count_if(status = 'failure') AS failure,
    sum(finalAmount) AS turnover
  FROM payments_parquet
  GROUP BY ccy
) d ON r.ccy = d.ccy
ORDER BY r.ccy

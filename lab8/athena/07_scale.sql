-- Відповіді про масштаб: унікальні платежі, точні дублікати, запізнення понад годину.
SELECT
  e.events,
  e.unique_invoices,
  e.events - d.distinct_events AS exact_duplicates,
  e.late_over_hour,
  round(100.0 * e.late_over_hour / e.events, 4) AS late_over_hour_pct,
  e.max_lag_s
FROM (
  SELECT
    count(*) AS events,
    count(DISTINCT invoiceId) AS unique_invoices,
    count_if(lag_s > 3600) AS late_over_hour,
    max(lag_s) AS max_lag_s
  FROM (
    SELECT
      invoiceId,
      date_diff('second', from_iso8601_timestamp(modifiedDate), from_iso8601_timestamp(receivedAt)) AS lag_s
    FROM payment_events
  )
) e
CROSS JOIN (
  SELECT count(*) AS distinct_events
  FROM (SELECT DISTINCT * FROM payment_events)
) d

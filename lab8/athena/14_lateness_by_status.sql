-- Чи запізнюються статуси однаково. Від цього залежить, чи зміщує відкидання запізнілих подій failure share.
SELECT
  status,
  count(*) AS events,
  round(100.0 * count_if(lag_s > 60) / count(*), 3) AS late_60s_pct,
  round(100.0 * count_if(lag_s > 120) / count(*), 3) AS late_120s_pct,
  max(lag_s) AS max_lag_s
FROM (
  SELECT
    status,
    date_diff('second', from_iso8601_timestamp(modifiedDate), from_iso8601_timestamp(receivedAt)) AS lag_s
  FROM (SELECT DISTINCT * FROM payment_events)
)
GROUP BY status
ORDER BY status

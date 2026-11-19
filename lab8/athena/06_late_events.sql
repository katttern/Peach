-- Way A, крок 6: події із запізненням понад 60 с. Читає payment_events, а не view,
-- бо view лишає одну подію на платіж і втрачає решту.
SELECT
  count_if(lag_s > 60) AS late_events,
  count(*) AS total_events,
  round(100.0 * count_if(lag_s > 60) / count(*), 3) AS late_pct
FROM (
  SELECT date_diff('second', from_iso8601_timestamp(modifiedDate), from_iso8601_timestamp(receivedAt)) AS lag_s
  FROM payment_events
)

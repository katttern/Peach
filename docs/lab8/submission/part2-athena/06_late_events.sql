-- Step 6: events more than 60 s late. Reads payment_events, because the view keeps one event per payment.
SELECT
  count_if(lag_s > 60) AS late_events,
  count(*) AS total_events,
  round(100.0 * count_if(lag_s > 60) / count(*), 3) AS late_pct
FROM (
  SELECT date_diff('second', from_iso8601_timestamp(modifiedDate), from_iso8601_timestamp(receivedAt)) AS lag_s
  FROM payment_events
)

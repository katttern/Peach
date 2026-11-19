-- Step 5: payments per hour of the day, in UTC.
SELECT
  hour(from_iso8601_timestamp(createdDate)) AS hour_utc,
  count(*) AS payments
FROM payments
GROUP BY 1
ORDER BY 1

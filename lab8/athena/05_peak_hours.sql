-- Way A, крок 5: платежі за годиною доби. Час у UTC, як у даних.
SELECT
  hour(from_iso8601_timestamp(createdDate)) AS hour_utc,
  count(*) AS payments
FROM payments
GROUP BY 1
ORDER BY 1

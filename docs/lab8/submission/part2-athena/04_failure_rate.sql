-- Step 4: share of failed payments by payment method and device.
SELECT
  paymentMethod,
  device,
  count(*) AS payments,
  count_if(status = 'failure') AS failed,
  round(100.0 * count_if(status = 'failure') / count(*), 2) AS failure_pct
FROM payments
GROUP BY paymentMethod, device
ORDER BY failure_pct DESC

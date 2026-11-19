-- Step 3: turnover by merchant and currency, successful payments only, in major units.
SELECT
  merchantId,
  merchantName,
  ccy,
  CASE ccy WHEN 980 THEN 'UAH' WHEN 840 THEN 'USD' WHEN 978 THEN 'EUR' END AS currency,
  count(*) AS payments,
  CAST(sum(finalAmount) AS decimal(20, 2)) / 100 AS turnover
FROM payments
WHERE status = 'success'
GROUP BY merchantId, merchantName, ccy
ORDER BY ccy, turnover DESC

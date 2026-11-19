-- Query 03 on Parquet.
SELECT
  merchantId,
  merchantName,
  ccy,
  CASE ccy WHEN 980 THEN 'UAH' WHEN 840 THEN 'USD' WHEN 978 THEN 'EUR' END AS currency,
  count(*) AS payments,
  CAST(sum(finalAmount) AS decimal(20, 2)) / 100 AS turnover
FROM payments_parquet
WHERE status = 'success'
GROUP BY merchantId, merchantName, ccy
ORDER BY ccy, turnover DESC

-- Запит 03 на Parquet: оборот по мерчанту і валюті, лише успішні платежі, у основних одиницях.
-- decimal, а не double: bigint / 100.0 в Athena дає double, і великі суми виходять як 2.71E7.
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

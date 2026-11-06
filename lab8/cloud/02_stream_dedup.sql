-- Part 4: та сама дедуплікація, що у view payments, але по стріму. Рядок на invoiceId, найпізніший за modifiedDate.
SELECT status, count(*) AS payments, count(DISTINCT invoiceId) AS invoices
FROM (
  SELECT
    e.*,
    row_number() OVER (
      PARTITION BY invoiceId
      ORDER BY from_iso8601_timestamp(modifiedDate) DESC
    ) AS rn
  FROM (SELECT DISTINCT * FROM lab8.payment_stream) e
)
WHERE rn = 1
GROUP BY status
ORDER BY payments DESC

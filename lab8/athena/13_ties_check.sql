-- Перевірка view: скільки платежів мають різні статуси з однаковим найпізнішим modifiedDate.
SELECT count(*) AS invoices_with_tie FROM (
  SELECT invoiceId FROM (
    SELECT invoiceId, status, rank() OVER (PARTITION BY invoiceId ORDER BY from_iso8601_timestamp(modifiedDate) DESC) r
    FROM (SELECT DISTINCT invoiceId, status, modifiedDate FROM payment_events)
  ) WHERE r = 1 GROUP BY invoiceId HAVING count(*) > 1
)

-- Step 2: result of the view, one row per invoiceId.
SELECT status, count(*) AS payments, count(DISTINCT invoiceId) AS invoices
FROM payments
GROUP BY status
ORDER BY payments DESC

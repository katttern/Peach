-- Way A, крок 2: результат view. Рядків має бути стільки ж, скільки унікальних invoiceId.
SELECT status, count(*) AS payments, count(DISTINCT invoiceId) AS invoices
FROM payments
GROUP BY status
ORDER BY payments DESC

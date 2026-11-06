-- Part 4: цілісність. Скільки рядків дійшло, скільки дублікатів, у які дні dt вони лягли.
SELECT
  dt,
  count(*) AS events,
  count(DISTINCT invoiceId) AS invoices,
  count(DISTINCT "$path") AS files,
  min(modifiedDate) AS first_event_time,
  max(modifiedDate) AS last_event_time
FROM lab8.payment_stream
GROUP BY dt
ORDER BY dt

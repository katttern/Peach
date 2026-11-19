-- Way A, крок 1: перевірка, очікуємо ~3 млн подій у 31 партиції.
SELECT count(*) AS events, count(DISTINCT dt) AS partitions
FROM payment_events

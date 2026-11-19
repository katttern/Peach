-- Step 1: check, about 3 million events expected.
SELECT count(*) AS events, count(DISTINCT dt) AS partitions
FROM payment_events

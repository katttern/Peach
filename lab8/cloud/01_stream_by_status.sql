-- Part 4: дані, що пройшли через Kinesis і Firehose, по статусах.
SELECT status, count(*) AS events, min(receivedAt) AS first_received, max(receivedAt) AS last_received
FROM lab8.payment_stream
GROUP BY status

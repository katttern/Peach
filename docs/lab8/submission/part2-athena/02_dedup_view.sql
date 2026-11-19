-- Step 2: one row per invoiceId, the latest by modifiedDate. DISTINCT removes exact duplicates first.
CREATE OR REPLACE VIEW payments AS
SELECT
  invoiceId, status, failureReason, amount, finalAmount, ccy, reference,
  createdDate, modifiedDate, receivedAt, merchantId, merchantName, mcc,
  customerId, paymentMethod, device, dt
FROM (
  SELECT
    e.*,
    row_number() OVER (
      PARTITION BY invoiceId
      ORDER BY from_iso8601_timestamp(modifiedDate) DESC
    ) AS rn
  FROM (SELECT DISTINCT * FROM payment_events) e
)
WHERE rn = 1

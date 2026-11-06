-- Way A, крок 2: один рядок на invoiceId, найпізніший за modifiedDate.
-- Спочатку DISTINCT прибирає точні дублікати, потім row_number() лишає останній статус.
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

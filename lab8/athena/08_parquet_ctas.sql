-- Way A, крок 7: дедупліковані платежі в Parquet. Партиційна колонка dt має бути останньою.
CREATE TABLE payments_parquet
WITH (
  format = 'PARQUET',
  external_location = 's3://peach-lab8-470115905916/curated/payments/',
  partitioned_by = ARRAY['dt']
) AS
SELECT
  invoiceId, status, failureReason, amount, finalAmount, ccy, reference,
  createdDate, modifiedDate, receivedAt, merchantId, merchantName, mcc,
  customerId, paymentMethod, device, dt
FROM payments

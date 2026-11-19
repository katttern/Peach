-- Way A, крок 1: external table над копією payments/. dt = день modifiedDate.
CREATE EXTERNAL TABLE IF NOT EXISTS payment_events (
  invoiceId     string,
  status        string,
  failureReason string,
  amount        bigint,
  finalAmount   bigint,
  ccy           int,
  reference     string,
  createdDate   string,
  modifiedDate  string,
  receivedAt    string,
  merchantId    string,
  merchantName  string,
  mcc           int,
  customerId    string,
  paymentMethod string,
  device        string
)
PARTITIONED BY (dt string)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://peach-lab8-470115905916/payments/'

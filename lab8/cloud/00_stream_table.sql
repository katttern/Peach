-- Part 4: таблиця над файлами стріму, те саме визначення, що в infra/lab8-stream.tf.
-- Terraform видалив її разом зі стрімом, а файли в stream/ лишились. Для запиту стрім не потрібен.
CREATE EXTERNAL TABLE IF NOT EXISTS payment_stream (
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
LOCATION 's3://peach-lab8-470115905916/stream/'
TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.dt.type' = 'date',
  'projection.dt.format' = 'yyyy-MM-dd',
  'projection.dt.range' = '2026-11-01,NOW',
  'projection.dt.interval' = '1',
  'projection.dt.interval.unit' = 'DAYS',
  'storage.location.template' = 's3://peach-lab8-470115905916/stream/dt=${dt}/'
)

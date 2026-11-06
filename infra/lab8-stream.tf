# Lab 8, Part 4: stream of payments into the data lake.
# producer -> Kinesis -> Firehose -> S3 stream/ -> Glue table -> Athena
#
# Everything sits behind enable_lab8_stream, because the shard is billed by the
# hour: set it to true for the lab and back to false to destroy all of it.
# The bucket and the Glue database lab8 were created by hand in Part 2, so they
# are only referenced here.

locals {
  lab8_stream_count = var.enable_lab8_stream ? 1 : 0
  lab8_bucket_arn   = "arn:aws:s3:::${var.lab8_bucket}"

  # The same fields as payment_events in Part 2. Lower case on purpose: Glue
  # stores column names in lower case, so camelCase would show up as drift in
  # every plan. The JSON SerDe matches keys case-insensitively.
  lab8_stream_columns = {
    invoiceid     = "string"
    status        = "string"
    failurereason = "string"
    amount        = "bigint"
    finalamount   = "bigint"
    ccy           = "int"
    reference     = "string"
    createddate   = "string"
    modifieddate  = "string"
    receivedat    = "string"
    merchantid    = "string"
    merchantname  = "string"
    mcc           = "int"
    customerid    = "string"
    paymentmethod = "string"
    device        = "string"
  }
}

resource "aws_kinesis_stream" "lab8" {
  count = local.lab8_stream_count

  name             = "lab8-payments"
  shard_count      = 1
  retention_period = 24

  stream_mode_details {
    stream_mode = "PROVISIONED"
  }
}

data "aws_iam_policy_document" "lab8_firehose_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["firehose.amazonaws.com"]
    }

    # Only this account's Firehose can use the role.
    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "lab8_firehose" {
  count = local.lab8_stream_count

  name               = "lab8-firehose"
  assume_role_policy = data.aws_iam_policy_document.lab8_firehose_assume.json
}

resource "aws_iam_role_policy" "lab8_firehose" {
  count = local.lab8_stream_count

  name = "read-stream-write-prefix"
  role = aws_iam_role.lab8_firehose[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kinesis:DescribeStream",
          "kinesis:GetRecords",
          "kinesis:GetShardIterator",
          "kinesis:ListShards",
        ]
        Resource = aws_kinesis_stream.lab8[0].arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetBucketLocation",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
        ]
        Resource = local.lab8_bucket_arn
      },
      # Only the two prefixes: payments/ and curated/ from Part 2 stay out of reach.
      {
        Effect = "Allow"
        Action = [
          "s3:AbortMultipartUpload",
          "s3:GetObject",
          "s3:PutObject",
        ]
        Resource = [
          "${local.lab8_bucket_arn}/stream/*",
          "${local.lab8_bucket_arn}/stream-errors/*",
        ]
      },
    ]
  })
}

resource "aws_kinesis_firehose_delivery_stream" "lab8" {
  count = local.lab8_stream_count

  name        = "lab8-payments-to-s3"
  destination = "extended_s3"

  kinesis_source_configuration {
    kinesis_stream_arn = aws_kinesis_stream.lab8[0].arn
    role_arn           = aws_iam_role.lab8_firehose[0].arn
  }

  extended_s3_configuration {
    role_arn   = aws_iam_role.lab8_firehose[0].arn
    bucket_arn = local.lab8_bucket_arn

    # !{timestamp} is the time the record reached Firehose (UTC), not modifiedDate:
    # October events land under the day of the run.
    prefix = "stream/dt=!{timestamp:yyyy-MM-dd}/"
    # A prefix with an expression requires an error prefix; this expression splits
    # failures by type, still under stream-errors/.
    error_output_prefix = "stream-errors/!{firehose:error-output-type}/"

    # Whichever comes first: 60 s or 5 MB.
    buffering_interval = 60
    buffering_size     = 5
    compression_format = "UNCOMPRESSED"
  }

  # Firehose starts reading right after creation, so the role needs its rights first.
  depends_on = [aws_iam_role_policy.lab8_firehose]
}

resource "aws_glue_catalog_table" "lab8_payment_stream" {
  count = local.lab8_stream_count

  name          = "payment_stream"
  database_name = var.lab8_glue_database
  table_type    = "EXTERNAL_TABLE"

  parameters = {
    EXTERNAL       = "TRUE"
    classification = "json"

    # Partition projection: Athena computes the partitions from these rules, so
    # neither MSCK REPAIR nor a crawler is needed for each new day.
    "projection.enabled"          = "true"
    "projection.dt.type"          = "date"
    "projection.dt.format"        = "yyyy-MM-dd"
    "projection.dt.range"         = "${var.lab8_stream_start_date},NOW"
    "projection.dt.interval"      = "1"
    "projection.dt.interval.unit" = "DAYS"
    "storage.location.template"   = "s3://${var.lab8_bucket}/stream/dt=$${dt}/"
  }

  partition_keys {
    name = "dt"
    type = "string"
  }

  storage_descriptor {
    location      = "s3://${var.lab8_bucket}/stream/"
    input_format  = "org.apache.hadoop.mapred.TextInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat"

    ser_de_info {
      serialization_library = "org.openx.data.jsonserde.JsonSerDe"
    }

    dynamic "columns" {
      for_each = local.lab8_stream_columns

      content {
        name = columns.key
        type = columns.value
      }
    }
  }
}

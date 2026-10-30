# Former stack peach-reports (Lab 5), written from the DEPLOYED template: it
# creates its own RDS instance and has no SES identities, unlike the old
# infra/reports.yml. Schedule -> SQS -> builder Lambda (in the VPC, writes a
# CSV to S3) -> S3 event -> mailer Lambda (SES).

locals {
  # Names CloudFormation generated. They are ForceNew, so they must stay
  # exactly as deployed (see infra/migration/import-map.md).
  reports_names = {
    function_sg     = "peach-reports-FunctionSg-TIRpYIuNcY0S"
    db_sg           = "peach-reports-DbSg-fut21eImbJsr"
    db_subnet_group = "peach-reports-dbsubnetgroup-hg7e3l3gpza4"
    db_instance     = "peach-reports-db-rym4qinkxoy9"
    builder_role    = "peach-reports-BuilderRole-r2xZOCb3QKeK"
    mailer_role     = "peach-reports-MailerRole-4Go6vSe1od59"
    scheduler_role  = "peach-reports-SchedulerRole-IEJ0zwiXZLfb"
  }
}

# ---------- network and database ----------

resource "aws_security_group" "function" {
  name        = local.reports_names.function_sg
  description = "Report builder function"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_egress_rule" "function_all" {
  provider = aws.untagged

  security_group_id = aws_security_group.function.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "db" {
  name        = local.reports_names.db_sg
  description = "Aurora, reachable from the report builder only"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "db_from_function" {
  provider = aws.untagged

  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.function.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "db_all" {
  provider = aws.untagged

  security_group_id = aws_security_group.db.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_db_subnet_group" "reports" {
  name        = local.reports_names.db_subnet_group
  description = "Reports database"
  subnet_ids  = var.subnet_ids
}

resource "aws_db_instance" "reports" {
  identifier = local.reports_names.db_instance

  engine            = "postgres"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  storage_type      = "gp2"

  db_name  = "spry"
  username = "spry"
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.reports.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 0
  deletion_protection     = false
  # Terraform-only setting; import records it as true. Destroy is blocked by
  # prevent_destroy below instead of relying on a final snapshot.
  skip_final_snapshot = true

  lifecycle {
    prevent_destroy = true
    # AWS never returns the password, so an imported instance would always
    # show a change; the password is only used to build DATABASE_URL below.
    ignore_changes = [password]
  }
}

resource "aws_vpc_endpoint" "s3" {
  provider = aws.untagged

  vpc_id            = var.vpc_id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = var.route_table_ids
}

# ---------- bucket ----------

resource "aws_s3_bucket" "reports" {
  bucket = "${var.project_name}-reports-${data.aws_caller_identity.current.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket = aws_s3_bucket.reports.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    id     = "expire-reports"
    status = "Enabled"

    filter {
      prefix = "reports/"
    }

    expiration {
      days = 90
    }
  }
}

# Bucket, permission and notification are separate resources, so the
# permission can reference the bucket ARN directly (no hard-coded name to
# break a cycle, as the CloudFormation template needed).
resource "aws_lambda_permission" "mailer_s3" {
  # Statement left in place by the deleted CFN stack (Retain); imported.
  statement_id = "peach-reports-MailerPermission-vMOOokPSMEMt"
  action       = "lambda:InvokeFunction"
  # The name, as import records it (function_name is ForceNew).
  function_name  = aws_lambda_function.mailer.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.reports.arn
  source_account = data.aws_caller_identity.current.account_id
}

resource "aws_s3_bucket_notification" "reports" {
  bucket = aws_s3_bucket.reports.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.mailer.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "reports/"
    filter_suffix       = ".csv"
  }

  # S3 rejects the target until the permission exists. Nothing in this
  # resource refers to the permission, so the order is stated explicitly.
  depends_on = [aws_lambda_permission.mailer_s3]
}

# ---------- queue ----------

resource "aws_sqs_queue" "dlq" {
  name                      = "report-requests-dlq"
  message_retention_seconds = 1209600
  # AWS's default for new queues; the provider's default is 262144.
  max_message_size = 1048576
}

resource "aws_sqs_queue" "requests" {
  name                       = "report-requests"
  visibility_timeout_seconds = 720
  max_message_size           = 1048576
}

resource "aws_sqs_queue_redrive_policy" "requests" {
  queue_url = aws_sqs_queue.requests.id
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}

# ---------- builder (in the VPC) ----------

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "builder" {
  name               = local.reports_names.builder_role
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "builder" {
  name = "builder"
  role = aws_iam_role.builder.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.reports.arn}/reports/*"
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.requests.arn
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "builder_vpc_access" {
  role       = aws_iam_role.builder.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_cloudwatch_log_group" "builder" {
  name              = "/aws/lambda/${var.project_name}-report-builder"
  retention_in_days = 7
}

resource "aws_lambda_function" "builder" {
  function_name = "${var.project_name}-report-builder"
  package_type  = "Image"
  image_uri     = var.report_builder_image_uri
  architectures = ["x86_64"]
  role          = aws_iam_role.builder.arn
  timeout       = 120
  memory_size   = 512

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [aws_security_group.function.id]
  }

  environment {
    variables = {
      DATABASE_URL   = "postgresql+psycopg://spry:${var.db_password}@${aws_db_instance.reports.address}:5432/spry"
      REPORTS_BUCKET = aws_s3_bucket.reports.bucket
      FAIL_WEEK      = var.fail_week
    }
  }

  # Referencing the log group replaces the template's DependsOn.
  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.builder.name
  }
}

resource "aws_lambda_event_source_mapping" "builder_queue" {
  provider = aws.untagged

  function_name    = aws_lambda_function.builder.arn
  event_source_arn = aws_sqs_queue.requests.arn
  batch_size       = 1
}

# ---------- schedule ----------

resource "aws_iam_role" "scheduler" {
  name = local.reports_names.scheduler_role
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_send" {
  name = "send-to-queue"
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sqs:SendMessage"
      Resource = aws_sqs_queue.requests.arn
    }]
  })
}

resource "aws_scheduler_schedule" "weekly" {
  name                         = "${var.project_name}-weekly-report"
  group_name                   = "default"
  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = "Europe/Kyiv"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_sqs_queue.requests.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = "{\"week\": null, \"source\": \"schedule\"}"

    # Scheduler defaults, as deployed.
    retry_policy {
      maximum_event_age_in_seconds = 86400
      maximum_retry_attempts       = 185
    }
  }
}

# ---------- mailer (outside the VPC) ----------

resource "aws_iam_role" "mailer" {
  name               = local.reports_names.mailer_role
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "mailer" {
  name = "mailer"
  role = aws_iam_role.mailer.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.reports.arn}/reports/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "mailer_basic" {
  role       = aws_iam_role.mailer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "mailer" {
  name              = "/aws/lambda/${var.project_name}-report-mailer"
  retention_in_days = 7
}

# The code was inline (ZipFile) in the template; it is now lambda/mailer/index.py.
data "archive_file" "mailer" {
  type        = "zip"
  source_file = "${path.module}/lambda/mailer/index.py"
  output_path = "${path.module}/.build/mailer.zip"
}

resource "aws_lambda_function" "mailer" {
  function_name    = "${var.project_name}-report-mailer"
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.mailer.output_path
  source_code_hash = data.archive_file.mailer.output_base64sha256
  role             = aws_iam_role.mailer.arn
  timeout          = 30

  environment {
    variables = {
      SENDER     = var.sender_email
      RECIPIENTS = var.recipient_email
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.mailer.name
  }

  lifecycle {
    # The deployed code is CloudFormation's ZipFile of the same index.py; the
    # archive_file zip differs only in bytes. Remove this to redeploy the code.
    ignore_changes = [filename, source_code_hash]
  }
}

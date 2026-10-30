# CloudFormation → Terraform import map

Built from [cfn-inventory.md](cfn-inventory.md) (stacks `peach-auth`, `peach-reports`, `peach-ai`; account
`470115905916`, region `us-east-1`) on 2026-10-30.

- **Import ID formats** come from the "Import" section of each resource's documentation for `hashicorp/aws`
  **v6.71.0** (the version Terraform installs for `~> 6.0`; same text as on registry.terraform.io).
- **Composite IDs** were filled in with real values read through the AWS CLI. Read-only calls: `iam list-role-policies`,
  `iam list-attached-role-policies`, `lambda get-policy`, `ec2 describe-security-group-rules`,
  `cognito-idp describe-managed-login-branding-by-client`, `scheduler get-schedule`, and others.
- **Source of truth** is the **deployed** templates, not the files in `infra/`. `infra/reports.yml` differs from the
  live `peach-reports` stack (see the inventory).
- **"⚠ CFN-generated name"** means CloudFormation generated the physical name (`<stack>-<LogicalId>-<random>`). The
  Terraform configuration must use **exactly that name**. For these resources the name is `ForceNew`, and any other
  value replaces the resource (a new IAM role, a new security group, a new RDS instance).
- **"Recreate"** means: do not import; let Terraform create its own copy (reasons in the note).
- Each import is written as an `import { to = <address>  id = "<Import ID>" }` block, or as `terraform import <address> <Import ID>`.

## peach-auth (Lab 4, Cognito)

| CFN Logical ID | CFN Type | Terraform resource address | Import ID | Примітка |
|---|---|---|---|---|
| `UserPool` | `AWS::Cognito::UserPool` | `aws_cognito_user_pool.main` | `us-east-1_Mxjm62BAS` | Name `peach-users` comes from the template, not generated. `user_pool_tier = "ESSENTIALS"`, tags in `tags`. CFN drift detection does not check this type, so compare by hand with `terraform plan` after import. |
| `GoogleProvider` | `AWS::Cognito::UserPoolIdentityProvider` | `aws_cognito_identity_provider.google` | `us-east-1_Mxjm62BAS:Google` | Format `user_pool_id:ProviderName`. `provider_details.client_secret` comes from a `sensitive` variable (`GoogleClientSecret`, NoEcho in CFN). Do not commit it. |
| `UserPoolClient` | `AWS::Cognito::UserPoolClient` | `aws_cognito_user_pool_client.web` | `us-east-1_Mxjm62BAS/18a2au33rm9n9t9eck3g9ja3ve` | Format `user_pool_id/client_id`. Keep the same `callback_urls` / `logout_urls` (CloudFront + localhost). |
| `UserPoolDomain` | `AWS::Cognito::UserPoolDomain` | `aws_cognito_user_pool_domain.main` | `peach-katttern-demo` | Import by `domain` (the prefix). `managed_login_version = 2`. |
| `ManagedLoginBranding` | `AWS::Cognito::ManagedLoginBranding` | `aws_cognito_managed_login_branding.web` | `us-east-1_Mxjm62BAS,ee024b8f-8c83-41ce-84c4-83f9764b2ccc` | The CFN Physical ID joins the parts with `\|`, but Terraform needs a **comma**: `user_pool_id,managed_login_branding_id`. `use_cognito_provided_values = true`. |

## peach-reports (Lab 5, weekly report)

| CFN Logical ID | CFN Type | Terraform resource address | Import ID | Примітка |
|---|---|---|---|---|
| `FunctionSg` | `AWS::EC2::SecurityGroup` | `aws_security_group.function` | `sg-0a67cc72d8da38fba` | ⚠ CFN-generated name: `name = "peach-reports-FunctionSg-TIRpYIuNcY0S"`, `description = "Report builder function"`. Both are ForceNew. Do not write inline `ingress`/`egress` blocks: rules live in separate resources (next row). |
| `FunctionSg` (default egress) | (part of the SG) | `aws_vpc_security_group_egress_rule.function_all` | `sgr-0c7a5acf26e686da8` | The "all traffic → 0.0.0.0/0" egress rule that AWS created by default. The template has no such rule, but the builder needs egress to RDS and to the S3 endpoint. In Terraform it is described explicitly; otherwise it would not be managed. |
| `DbSg` | `AWS::EC2::SecurityGroup` | `aws_security_group.db` | `sg-019d5695e862d3f94` | ⚠ CFN-generated name: `name = "peach-reports-DbSg-fut21eImbJsr"`, `description = "Aurora, reachable from the report builder only"`. |
| `DbSg` (`SecurityGroupIngress`) | (part of the SG) | `aws_vpc_security_group_ingress_rule.db_from_function` | `sgr-098be376cdefc3d0b` | The inline CFN ingress rule becomes a separate resource: tcp 5432 from `sg-0a67cc72d8da38fba`. |
| `DbSg` (default egress) | (part of the SG) | `aws_vpc_security_group_egress_rule.db_all` | `sgr-00e81ec02ceadacc6` | Default egress 0.0.0.0/0. You may choose not to describe it, but then it stays outside Terraform. |
| `DbSubnetGroup` | `AWS::RDS::DBSubnetGroup` | `aws_db_subnet_group.reports` | `peach-reports-dbsubnetgroup-hg7e3l3gpza4` | ⚠ CFN-generated name (lower case): `name = "peach-reports-dbsubnetgroup-hg7e3l3gpza4"`, ForceNew. `subnet_ids` = the 6 subnets of the `SubnetIds` parameter. |
| `Db` | `AWS::RDS::DBInstance` | `aws_db_instance.reports` | `peach-reports-db-rym4qinkxoy9` | ⚠ CFN-generated identifier: `identifier = "peach-reports-db-rym4qinkxoy9"` (ForceNew; another name means a **new empty database**). AWS never returns the master password: pass it through a `sensitive` variable and add `lifecycle { ignore_changes = [password] }`, or switch deliberately to `manage_master_user_password`. Backups are 0 and deletion protection is off: set `deletion_protection = true` and `prevent_destroy` before the cutover. |
| `S3Endpoint` | `AWS::EC2::VPCEndpoint` | `aws_vpc_endpoint.s3` | `vpce-045dd2665a5136698` | Gateway `com.amazonaws.us-east-1.s3`, `route_table_ids = ["rtb-05ae09f34c8d6802f"]` inline (do not mix with `aws_vpc_endpoint_route_table_association`). CFN drift detection does not check this type. |
| `Bucket` | `AWS::S3::Bucket` | `aws_s3_bucket.reports` | `peach-reports-470115905916` | The name comes from the template (`${ProjectName}-reports-${AccountId}`), not generated. Only `bucket` and `tags` go here; each piece of configuration is in its own resource below. Versioning is off, there is no bucket policy, and ownership is the default `BucketOwnerEnforced`, so no extra resources are needed. |
| `Bucket` (`PublicAccessBlockConfiguration`) | (part of the bucket) | `aws_s3_bucket_public_access_block.reports` | `peach-reports-470115905916` | All four flags `true`. |
| `Bucket` (`LifecycleConfiguration`) | (part of the bucket) | `aws_s3_bucket_lifecycle_configuration.reports` | `peach-reports-470115905916` | Rule `expire-reports`: prefix `reports/` (in v6 put it in `filter { prefix = "reports/" }`), expiration after 90 days. |
| `Bucket` (`NotificationConfiguration`) | (part of the bucket) | `aws_s3_bucket_notification.reports` | — (would be `peach-reports-470115905916`) | **Recreate.** This is one configuration for the whole bucket: `apply` overwrites it entirely (PutBucketNotificationConfiguration), so there is nothing to keep from an import. It must be applied **after** `aws_lambda_permission.mailer_s3` (`depends_on`), or S3 rejects the Lambda target. Content: `s3:ObjectCreated:*` → `peach-report-mailer`, prefix `reports/`, suffix `.csv`. |
| `Dlq` | `AWS::SQS::Queue` | `aws_sqs_queue.dlq` | `https://sqs.us-east-1.amazonaws.com/470115905916/report-requests-dlq` | Imported by **URL**, not by name or ARN. `message_retention_seconds = 1209600`. |
| `Queue` | `AWS::SQS::Queue` | `aws_sqs_queue.requests` | `https://sqs.us-east-1.amazonaws.com/470115905916/report-requests` | `visibility_timeout_seconds = 720`. Do **not** set `redrive_policy` here: it is a separate resource (next row). |
| `Queue` (`RedrivePolicy`) | (part of the queue) | `aws_sqs_queue_redrive_policy.requests` | `https://sqs.us-east-1.amazonaws.com/470115905916/report-requests` | `deadLetterTargetArn` = `aws_sqs_queue.dlq.arn`, `maxReceiveCount = 3`. Alternatively keep it inline as `redrive_policy` in `aws_sqs_queue.requests`, but not both. |
| `BuilderRole` | `AWS::IAM::Role` | `aws_iam_role.builder` | `peach-reports-BuilderRole-r2xZOCb3QKeK` | ⚠ CFN-generated name: `name = "peach-reports-BuilderRole-r2xZOCb3QKeK"`, ForceNew. Do not use `inline_policy` or `managed_policy_arns` in the role (deprecated in v6, and they conflict with the separate resources below). |
| `BuilderRole` (`Policies[builder]`) | (inline policy) | `aws_iam_role_policy.builder` | `peach-reports-BuilderRole-r2xZOCb3QKeK:builder` | Format `role_name:policy_name`; PolicyName = `builder` (s3:PutObject on `reports/*`, SQS receive/delete). |
| `BuilderRole` (`ManagedPolicyArns`) | (attachment) | `aws_iam_role_policy_attachment.builder_vpc_access` | `peach-reports-BuilderRole-r2xZOCb3QKeK/arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole` | Format `role-name/policy-arn`. |
| `BuilderLogGroup` | `AWS::Logs::LogGroup` | `aws_cloudwatch_log_group.builder` | `/aws/lambda/peach-report-builder` | `retention_in_days = 7`. |
| `BuilderFunction` | `AWS::Lambda::Function` | `aws_lambda_function.builder` | `peach-report-builder` | `package_type = "Image"`, `image_uri` = the current one (`peach-reports:v1`, MUTABLE tag). The `DATABASE_URL` env var contains the DB password, so build it from a `sensitive` variable; it will be visible in state, so the state must be in HCP or another encrypted backend. |
| `BuilderQueueMapping` | `AWS::Lambda::EventSourceMapping` | `aws_lambda_event_source_mapping.builder_queue` | `805e5568-29b9-435e-a157-f6420e80f69a` | Import by UUID; `batch_size = 1`. Import, do not recreate: two mappings would make two consumers of the queue during the migration. CFN drift detection does not check this type. |
| `SchedulerRole` | `AWS::IAM::Role` | `aws_iam_role.scheduler` | `peach-reports-SchedulerRole-IEJ0zwiXZLfb` | ⚠ CFN-generated name: `name = "peach-reports-SchedulerRole-IEJ0zwiXZLfb"`. No managed policies. |
| `SchedulerRole` (`Policies[send-to-queue]`) | (inline policy) | `aws_iam_role_policy.scheduler_send` | `peach-reports-SchedulerRole-IEJ0zwiXZLfb:send-to-queue` | `sqs:SendMessage` on `report-requests`. |
| `WeeklySchedule` | `AWS::Scheduler::Schedule` | `aws_scheduler_schedule.weekly` | `default/peach-weekly-report` | Format `group_name/name`; the group is `default`. `cron(0 7 ? * MON *)`, `schedule_expression_timezone = "Europe/Kyiv"`, `flexible_time_window { mode = "OFF" }`. |
| `MailerRole` | `AWS::IAM::Role` | `aws_iam_role.mailer` | `peach-reports-MailerRole-4Go6vSe1od59` | ⚠ CFN-generated name: `name = "peach-reports-MailerRole-4Go6vSe1od59"`. |
| `MailerRole` (`Policies[mailer]`) | (inline policy) | `aws_iam_role_policy.mailer` | `peach-reports-MailerRole-4Go6vSe1od59:mailer` | s3:GetObject on `reports/*`, `ses:SendEmail`/`SendRawEmail`. |
| `MailerRole` (`ManagedPolicyArns`) | (attachment) | `aws_iam_role_policy_attachment.mailer_basic` | `peach-reports-MailerRole-4Go6vSe1od59/arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole` | |
| `MailerLogGroup` | `AWS::Logs::LogGroup` | `aws_cloudwatch_log_group.mailer` | `/aws/lambda/peach-report-mailer` | `retention_in_days = 7`. |
| `MailerFunction` | `AWS::Lambda::Function` | `aws_lambda_function.mailer` | `peach-report-mailer` | The code is inline in CFN (`ZipFile`). In Terraform, move it to a file plus `data "archive_file"`. After import the first `plan` shows an in-place update of the code (`source_code_hash`), not a replacement. `runtime = "python3.12"`, `handler = "index.handler"`. |
| `MailerPermission` | `AWS::Lambda::Permission` | `aws_lambda_permission.mailer_s3` | `peach-report-mailer/peach-reports-MailerPermission-vMOOokPSMEMt` | **Import** (changed from "Recreate" on 2026-10-30). Because of `DeletionPolicy: Retain` the CFN statement survived the stack deletion, so a new one would be a duplicate. In `.tf`: `statement_id = "peach-reports-MailerPermission-vMOOokPSMEMt"` and `function_name` = the function **name** (import records the name; an ARN forces replacement). principal `s3.amazonaws.com`, `source_arn` = bucket, `source_account`. |

## peach-ai (Lab 6, agenda parser)

| CFN Logical ID | CFN Type | Terraform resource address | Import ID | Примітка |
|---|---|---|---|---|
| `ParserRole` | `AWS::IAM::Role` | `aws_iam_role.parser` | `peach-ai-ParserRole-XbH92tsbFUwc` | ⚠ CFN-generated name: `name = "peach-ai-ParserRole-XbH92tsbFUwc"`, ForceNew. No `inline_policy` / `managed_policy_arns`. |
| `ParserRole` (`Policies[parser]`) | (inline policy) | `aws_iam_role_policy.parser` | `peach-ai-ParserRole-XbH92tsbFUwc:parser` | `bedrock-mantle:CreateInference` + `bedrock:InvokeModel` on Nova. |
| `ParserRole` (`ManagedPolicyArns`) | (attachment) | `aws_iam_role_policy_attachment.parser_basic` | `peach-ai-ParserRole-XbH92tsbFUwc/arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole` | |
| `ParserLogGroup` | `AWS::Logs::LogGroup` | `aws_cloudwatch_log_group.parser` | `/aws/lambda/peach-agenda-parser` | `retention_in_days = 7`. |
| `ParserFunction` | `AWS::Lambda::Function` | `aws_lambda_function.parser` | `peach-agenda-parser` | Image `peach-reports:1606fa4`, `image_config { command = ["app.ai.agenda_lambda.handler"] }`, `architectures = ["x86_64"]`, timeout 30, memory 512. |
| `ParserUrl` | `AWS::Lambda::Url` | `aws_lambda_function_url.parser` | `peach-agenda-parser` | The CFN Physical ID is the function **ARN**, but Terraform imports by **function_name**. Import, do not recreate: the URL `3rjvngayjd7zx2rt3osrso66dm0bpnkr.lambda-url…` is built into the frontend bundle. `authorization_type = "NONE"`, CORS: POST, `authorization`/`content-type`, max_age 300. |
| `ParserUrlPermission` | `AWS::Lambda::Permission` | `aws_lambda_permission.parser_url` | `peach-agenda-parser/peach-ai-ParserUrlPermission-QdTCW31eNsNe` | **Import** (changed from "Recreate" on 2026-10-30). Because of `DeletionPolicy: Retain` the CFN statement survived the stack deletion, so a new one would be a duplicate. In `.tf`: `statement_id = "peach-ai-ParserUrlPermission-QdTCW31eNsNe"` and `function_name` = the function **name** (import records the name; an ARN forces replacement). `action = "lambda:InvokeFunctionUrl"`, `principal = "*"`, `function_url_auth_type = "NONE"`. |
| `ParserInvokePermission` | `AWS::Lambda::Permission` | `aws_lambda_permission.parser_invoke_via_url` | `peach-agenda-parser/peach-ai-ParserInvokePermission-89xH9X8Em6MK` | **Import** (changed from "Recreate" on 2026-10-30). Because of `DeletionPolicy: Retain` the CFN statement survived the stack deletion, so a new one would be a duplicate. In `.tf`: `statement_id = "peach-ai-ParserInvokePermission-89xH9X8Em6MK"` and `function_name` = the function **name** (import records the name; an ARN forces replacement). `action = "lambda:InvokeFunction"`, `principal = "*"`, `invoked_via_function_url = true`. |
| `MonthlyBudget` | `AWS::Budgets::Budget` | `aws_budgets_budget.monthly` | `470115905916:peach-monthly` | Format `AccountID:BudgetName`. Two `notification` blocks (ACTUAL > 80 %, FORECASTED > 100 %, email). CFN drift detection does not check this type. |

## Before removing the CFN stacks

The imported resources still belong to the CFN stacks. If a stack is deleted as it is, CloudFormation **deletes them**,
including RDS and the reports bucket. So:

1. Add `DeletionPolicy: Retain` (and `UpdateReplacePolicy: Retain`) to every resource in the "import" rows of the
   **live** templates, then run a stack update.
2. Only then delete the stack. (Done on 2026-10-30 with `Retain` on every resource, the three
   `AWS::Lambda::Permission` included, so they stayed and are now imported.) The bucket notification lives in the bucket,
   which is `Retain`, so it is not touched.
3. Then run `terraform plan` and expect **No changes**. The exception is the mailer code (`source_code_hash`), see above.

## Summary

| Stack | CFN resources | Terraform resources | Imports | Recreate |
|---|---|---|---|---|
| `peach-auth` | 5 | 5 | 5 | 0 |
| `peach-reports` | 18 | 30 | 29 | 1 (`aws_s3_bucket_notification.reports`) |
| `peach-ai` | 7 | 9 | 9 | 0 |
| **Total** | **30** | **44** | **43** | **1** |

**43 imports, 1 resource created anew.** Updated on 2026-10-30, after the stacks were deleted with
`Retain`: the three Lambda permissions are imported instead of recreated (originally 40 / 4).

# Review: Terraform code in `infra/`

Branch `terraform-migration`. Reviewed as someone else's pull request, on 2026-10-30.
Sources of truth: [cfn-inventory.md](cfn-inventory.md) and [import-map.md](import-map.md). The live values were
read with read-only AWS CLI calls (`cognito-idp describe-*`, `s3api get-*`/`head-bucket`,
`lambda get-function-configuration`). `terraform plan`, `apply` and `import` were not run.

## Verdict

**No blocking findings, nothing was changed in the `.tf` files.**

| Check | Result |
|---|---|
| 1. import-map → `.tf` | 44/44 rows found, 0 missing, 0 extra resources |
| 2. Names vs Physical ID | 24 match; 3 intentional differences (`statement_id` of the recreated Lambda permissions) |
| 3. Secrets in `.tf` / `terraform.tfvars` | **0** findings |
| 4. Replacement-triggering attributes | all match the live values |
| 5. Outputs used by the Makefile, scripts and frontend | all present in `outputs.tf` |
| 6. `terraform fmt -check -recursive`, `terraform validate` | both pass (exit 0, `Success! The configuration is valid.`) |

## 1. import-map → `.tf`

Each row of `import-map.md` has exactly one resource in the configuration (44 rows, 44 `resource` blocks).

| Stack | CFN Logical ID | Terraform address | In .tf | File:line |
|---|---|---|---|---|
| peach-auth | `UserPool` | `aws_cognito_user_pool.main` | так | [auth.tf:4](../auth.tf#L4) |
| peach-auth | `GoogleProvider` | `aws_cognito_identity_provider.google` | так | [auth.tf:57](../auth.tf#L57) |
| peach-auth | `UserPoolClient` | `aws_cognito_user_pool_client.web` | так | [auth.tf:83](../auth.tf#L83) |
| peach-auth | `UserPoolDomain` | `aws_cognito_user_pool_domain.main` | так | [auth.tf:104](../auth.tf#L104) |
| peach-auth | `ManagedLoginBranding` | `aws_cognito_managed_login_branding.web` | так | [auth.tf:110](../auth.tf#L110) |
| peach-reports | `FunctionSg` | `aws_security_group.function` | так | [reports.tf:22](../reports.tf#L22) |
| peach-reports | `FunctionSg` (default egress) | `aws_vpc_security_group_egress_rule.function_all` | так | [reports.tf:28](../reports.tf#L28) |
| peach-reports | `DbSg` | `aws_security_group.db` | так | [reports.tf:34](../reports.tf#L34) |
| peach-reports | `DbSg` (`SecurityGroupIngress`) | `aws_vpc_security_group_ingress_rule.db_from_function` | так | [reports.tf:40](../reports.tf#L40) |
| peach-reports | `DbSg` (default egress) | `aws_vpc_security_group_egress_rule.db_all` | так | [reports.tf:48](../reports.tf#L48) |
| peach-reports | `DbSubnetGroup` | `aws_db_subnet_group.reports` | так | [reports.tf:54](../reports.tf#L54) |
| peach-reports | `Db` | `aws_db_instance.reports` | так | [reports.tf:60](../reports.tf#L60) |
| peach-reports | `S3Endpoint` | `aws_vpc_endpoint.s3` | так | [reports.tf:90](../reports.tf#L90) |
| peach-reports | `Bucket` | `aws_s3_bucket.reports` | так | [reports.tf:99](../reports.tf#L99) |
| peach-reports | `Bucket` (`PublicAccessBlockConfiguration`) | `aws_s3_bucket_public_access_block.reports` | так | [reports.tf:107](../reports.tf#L107) |
| peach-reports | `Bucket` (`LifecycleConfiguration`) | `aws_s3_bucket_lifecycle_configuration.reports` | так | [reports.tf:116](../reports.tf#L116) |
| peach-reports | `Bucket` (`NotificationConfiguration`) | `aws_s3_bucket_notification.reports` | так | [reports.tf:146](../reports.tf#L146) |
| peach-reports | `Dlq` | `aws_sqs_queue.dlq` | так | [reports.tf:160](../reports.tf#L160) |
| peach-reports | `Queue` | `aws_sqs_queue.requests` | так | [reports.tf:165](../reports.tf#L165) |
| peach-reports | `Queue` (`RedrivePolicy`) | `aws_sqs_queue_redrive_policy.requests` | так | [reports.tf:170](../reports.tf#L170) |
| peach-reports | `BuilderRole` | `aws_iam_role.builder` | так | [reports.tf:190](../reports.tf#L190) |
| peach-reports | `BuilderRole` (`Policies[builder]`) | `aws_iam_role_policy.builder` | так | [reports.tf:195](../reports.tf#L195) |
| peach-reports | `BuilderRole` (`ManagedPolicyArns`) | `aws_iam_role_policy_attachment.builder_vpc_access` | так | [reports.tf:215](../reports.tf#L215) |
| peach-reports | `BuilderLogGroup` | `aws_cloudwatch_log_group.builder` | так | [reports.tf:220](../reports.tf#L220) |
| peach-reports | `BuilderFunction` | `aws_lambda_function.builder` | так | [reports.tf:225](../reports.tf#L225) |
| peach-reports | `BuilderQueueMapping` | `aws_lambda_event_source_mapping.builder_queue` | так | [reports.tf:254](../reports.tf#L254) |
| peach-reports | `SchedulerRole` | `aws_iam_role.scheduler` | так | [reports.tf:262](../reports.tf#L262) |
| peach-reports | `SchedulerRole` (`Policies[send-to-queue]`) | `aws_iam_role_policy.scheduler_send` | так | [reports.tf:274](../reports.tf#L274) |
| peach-reports | `WeeklySchedule` | `aws_scheduler_schedule.weekly` | так | [reports.tf:287](../reports.tf#L287) |
| peach-reports | `MailerRole` | `aws_iam_role.mailer` | так | [reports.tf:312](../reports.tf#L312) |
| peach-reports | `MailerRole` (`Policies[mailer]`) | `aws_iam_role_policy.mailer` | так | [reports.tf:317](../reports.tf#L317) |
| peach-reports | `MailerRole` (`ManagedPolicyArns`) | `aws_iam_role_policy_attachment.mailer_basic` | так | [reports.tf:337](../reports.tf#L337) |
| peach-reports | `MailerLogGroup` | `aws_cloudwatch_log_group.mailer` | так | [reports.tf:342](../reports.tf#L342) |
| peach-reports | `MailerFunction` | `aws_lambda_function.mailer` | так | [reports.tf:354](../reports.tf#L354) |
| peach-reports | `MailerPermission` | `aws_lambda_permission.mailer_s3` | так | [reports.tf:136](../reports.tf#L136) |
| peach-ai | `ParserRole` | `aws_iam_role.parser` | так | [ai.tf:5](../ai.tf#L5) |
| peach-ai | `ParserRole` (`Policies[parser]`) | `aws_iam_role_policy.parser` | так | [ai.tf:11](../ai.tf#L11) |
| peach-ai | `ParserRole` (`ManagedPolicyArns`) | `aws_iam_role_policy_attachment.parser_basic` | так | [ai.tf:37](../ai.tf#L37) |
| peach-ai | `ParserLogGroup` | `aws_cloudwatch_log_group.parser` | так | [ai.tf:42](../ai.tf#L42) |
| peach-ai | `ParserFunction` | `aws_lambda_function.parser` | так | [ai.tf:47](../ai.tf#L47) |
| peach-ai | `ParserUrl` | `aws_lambda_function_url.parser` | так | [ai.tf:75](../ai.tf#L75) |
| peach-ai | `ParserUrlPermission` | `aws_lambda_permission.parser_url` | так | [ai.tf:87](../ai.tf#L87) |
| peach-ai | `ParserInvokePermission` | `aws_lambda_permission.parser_invoke_via_url` | так | [ai.tf:95](../ai.tf#L95) |
| peach-ai | `MonthlyBudget` | `aws_budgets_budget.monthly` | так | [ai.tf:105](../ai.tf#L105) |

**Extra resources** (in `.tf`, not in import-map): none.
Data sources (`aws_caller_identity.current`, `aws_iam_policy_document.lambda_assume`, `archive_file.mailer`) are not
AWS resources and are not imported.

## 2. Names vs Physical ID

Each value was computed from the code (with `terraform.tfvars`, `locals` and account ID `470115905916`
substituted in) and compared with the Physical ID in the inventory. For the security groups, the user pool and the client
the Physical ID is an ID, not a name, so the name was compared with the live value (`describe-security-groups`,
`describe-user-pool`, `describe-user-pool-client`). The names of the inline IAM policies (`builder`, `mailer`,
`send-to-queue`, `parser`) match the PolicyName values in the deployed templates.

| Resource | Value in `.tf` | Physical ID / live value | |
|---|---|---|---|
| `aws_cognito_user_pool.main` | `peach-users` | `peach-users` (live) | ✓ |
| `aws_cognito_identity_provider.google` | `Google` | `Google` | ✓ |
| `aws_cognito_user_pool_client.web` | `peach-web` | `peach-web` (live) | ✓ |
| `aws_cognito_user_pool_domain.main` | `peach-katttern-demo` | `peach-katttern-demo` | ✓ |
| `aws_security_group.function` | `peach-reports-FunctionSg-TIRpYIuNcY0S` | same (live) | ✓ |
| `aws_security_group.db` | `peach-reports-DbSg-fut21eImbJsr` | same (live) | ✓ |
| `aws_db_subnet_group.reports` | `peach-reports-dbsubnetgroup-hg7e3l3gpza4` | same | ✓ |
| `aws_db_instance.reports` | `peach-reports-db-rym4qinkxoy9` | same | ✓ |
| `aws_s3_bucket.reports` | `peach-reports-470115905916` | same | ✓ |
| `aws_sqs_queue.dlq` / `.requests` | `report-requests-dlq` / `report-requests` | last segment of the queue URL | ✓ |
| `aws_iam_role.builder` / `.scheduler` / `.mailer` / `.parser` | `peach-reports-BuilderRole-r2xZOCb3QKeK`, `peach-reports-SchedulerRole-IEJ0zwiXZLfb`, `peach-reports-MailerRole-4Go6vSe1od59`, `peach-ai-ParserRole-XbH92tsbFUwc` | same | ✓ |
| `aws_cloudwatch_log_group.*` | `/aws/lambda/peach-report-builder`, `…-report-mailer`, `…-agenda-parser` | same | ✓ |
| `aws_lambda_function.*` | `peach-report-builder`, `peach-report-mailer`, `peach-agenda-parser` | same | ✓ |
| `aws_lambda_function_url.parser` | `peach-agenda-parser` | function ARN `…:function:peach-agenda-parser` | ✓ |
| `aws_scheduler_schedule.weekly` | `peach-weekly-report` (group `default`) | same | ✓ |
| `aws_budgets_budget.monthly` | `peach-monthly` | same | ✓ |
| `aws_lambda_permission.mailer_s3` | `AllowS3InvokeMailer` | `peach-reports-MailerPermission-vMOOokPSMEMt` | **differs, on purpose** |
| `aws_lambda_permission.parser_url` | `AllowPublicFunctionUrl` | `peach-ai-ParserUrlPermission-QdTCW31eNsNe` | **differs, on purpose** |
| `aws_lambda_permission.parser_invoke_via_url` | `AllowInvokeViaFunctionUrl` | `peach-ai-ParserInvokePermission-89xH9X8Em6MK` | **differs, on purpose** |

**About the 3 differences.** In import-map these permissions are marked "Recreate". Terraform adds its own statement
next to the CloudFormation one, so the function stays reachable during the migration. With the same Sid, `AddPermission`
would fail with `ResourceConflictException` while CloudFormation's statement still exists. So the new statement IDs are
required, not a mistake. If import is chosen for these three after all, the `statement_id` must be set to the CFN value.

## 3. Secrets

Scanned `infra/*.tf`, `infra/terraform.tfvars`, `infra/lambda/mailer/index.py` and `infra/.gitignore`:

- patterns: `GOCSPX-`, `AKIA…`/`ASIA…`, `aws_secret_access_key`, `-----BEGIN`, JWT (`eyJ…`), `ghp_`, `xox[bp]-`,
  `atlasv1.`, and `password|secret|token|api_key = "<literal>"`: **0 matches**;
- the actual values of `GOOGLE_CLIENT_SECRET` and `DB_PASSWORD` from the local `.env` (compared without printing):
  they appear in **no** file in `infra/` or `infra/migration/`;
- the remaining "secret / password" mentions are only `var.google_client_secret`, `var.db_password`, their
  declarations (`sensitive = true`, no default), comments, and Cognito attribute names (`password_policy`,
  `generate_secret = false`, `token_url`, …).

`google_client_id` in `terraform.tfvars` is a public OAuth identifier, not a secret.

## 4. Replacement-triggering attributes

The list comes from the `hashicorp/aws` **v6.71.0** source (`ForceNew: true` and `CustomizeDiff` in
`internal/service/cognitoidp/user_pool.go`, `s3/bucket.go`, `lambda/function.go`).

### `aws_cognito_user_pool.main` (`describe-user-pool`)

| Attribute | Effect of a change | `.tf` | Live | |
|---|---|---|---|---|
| `username_attributes` | ForceNew | `["email"]` | `["email"]` | ✓ |
| `alias_attributes` | ForceNew | not set | `null` | ✓ |
| `username_configuration.case_sensitive` | ForceNew | not set | `UsernameConfiguration: null` | ✓ |
| `schema` | not a replacement, but the provider rejects changing or removing any item ("cannot modify or remove schema items") | no blocks | 21 standard attributes, **0** `custom:` | ✓ |
| `name` | in place (not ForceNew in v6.71.0) | `peach-users` | `peach-users` | ✓ |

### `aws_s3_bucket.reports` (`head-bucket`, `get-bucket-location`, `get-object-lock-configuration`)

| Attribute | Effect of a change | `.tf` | Live | |
|---|---|---|---|---|
| `bucket` | ForceNew | `peach-reports-470115905916` | `peach-reports-470115905916` | ✓ |
| `bucket_prefix` | ForceNew | not set | — | ✓ |
| `bucket_namespace` | ForceNew | not set (computed) | general purpose bucket | ✓ |
| `object_lock_enabled` | replacement when it goes false → true | not set | `ObjectLockConfigurationNotFoundError` (off) | ✓ |
| region | — | provider `us-east-1` | `BucketRegion: us-east-1` | ✓ |

### `aws_lambda_function.*` (`get-function-configuration`)

| Attribute | Effect of a change | builder | mailer | parser |
|---|---|---|---|---|
| `function_name` | ForceNew | `peach-report-builder` ✓ | `peach-report-mailer` ✓ | `peach-agenda-parser` ✓ |
| `package_type` | ForceNew | `Image` = live `Image` ✓ | default `Zip` = live `Zip` ✓ | `Image` = live `Image` ✓ |
| `tenancy_config` | ForceNew | not set = live `null` ✓ | not set = live `null` ✓ | not set = live `null` ✓ |
| `durable_config` | replacement when added or removed | not set = live `null` ✓ | not set = live `null` ✓ | not set = live `null` ✓ |

## 5. Outputs for the Makefile, scripts and frontend

| Where it is read now | CFN output | `outputs.tf` |
|---|---|---|
| `Makefile` `deploy-frontend` → `VITE_COGNITO_AUTHORITY`; `deploy-backend` → `COGNITO_AUTHORITY`; `deploy-ai` → `CognitoAuthority` | `Authority` | `authority` ✓ |
| the same targets → `VITE_COGNITO_CLIENT_ID`, `COGNITO_CLIENT_ID`, `CognitoClientId` | `ClientId` | `client_id` ✓ |
| `Makefile` `deploy-frontend` → `VITE_COGNITO_DOMAIN` | `HostedDomain` | `hosted_domain` ✓ |
| `Makefile` `deploy-frontend` → `VITE_AGENDA_PARSER_URL`; `parser-url` | `ParserUrl` | `parser_url` ✓ |
| `scripts/deploy-auth.sh` | `UserPoolId` | `user_pool_id` ✓ |
| `scripts/report-now.sh` | `QueueUrl` | `queue_url` ✓ |
| not read anywhere, kept for parity with the stacks | `BucketName`, `DlqUrl`, `BuilderFunction`, `FunctionName` | `bucket_name`, `dlq_url`, `builder_function`, `parser_function_name` ✓ |

The frontend reads only `VITE_*` (`VITE_API_URL`, `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_CLIENT_ID`,
`VITE_COGNITO_DOMAIN`, `VITE_AGENDA_PARSER_URL`), and the Makefile fills them in. `VITE_API_URL` does not come from
the stacks. The output values have the same format as before: `authority` = `https://<user pool endpoint>`,
`hosted_domain` = `https://<prefix>.auth.us-east-1.amazoncognito.com`.
The Makefile and the scripts still read CloudFormation (`describe-stacks`); switching them to `terraform output -raw`
is a separate step after the cutover.

## 6. Formatting and validation

```
$ terraform fmt -check -recursive    # exit 0, no files listed
$ terraform validate
Success! The configuration is valid.
```

## Changes made

None. No finding needed a code change.

## Non-blocking notes

1. `data.aws_iam_policy_document.lambda_assume` is declared in `reports.tf` but also used in `ai.tf`. If
   `reports.tf` is ever split off, `ai.tf` breaks. It can be moved to a shared file. The parser role name is
   also written straight into `ai.tf`, while `reports.tf` keeps its generated names in `locals`.
2. `DATABASE_URL` in `aws_lambda_function.builder` contains `var.db_password`, so Terraform hides the whole
   `environment` block in plan output. The password is also stored in state; the state lives in HCP Terraform
   (`peach-dev`).
3. `aws_db_instance.reports` has `ignore_changes = [password]`: a wrong `db_password` will not show up in the
   plan. It only appears when the builder fails to connect (after an `apply` with a new `DATABASE_URL`).
4. Expected changes in the first plan after import (not errors): the `ManagedBy = terraform` tag from
   `default_tags`; an in-place update of the mailer code (`source_code_hash` of the zip built by `archive_file`); 3
   `aws_lambda_permission` and `aws_s3_bucket_notification` will be **created** (the "Recreate" resources).

## Update after `imports.tf` (2026-10-30)

- The three `aws_lambda_permission` now use the **CFN `statement_id`s** and are imported, not recreated:
  the stacks were deleted with `Retain`, so their statements stayed. The difference in section 2 is gone.
- `aws_lambda_permission.mailer_s3` takes the function **name** (import records the name, and an ARN forced
  replacement). `aws_s3_bucket_notification.reports` takes the function ARN directly and orders itself after the
  permission with `depends_on`, because nothing in it refers to the permission.
- Other changes made to reach a plan with no replacements (details in the run history of `peach-dev`):
  `generate_secret` removed from the app client (ForceNew, not returned by the API; it caused `-/+` of the client and
  of the branding); `max_message_size = 1048576` on both queues; `ManagedBy` removed from `default_tags` until after
  the import, and an `aws.untagged` provider for the 5 resources that have no tags in AWS; `ignore_changes` on the
  mailer code; `skip_final_snapshot = true` and `prevent_destroy` on the database.
- Final plan: `43 to import, 1 to add, 2 to change, 0 to destroy`. The 2 changes only mark the existing
  `client_secret` and `DATABASE_URL` as sensitive (values verified equal to the live ones).

## Результат міграції

Стан на 2026-10-30. Workspace HCP Terraform `peach_katttern/peach-dev`, регіон us-east-1.

**Хронологія**

| Крок | Run / дія | Результат |
|---|---|---|
| Контрольний plan перед apply | `run-VTt7CoHWueVdZhdw` | `Plan: 43 to import, 1 to add, 2 to change, 0 to destroy.` 0 рядків `-/+`, 0 `forces replacement` |
| `terraform apply` (підтвердження `yes`) | `run-BuL8tWshXb5jQbZY` | `Apply complete! Resources: 43 imported, 1 added, 2 changed, 0 destroyed.` |
| plan після apply | `run-QRD9yZRgX9bBo2AN`, вивід у [plan-no-changes.txt](plan-no-changes.txt) | `No changes. Your infrastructure matches the configuration.` |
| Видалення `imports.tf`, `auth.yml`, `reports.yml`, `ai.yml`, ще один plan | `run-WD3MVpuGZn5F8iPi` | `No changes.` |

**Імпортовано: 43 ресурси**, тобто всі 30 ресурсів трьох колишніх стеків (5 + 18 + 7) у 43 адресах Terraform:

- `peach-auth`: 5. User pool, Google IdP, app client, домен, managed login branding.
- `peach-reports`: 29. Дві SG і три правила SG окремими ресурсами, DB subnet group, RDS, S3 endpoint, бакет і два
  його child-ресурси (public access block, lifecycle), дві черги і redrive policy, чотири ролі з inline-політиками та
  attachments, три log groups, дві функції, event source mapping, розклад, дозвіл S3 → mailer.
- `peach-ai`: 9. Роль, inline-політика й attachment, log group, функція, Function URL, два дозволи Function URL, бюджет.

**Створено заново: 1 ресурс**, `aws_s3_bucket_notification.reports`.

**Змінено: 2 ресурси** (`aws_cognito_identity_provider.google`, `aws_lambda_function.builder`). Змінилась лише
позначка sensitive у state для `client_secret` і `DATABASE_URL`. В AWS нічого не змінилось: у функції той самий
`LastModified` (2026-10-15), у IdP той самий `LastModifiedDate` (2026-10-28), секрет Google збігається з `.env`.

### Чому перестворення було безпечним

У плані немає жодного `destroy` і `-/+`, тож жоден ресурс з даними чи ідентичністю (user pool, клієнт, домен, бакет,
RDS, черги, функції) не видалявся. «Створено» лише bucket notification, і це безпечно з трьох причин:

1. **Це не окремий об'єкт, а налаштування бакета.** `PutBucketNotificationConfiguration` перезаписує всю
   конфігурацію повідомлень бакета. Terraform записав ту саму конфігурацію, що вже стояла:
   `s3:ObjectCreated:*` → `peach-report-mailer`, prefix `reports/`, suffix `.csv`. Після apply
   `get-bucket-notification-configuration` показує той самий target.
2. **Немає вікна, коли S3 не може викликати mailer.** Дозвіл `peach-reports-MailerPermission-vMOOokPSMEMt`
   імпортовано, а не перестворено, і `depends_on` гарантує, що нотифікація записується лише після нього.
3. **Даних у ньому немає.** Звіти лежать у бакеті, і їх не зачеплено: після apply всі 5 CSV на місці
   (`reports/2026-W39.csv` … `2026-W43.csv`).

Три `aws_lambda_permission`, які спершу планували створити заново, зрештою **імпортовано**. Через
`DeletionPolicy: Retain` їхні statements залишились після видалення стеків, і нові створили б дублікати. Тепер у
політиках функцій по одному statement на дозвіл.

**Захист від випадкового видалення в Terraform:** `prevent_destroy` на user pool, бакеті з репортами і RDS.
`client_id` (`18a2au33rm9n9t9eck3g9ja3ve`), user pool ID, URL парсера й URL черги не змінились, тож фронтенд,
бекенд на ECS і парсер працюють без переналаштування.

### Перевірка після apply

| Що | Результат |
|---|---|
| `cognito-idp list-users --max-items 5` | 5 користувачів на місці, з них 2 через Google (`EXTERNAL_PROVIDER`) |
| `s3 ls s3://peach-reports-470115905916/` | 5 звітів `reports/2026-W39…W43.csv` |
| `lambda get-function-configuration` | `peach-report-builder`, `peach-report-mailer`, `peach-agenda-parser`: `Active`, `Successful`, `LastModified` як до міграції |
| Парсер без токена | 401, як і має бути |
| API через CloudFront без токена | 401 |
| OIDC discovery user pool | 200 |

### Що лишилось зробити

- `Makefile` (`deploy-ai`, `cfn-lint`, `cognito_output`, `ai_output`), `scripts/deploy-auth.sh` і
  `scripts/report-now.sh` досі звертаються до видалених стеків або шаблонів. Їх треба перевести на
  `terraform output -raw …` і `terraform apply`.
- Розділ «Deployed reality» в `CLAUDE.md`, `PROJECT.md` і ADR 0006 досі описують CloudFormation.
- Тег `ManagedBy = "terraform"` свідомо не додано під час import. Це окрема зміна, яка покаже `~ tags_all`
  на 24 ресурсах.

# Lab 7: відповіді (Part 2, кроки 5 і 7)

Дані: [infra/migration/](../../infra/migration/) (inventory, import map, review з розділом «Результат міграції»,
[plan-no-changes.txt](../../infra/migration/plan-no-changes.txt)), рішення — [ADR 0007](../adr/0007-terraform.md).

## Крок 5. Drift

**Що робили.** Вручну змінили timeout парсера (`peach-agenda-parser`) з 30 на 60 с і запустили в HCP Terraform
New run → Plan only. Plan показав `~ timeout = 60 -> 30`. Наступний apply повернув 30.

**Що, якби це був справжній фікс о 23:00.** Наступний apply його скасував би, бо для Terraform код — це істина,
а ручна зміна — drift. Правильно було б так:

1. Якщо дозволяє час, внести фікс одразу через PR в `infra/`: plan у check, merge, apply.
2. Якщо фікс робили в консолі, щоб загасити пожежу, **того ж вечора** відкрити PR, який записує те саме значення
   в `.tf`. Plan цього PR має показати `No changes`: код наздогнав реальність, і наступний apply нічого не відкотить.
3. Поки PR не змерджено, нічого не застосовувати в цьому workspace, щоб випадковий apply не відкотив фікс.

Фікс має жити в коді (`infra/ai.tf`) і в історії PR, а не лише в AWS.

## Крок 7

### 1. Скільки імпортовано, скільки перестворено

**43 імпортовано, 1 перестворено, 0 знищено.** Це всі 30 ресурсів трьох стеків у 43 адресах Terraform.
Перестворено лише `aws_s3_bucket_notification.reports`, і це безпечно:

- це не окремий об'єкт, а налаштування бакета. `PutBucketNotificationConfiguration` переписав ту саму конфігурацію
  (`s3:ObjectCreated:*` → mailer, `reports/`, `.csv`);
- дозвіл S3 → mailer імпортовано, а `depends_on` ставить нотифікацію після нього, тож вікна без виклику mailer не було;
- даних у нотифікації немає, і всі звіти в бакеті лишились на місці.

Три `aws_lambda_permission` спершу планували перестворити, але їх **імпортовано**. Через `Retain` старі statements
пережили видалення стеків, і нові дали б дублікати.

### 2. Атрибут, що форсує заміну

- **User pool:** `username_attributes = ["email"]` (так само `alias_attributes`, а `schema` провайдер узагалі
  не дає змінити). Зміна створить **новий** пул із новим ID. Що станеться з користувачами:
  - усі 5 користувачів зникнуть разом зі старим пулом, а паролі експортувати неможливо;
  - Google-користувачі зможуть увійти знову, але отримають новий `sub`, і їхні зустрічі (`meetings.owner_sub`)
    перестануть їм показуватися;
  - фронтенд, бекенд і парсер мають вшитий старий `client_id` / authority, тож вхід зламається до перезбірки.

  Від цього захищає `prevent_destroy`: plan із заміною пулу завершиться помилкою.
- **Бакет звітів:** `bucket` (ім'я). Нове ім'я означає новий порожній бакет. Старий з 5 звітами Terraform спробує
  знищити:
  - без `force_destroy` destroy впаде на `BucketNotEmpty`, і apply зупиниться на півдорозі;
  - з `force_destroy` звіти пропали б.

  Від цього теж захищає `prevent_destroy`.

### 3. Де зберігається Google client secret

| Де | Як видно | Хто може побачити |
|---|---|---|
| Google Cloud Console (OAuth client) | у відкритому вигляді | власники/редактори Google-проєкту |
| Cognito, IdP Google (`provider_details.client_secret`) | `describe-identity-provider` повертає його відкритим | будь-хто в AWS-акаунті з `cognito-idp:DescribeIdentityProvider` |
| HCP Terraform, змінна workspace (Sensitive) | write-only, не читається ні в UI, ні через API | ніхто, адміни можуть лише перезаписати |
| **HCP Terraform, state** | **відкритим текстом** | учасники організації з доступом до state, будь-хто з `terraform state pull` |
| Локальний `.env` (gitignored) | відкритим | будь-хто з доступом до ноутбука або його бекапу |
| Plan і логи run | `(sensitive value)` | — |
| Git | немає | — |

Найімовірніші витоки: **state** (`state pull`, завантаження state-файла, надто широкий доступ до організації),
**IAM-права на Cognito** в AWS-акаунті та **`.env`** на ноутбуці.

### 4. Два `terraform apply` одночасно

**З remote state** в HCP Terraform runs одного workspace стоять у **черзі**: кожен run бере lock на state, і другий
чекає, поки закінчиться перший. Другий після цього складає план від уже оновленого state, тож не працює зі
застарілою копією. З S3-бекендом ту саму роль грає lock-файл.

**З локальним `terraform.tfstate` у Git** кожен застосовує зміни від своєї копії, і lock-а немає:

- обидва створять ресурси, яких немає в їхній копії. Виходять дублікати або помилки «already exists»;
- один apply перетре зміни іншого;
- два різні state-файли конфліктуватимуть при merge;
- state зі секретами (див. п. 3) опиниться в Git.

### 5. Вужча trust policy

Лише workspace `peach-dev`; plan і apply можна розділити на дві ролі:

```json
"Condition": {
  "StringEquals": { "app.terraform.io:aud": "aws.workload.identity" },
  "StringLike": {
    "app.terraform.io:sub": "organization:peach_katttern:project:*:workspace:peach-dev:run_phase:*"
  }
}
```

Ще вужче: роль для `run_phase:plan` з read-only правами і окрема роль для `run_phase:apply`. Для цього в
workspace задаються `TFC_AWS_PLAN_ROLE_ARN` і `TFC_AWS_APPLY_ROLE_ARN`.

Що workspace справді використовує, тобто чим замінити `AdministratorAccess`:

- **Cognito:** `cognito-idp:*` на пул `us-east-1_Mxjm62BAS`;
- **Lambda:** `lambda:*` на `peach-report-*` і `peach-agenda-parser` (функції, URL, дозволи, event source mapping);
- **IAM:** `iam:GetRole`, `iam:UpdateAssumeRolePolicy`, `iam:PutRolePolicy`, `iam:AttachRolePolicy`, `iam:TagRole`,
  `iam:PassRole` лише на ролі `peach-*`;
- **решта сервісів:** `s3:*` на `peach-reports-*`, `sqs:*` на `report-requests*`, `rds:*` на інстанс звітів,
  `ec2:*SecurityGroup*`/`ec2:*VpcEndpoint*`, `logs:*` на `/aws/lambda/peach-*`, `scheduler:*`, `budgets:*`.

Як керовані політики для старту підходять, наприклад, `AmazonCognitoPowerUser`, `AWSLambda_FullAccess`,
`AmazonSQSFullAccess`, а IAM краще обмежити inline-політикою з шляхами `peach-*`.

### 6. «Add a staging environment» для Claude Code

**Що має з'явитися:** PR, у якому:

- ресурси винесено в модуль (або `env` з `validation`);
- додано `stage.tfvars` з іменами, що не перетинаються з dev;
- описано новий workspace `peach-stage`;
- оновлено README;
- до PR додано `terraform plan` для stage (`+N to add`) і plan для dev (`No changes`), який доводить, що dev не
  зачеплено.

**Чого не можна дозволяти робити самостійно:**

- `terraform apply` (dev чи stage);
- створювати workspace, змінні workspace або секрети;
- змінювати bootstrap-роль, її trust policy чи права;
- `terraform import`, `state rm` / `state mv` на наявному state;
- мерджити власний PR;
- вимикати `prevent_destroy`.

Усе це залишається за людиною і проходить через PR, plan у check і apply в HCP.

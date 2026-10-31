# Peach

Спільні зустрічі з агендою: FastAPI-бекенд на ECS, React-фронтенд на S3 + CloudFront, вхід через Cognito,
щотижневий звіт (Lab 5) і AI-парсер агенди (Lab 6). Структура репозиторію описана в [PROJECT.md](PROJECT.md).

## Інфраструктура

### Де лежить код

Інфраструктура Cognito, щотижневого звіту й парсера агенди описана в Terraform у [`infra/`](infra/), регіон
us-east-1. Раніше це були CloudFormation-стеки `peach-auth`, `peach-reports`, `peach-ai`. Їх видалено, а ресурси
імпортовано в Terraform без перестворення (див. [infra/migration/review.md](infra/migration/review.md)).

| Файл | Що в ньому |
|---|---|
| `infra/versions.tf` | версії, бекенд HCP Terraform, провайдер AWS |
| `infra/auth.tf` | Cognito: user pool, Google IdP, app client, домен, branding |
| `infra/reports.tf` | щотижневий звіт: RDS, SQS, S3, Lambda builder і mailer, EventBridge Scheduler |
| `infra/ai.tf` | парсер агенди: Lambda, Function URL, бюджет |
| `infra/variables.tf`, `infra/terraform.tfvars` | змінні; у `tfvars` лише несекретні значення |
| `infra/outputs.tf` | значення, які читає `Makefile` (`terraform output -raw …`) |

State і запуски живуть у **HCP Terraform**: організація `peach_katttern`, workspace `peach-dev`, режим remote
execution. Plan і apply виконуються на серверах HCP. До AWS вони звертаються через OIDC-роль
`hcp-terraform-peach_katttern`, без довгоживучих ключів. Саму роль і OIDC-провайдер створює окремий
bootstrap-проєкт з локальним state, і в цьому репозиторії його немає.

Поза Terraform поки лишаються: бекенд на ECS (eu-north-1), фронтенд-бакет і CloudFront, ECR-репозиторії.
Їх деплоять таргети `make deploy-backend`, `make deploy-frontend`, `make lambda-image`.

### Хто і як застосовує зміни

Змін в AWS з ноутбука не застосовують: у `Makefile` навмисно немає таргету з `terraform apply`.

1. **PR** зі зміною в `infra/`.
2. **Plan у check PR.** HCP Terraform робить speculative plan, і його результат видно в PR. Рев'юер дивиться,
   що в плані немає несподіваних `destroy` / `-/+`. `prevent_destroy` стоїть на user pool, бакеті зі звітами
   і RDS.
3. **Merge** у `main`.
4. **Apply в HCP Terraform.** Після merge HCP запускає run на `main`, а apply підтверджує людина в UI
   workspace (`auto-apply` вимкнено).

Workspace `peach-dev` підключений до `katttern/Peach` (Settings → Version Control): working directory
`infra`, гілка `main`, automatic speculative plans увімкнено, apply method — manual. Рішення та альтернативи
описано в [ADR 0007](docs/adr/0007-terraform.md).

### Як запустити plan локально

```sh
terraform login          # один раз: токен HCP Terraform у ~/.terraform.d/credentials.tfrc.json
make infra-init          # terraform -chdir=infra init
make infra-fmt           # fmt -check -recursive
make infra-validate
make infra-plan          # plan виконується в HCP із змінними й доступом workspace
```

Для `infra-plan` локальні AWS-ключі не потрібні: run отримує доступ через OIDC-роль workspace. Після apply plan має
показувати `No changes. Your infrastructure matches the configuration.`

### Де живуть секрети

- **Змінні workspace `peach-dev` в HCP Terraform.** Секрети `google_client_secret` і `db_password`
  (terraform-змінні, *Sensitive*) і `TFC_AWS_PROVIDER_AUTH`, `TFC_AWS_RUN_ROLE_ARN` (env). У `infra/*.tf` і
  `terraform.tfvars` секретів немає, і вони там не з'являються.
- **State.** Він теж містить секрети у відкритому вигляді: `client_secret` Google, пароль у `DATABASE_URL`
  builder. State зберігається в HCP. Доступ до нього мають лише учасники організації. Не завантажуйте state і
  не викладайте вивід `terraform state pull`/`show`.
- **Локально.** `.env` (у `.gitignore`) — лише для локальних інструментів, Terraform його не читає.

### Порядок, коли зміна торкається і інфраструктури, і застосунку

- **Застосунку потрібне щось нове з інфраструктури** (новий ресурс, output, дозвіл, змінна середовища Lambda):
  спершу PR з `infra/` → merge → apply. Потім деплой застосунку: `make deploy-frontend` / `make deploy-backend`
  читають нові значення через `terraform output`.
- **Новий код Lambda** (builder або парсер): `make lambda-image` збирає й пушить образ з тегом git sha, потім PR, що
  міняє `report_builder_image_uri` / `parser_image_uri` у `infra/terraform.tfvars` → merge → apply.
- **Інфраструктура щось прибирає, чим користується застосунок:** спершу деплой застосунку, який цим більше
  не користується, і лише потім PR з видаленням в `infra/`.
- **Зміна Cognito, від якої залежать токени** (клієнт, домен, callback URLs): після apply перезберіть фронтенд
  (`make deploy-frontend`), бо `VITE_COGNITO_*` вшиваються в бандл під час збірки.

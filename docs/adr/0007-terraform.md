# ADR 0007: Інфраструктура проєкту в Terraform і HCP Terraform замість CloudFormation

- **Статус:** Прийнято, 2026-10-31 (чернетка тексту, TODO: рев'ю команди)
- **Учасники рішення:** команда Spry (Lab 7)
- **Замінює:** CloudFormation-стеки `peach-auth` (Lab 4), `peach-reports` (Lab 5), `peach-ai` (Lab 6)
- **Пов'язане:** [infra/](../../infra/), [inventory](../../infra/migration/cfn-inventory.md), [import map](../../infra/migration/import-map.md), [review → «Результат міграції»](../../infra/migration/review.md#результат-міграції), [README → «Інфраструктура»](../../README.md#інфраструктура), [ADR 0006](0006-llm-agenda-parsing.md)

## Контекст

Cognito, щотижневий звіт і парсер агенди були описані трьома CloudFormation-шаблонами в us-east-1. Разом це
**30 ресурсів**: 5 + 18 + 7. Шаблони деплоїли з ноутбука (`make deploy-auth`, `make deploy-ai`), а шаблон звітів —
окремо. Інвентаризація перед міграцією показала, що `infra/reports.yml` у репозиторії **не відповідав**
задеплоєному стеку: живий стек мав власну RDS і не мав SES-ідентичностей. Деплой файлу з репозиторію видалив би базу.

Проєкт уже виходить за межі AWS: Google OAuth-клієнт для входу, репозиторій на GitHub. Попереду ще друге
середовище.

## Рішення

Уся інфраструктура цих трьох стеків тепер описана в Terraform в одному root-модулі `infra/`: `versions.tf`,
`variables.tf`, `auth.tf`, `reports.tf`, `ai.tf`, `outputs.tf`, `terraform.tfvars`.

- Провайдер `hashicorp/aws ~> 6.0`. Через `default_tags` усі ресурси отримують теги `PROJECT_NAME` і
  `ManagedBy = "terraform"`.
- State і запуски живуть у **HCP Terraform**: організація `peach_katttern`, workspace `peach-dev`, remote execution.
- Наявні ресурси **імпортовано, а не створено заново**. Спершу стеки отримали `DeletionPolicy: Retain` і були
  видалені, потім ресурси імпортовано import-блоками.

### 1. Чому Terraform, а не CloudFormation, CDK чи OpenTofu

- **Не CloudFormation.** Він працює лише з AWS. Google OAuth-клієнт і GitHub не потраплять в один план з
  AWS-ресурсами. Попередній перегляд змін у CloudFormation (change set) — необов'язковий крок, тоді як у Terraform
  `plan` є центром рев'ю: його бачать у PR до того, як щось зміниться. Розходження шаблону зі стеком
  (`reports.yml`) ніхто не помітив, а Terraform показує drift у кожному plan.
- **Не CDK.** Він генерує той самий CloudFormation, тож має ту саму межу «лише AWS» і ті самі стеки, плюс ще одну
  мову зверху.
- **OpenTofu — сумісна альтернатива.** Він читає ту саму HCL і впорався б із цим проєктом. Обрано Terraform, бо
  HCP Terraform дає все в одному місці: backend зі state, блокуванням і версіями, runner, VCS-запуски і
  OIDC-доступ до AWS. Перейти на OpenTofu пізніше дешево: код `.tf` не переписується, змінюється лише бінарник
  і backend.
- **Друге середовище.** У Terraform воно матиме той самий код з іншими змінними і власним state (окремий
  workspace). TODO: дизайн stage-середовища ще не описано.

### 2. Хто може змінювати інфраструктуру і як

1. **PR** зі зміною в `infra/` може відкрити будь-хто в команді.
2. HCP Terraform запускає **speculative plan**, і його результат з'являється як **check у PR**.
3. **Рев'ю плану**, а не лише diff коду: чи немає `destroy`, `-/+`, `forces replacement`. Від помилкового видалення
   user pool, бакета звітів і RDS захищає `prevent_destroy`.
4. **Merge у `main`**, після чого HCP Terraform сам ставить run у чергу.
5. **Apply у HCP Terraform** після ручного підтвердження людиною (auto-apply вимкнено). Run отримує короткочасні
   AWS-креденшли через **OIDC-роль** `hcp-terraform-peach_katttern`, без збережених ключів.

**Apply з ноутбука неможливий:** workspace підключений до GitHub, і HCP відхиляє `terraform apply` з CLI
(`Apply not allowed for workspaces with a VCS connection`). У `Makefile` є лише `infra-init`, `infra-fmt`,
`infra-validate` і `infra-plan`, таргету з apply немає.

**Роль агента (Claude Code):** він пише `.tf`, запускає `terraform plan` і готує PR, але **не застосовує зміни**.
Apply проходить той самий шлях: рев'ю плану людиною, merge, підтвердження в HCP.

### 3. Де опиняються секрети

- `google_client_secret` і `db_password` — **sensitive змінні workspace** `peach-dev` в HCP Terraform. У `.tf` і
  `terraform.tfvars` їх немає.
- `sensitive = true` **ховає значення лише у виводі plan і apply**. У **state** вони лежать **відкритим текстом**:
  `client_secret` у Google IdP, пароль усередині `DATABASE_URL` функції builder.
- State зберігається в HCP. **Доступ до нього має кожен, хто має доступ до workspace**, зокрема через
  `terraform state pull`. TODO: перелік учасників організації і їхніх прав.
- **У репозиторії немає** AWS-ключів (доступ через OIDC) і жодних секретів у `.tf` чи `.tfvars`.

### 4. Що, якщо HCP Terraform недоступний

- **Створена інфраструктура працює далі.** Cognito, Lambda, RDS, S3 і SQS не залежать від HCP.
- **Змінити інфраструктуру тимчасово неможливо**: немає plan, apply і читання state. `make deploy-frontend` і
  `deploy-backend` беруть значення через `terraform output`, тож без них ці деплої теж стоять.
- **Аварійний шлях**, щойно доступ до state відновиться: перемкнути workspace у Local execution і працювати
  з власними креденшлами, а перед ризикованою зміною зробити резервну копію через `terraform state pull`.
- HCP зберігає **версії state**, тож попередню версію можна знайти й порівняти.

## Розглянуті альтернативи

| Альтернатива | Чому ні |
|---|---|
| Залишити CloudFormation | Лише AWS. Попередній перегляд змін (change set) необов'язковий. Розходження шаблону зі стеком залишилося непоміченим. |
| AWS CDK | Той самий CloudFormation під капотом: та сама межа «лише AWS», плюс додаткова мова. |
| OpenTofu | Сумісний і придатний. Обрано Terraform через HCP Terraform (backend і runner в одному). Перехід на OpenTofu пізніше дешевий. |
| Terraform без HCP, з локальним state | State із секретами на ноутбуці, без блокування й історії версій. Підходить лише для експериментів. |

## Наслідки

- **Міграція без втрат:** 30 CFN-ресурсів стали 44 ресурсами Terraform. **43 імпортовано**, **1 перестворено**
  (`aws_s3_bucket_notification.reports`, налаштування бакета з тим самим вмістом), **0 знищено**. Після apply
  plan показує `No changes`.
- **Технічний борг:** bootstrap-роль `hcp-terraform-peach_katttern` має **AdministratorAccess**, а її trust
  дозволяє **будь-який workspace** організації. Треба звузити `sub` до `peach-dev` і замінити права на потрібні.
  TODO: конкретний набір політик.
- **Автоматичного rollback немає.** Якщо apply упав на півдорозі, частину змін уже застосовано. Виправлення —
  ще один коміт і apply.
- **Безпеку state забезпечуємо самі:** доступ до HCP-організації треба обмежувати, бо state містить секрети.
- Поза Terraform поки лишаються ECS-бекенд, фронтенд-бакет із CloudFront і ECR.

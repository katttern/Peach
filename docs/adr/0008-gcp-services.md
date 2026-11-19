# ADR 0008: Spry на Google Cloud — сервіс для кожної частини

- **Статус:** Прийнято, 2026-11-19. Конфігурацію `gcp/` перевірено через `init`/`validate`, у GCP не застосовано
  (Lab 9 здається без GCP-акаунта, див. [docs/lab9/answers.md](../lab9/answers.md))
- **Учасники рішення:** команда Spry (Lab 9)
- **Пов'язане:** [gcp/](../../gcp/), [firebase.json](../../firebase.json), [ADR 0007](0007-terraform.md),
  [ADR 0006](0006-llm-agenda-parsing.md), [вартість](../lab9/answers.md#part-3-вартість)

## Контекст

Spry працює на AWS. Курс описує Lab 4 як Lambda + Aurora, але насправді в акаунті (див. `CLAUDE.md`) розгорнуто інше:

- **API:** FastAPI на **ECS Fargate** (eu-north-1, 0.5 vCPU / 1 GB, працює цілодобово) за ALB. Образ
  `backend/Dockerfile` — звичайний uvicorn, **Lambda-адаптера (Mangum, Web Adapter) у ньому немає**.
- **БД API:** PostgreSQL 16 **sidecar-контейнером у тій самій таскі, без тому**. Дані зникають при кожному
  рестарті. Aurora немає.
- **Фронтенд:** S3 + CloudFront, `/api/*` іде через CloudFront на ALB (один origin).
- **Вхід:** Cognito з Google IdP. **Звіт (Lab 5):** Lambda + власна RDS + SQS + EventBridge Scheduler + SES.
  **Парсер агенди (Lab 6):** Lambda + Bedrock (Nova Pro).

Мета Lab 9 — перенести на GCP ядро застосунку: фронтенд, API і базу. Вхід, звіт і парсер поки лишаються на AWS.

## Рішення по кожному рядку

| Spry на AWS | На Google Cloud | Рішення | Чому |
|---|---|---|---|
| S3 + CloudFront, static frontend | **Firebase Hosting** | **замінити** | CDN і сертифікат входять у безкоштовний план. Rewrite `/api/**` → Cloud Run дає один origin без CORS, як CloudFront зараз. Сам бакет Cloud Storage не дає HTTPS на своєму домені без load balancer з погодинною оплатою |
| ECS Fargate + ALB, FastAPI | **Cloud Run** | **замінити** | Той самий образ `backend/Dockerfile`, змінено лише порт (`$PORT`). Масштабується до нуля, HTTPS-URL входить. ALB не потрібен, а він разом із 4 публічними IPv4 — найдорожча частина нинішнього AWS-рахунку |
| ECR `peach-backend` | **Artifact Registry** | **замінити** | 0.5 GB безкоштовно. Cleanup policy лишає 5 останніх образів |
| Postgres-sidecar (Lab 4 у курсі: Aurora Serverless v2) | **Cloud SQL for PostgreSQL 16, db-f1-micro, 10 GB SSD**, зупиняється між використаннями | **замінити** | Див. «База даних» нижче |
| DynamoDB | Firestore | **не застосовно** | Spry не переходив на NoSQL. Firestore розглянуто як альтернативу Cloud SQL і відхилено |
| Cognito user pool + Google IdP | Identity Platform | **поки лишити на AWS** | API вже перевіряє Cognito access-токени, і Cloud Run це може робити так само. `https://<project>.web.app/` треба лише додати в callback URLs клієнта. Перехід на Identity Platform (50 000 MAU безкоштовно проти 10 000) — stretch: змінюються `app/auth.py` і `oidc-client-ts`, а користувачі мають заново увійти, бо `sub` інший і `meetings.owner_sub` не збігатиметься |
| EventBridge Scheduler | Cloud Scheduler | **поки лишити** (звіт лишається на AWS) | Коли звіт переїде: 1 job із 3 безкоштовних |
| SQS | Pub/Sub (push у Cloud Run) | **поки лишити** | Черга одна, між builder і mailer. На GCP це Pub/Sub push-підписка на Cloud Run endpoint |
| S3 event → Lambda | Cloud Storage + Eventarc → Cloud Run | **поки лишити** | Разом зі звітом |
| SES | **лишити SES** | **лишити** | Див. «E-mail» нижче |
| Bedrock (Nova Pro; Claude заблоковано) | Vertex AI (Gemini, Claude у Model Garden) | **поки лишити** | Парсер — окрема Lambda з Function URL, фронтенд кличе її напряму, і API від неї не залежить. Stretch: Gemini на Vertex AI, порівняти відповідь і ціну |
| SSM / змінні workspace | **Secret Manager** | **замінити** | Пароль БД генерує Terraform (`random_password`) і кладе у два секрети: `spry-db-password` для людей і `spry-database-url`, який читає Cloud Run. Разом 2 версії з 6 безкоштовних |
| CloudWatch Logs | Cloud Logging | **замінити** (автоматично) | stdout Cloud Run потрапляє туди сам. Рядки `Running upgrade ...` від Alembic видно так само |
| IAM roles, OIDC-роль HCP | **Service accounts + Workload Identity Federation** | **замінити** | `spry-api` лише з `cloudsql.client` і доступом до свого секрету. Ні default compute SA (з Editor), ні JSON-ключів. Terraform SA створюється bootstrap'ом, як AWS-роль у `~/tf-bootstrap` |
| Terraform `aws`, workspace `peach-dev` | Terraform `google`/`google-beta`, **окремий workspace `peach-gcp`**, тека `gcp/` | **замінити поруч** | Один plan не може зламати обидві хмари. Код той самий HCL, але state окремий |

### База даних

Розглянуто чотири варіанти:

| Варіант | Затримка | Рахунок (місяць) | Код |
|---|---|---|---|
| Cloud SQL цілодобово | ~1 мс у регіоні, з'єднання через Unix-сокет `/cloudsql` | $7.67 + $1.70 = **$9.37** | без змін: SQLAlchemy + Alembic, змінюється лише `DATABASE_URL` |
| **Cloud SQL, зупинений поза використанням** (`db_activation_policy = "NEVER"`) | та сама, але після старту екземпляра ~1–2 хв, поки він підніметься | **$1.70** + $0.0105/год роботи | без змін |
| Firestore | ~10 мс, без холодного старту БД | **$0** на студентському трафіку | переписати моделі, міграції й запити. `meetings` → `agendas` — це зв'язок, який стає дублюванням або другим читанням |
| БД лишається на AWS, API на GCP | +100–150 мс на **кожен** запит (us-central1 ↔ eu-north-1), кілька запитів на сторінку | ще й egress з обох боків. До того ж нинішня БД — sidecar без мережевого доступу ззовні, тож її довелося б винести в RDS | без змін у коді, але треба відкрити БД в інтернет або налаштувати VPN |

**Обрано Cloud SQL db-f1-micro, який зупиняється між демо.** Spry — реляційний застосунок: зустрічі, агенди,
`owner_sub`, міграції 0001–0003. Firestore заощадив би ~$1.70–9 на місяць ціною переписаного шару даних. Це погана
угода для навчального проєкту, у якого вся логіка в SQL. Крос-хмарна БД додає затримку до кожного запиту і нічого не
спрощує.

**Дані:** `pg_dump` не робимо. На AWS база — sidecar без тому, тож переносити нічого: вона порожніє при кожному
деплої. Схему створюють міграції, бо Dockerfile CMD запускає `alembic upgrade head` при старті контейнера.

### E-mail

Лишаємо **SES в us-east-1**. Mailer (Lab 5) лишається на AWS разом зі звітом, а мультихмарна архітектура
дозволена. Якщо звіт переїде на Cloud Run, пошту надсилатиме SendGrid/Mailgun або той самий SES через API-ключ.
Ключ зберігатиметься в **Secret Manager** (секрет `spry-mail-api-key`), Cloud Run отримуватиме його як змінну з
`secret_key_ref`, як зараз `DATABASE_URL`. У репозиторії й tfvars ключа не буде.

### Що не переносимо і чому

- **Парсер агенди (Bedrock).** Промпт, тести й пост-обробка (ADR 0006) прив'язані до Converse/Nova. Модель на
  Vertex AI — це новий промпт-тюнінг і нова таблиця тестів. Крім того, trial-кредит GCP не покриває partner-моделі
  (Claude), а AI Studio Gemini не оплачується з кредиту.
- **Щотижневий звіт.** Lambda + SQS + S3 + SES + власна RDS — найбільша частина AWS. Перенесення означає 4 нові
  сервіси заради функції, яку бачить один отримувач раз на тиждень.
- **Cognito.** Його перенесення змушує всіх увійти заново й ламає зв'язок `owner_sub` з даними. Токени Cognito
  чудово перевіряються з будь-якої хмари.

## Наслідки

- Lock-in виявився **не в compute**: образ API переїхав, змінився лише порт. Він у **даних і керованих сервісах
  довкола**: Cognito (`sub`), Bedrock (промпти), SES. Те, що лишилось на AWS, — саме ці сервіси.
- Система стає **мультихмарною**: браузер → Firebase → Cloud Run → Cognito JWKS (us-east-1, кешується в процесі,
  тож лише на холодному старті). Парсер кличеться з браузера напряму в AWS. Egress мізерний.
- Cloud SQL **не засинає**: зупиняти його — ручна дія (`db_activation_policy`) або Cloud Scheduler. Забута ввімкнена
  база коштує $7.67 на місяць, і це головна стаття рахунку.
- `deletion_protection = false` і вимкнені бекапи навмисні: дані тестові, а `terraform destroy` має прибрати все.
- **Застосування:** коли буде GCP-проєкт, треба створити workspace `peach-gcp`, Terraform SA і WIF для HCP, потім
  `terraform apply` → `make`-збірка образу в Artifact Registry → `firebase deploy --only hosting`, і додати
  `https://<project>.web.app/` у Cognito callback/logout URLs (PR в `infra/auth.tf`).

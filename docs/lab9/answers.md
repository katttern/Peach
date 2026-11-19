# Lab 9: відповіді

Маршрут: **без GCP-акаунта** (розділ «What you submit (in case no GCP account)»). Умова: [lab9.pdf](../labs/lab9.pdf),
ноутбук: [lab9/](../../lab9/). Рішення по сервісах: [ADR 0008](../adr/0008-gcp-services.md). Пакет для здачі:
[submission/](submission/).

## Part 1. Сервіси

Див. [ADR 0008](../adr/0008-gcp-services.md): таблиця keep/replace/drop, база даних, e-mail і що не переносимо.

## Part 2. Ядро Spry, готове до Cloud Run

| Крок | Що зроблено | Де |
|---|---|---|
| 1. `gcp/` | Окремий root-модуль, провайдери `google`/`google-beta` 7.x, власний workspace `peach-gcp`. API вмикаються з Terraform | [gcp/](../../gcp/), [`init` + `validate`](terraform-init-validate.txt) |
| 2. БД | Cloud SQL PostgreSQL 16, `db-f1-micro`, 10 GB SSD, us-central1. Пароль — `random_password` → Secret Manager. Дані: **міграції на порожню базу**, бо на AWS це sidecar без тому і переносити нічого | [gcp/sql.tf](../../gcp/sql.tf), [gcp/secrets.tf](../../gcp/secrets.tf) |
| 3. API | Той самий `backend/Dockerfile` (uvicorn, Lambda-адаптера немає й не було), тепер слухає `$PORT`. Cloud Run: SA `spry-api`, Cloud SQL socket, `DATABASE_URL` із Secret Manager, `min=0`, публічний, бо API сам перевіряє токени | [backend/Dockerfile](../../backend/Dockerfile), [gcp/run.tf](../../gcp/run.tf) |
| 4. Фронтенд | Firebase Hosting, rewrite `/api/**` → `spry-api` (один origin) | [gcp/hosting.tf](../../gcp/hosting.tf), [firebase.json](../../firebase.json) |
| 5. README | Розділ «Google Cloud (Lab 9)» | [README](../../README.md#google-cloud-lab-9) |

**Локально, як Cloud Run** (замість URL у GCP):

```sh
make cloudrun-local      # postgres з docker compose + backend-образ з -e PORT=8080 -p 8080:8080
make cloudrun-frontend   # статична збірка, vite preview на :5173, /api → :8080 (як rewrite у Firebase)
make cloudrun-check      # 401 без токена, alembic_version = 0003
make cloudrun-stop
```

Перевірено 2026-11-19: контейнер стартує як PID 1 `uvicorn ... :8080`, Alembic проганяє 0001 → 0003, `GET /api/meetings`
без токена отримує `401` (і напряму на :8080, і через :5173), а `/meetings/<uuid>` віддає `index.html`.

## Part 3. Вартість

Ціни — on-demand list, USD, 730 год/міс, без податків. AWS — us-east-1, як у лабі (реальний регіон API — eu-north-1,
ціни там відрізняються на кілька відсотків). GCP — us-central1. Ціни GCP взято з умови лаби (перевірені 5.11.2026),
ціни AWS — з публічних прайсів. Перевірка: [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator),
[AWS Pricing Calculator](https://calculator.aws/).

### Наш проєкт, ніхто не користується (місяць)

| Частина | AWS — **як розгорнуто зараз** | AWS — Lab 4 (еталон з умови) | Google Cloud — **наш вибір** |
|---|---|---|---|
| Фронтенд + CDN + HTTPS | CloudFront, free tier (1 TB, 10 M запитів) → $0 | CloudFront Free plan → $0 | Firebase Hosting, безкоштовний план → $0 |
| API | ECS Fargate 0.5 vCPU / 1 GB цілодобово: $14.78 + $3.24 = **$18.02** | Lambda без запитів → $0 | Cloud Run, масштаб до нуля → $0 |
| Балансувальник | ALB $0.0225/год → **$16.43** (+ LCU, на нашому трафіку ~$0) | — | — (HTTPS входить у Cloud Run і Firebase) |
| Публічні IPv4 | 4 адреси (ALB у 3 AZ + таска) × $0.005/год → **$14.60** | — | — |
| БД, compute | sidecar у таскі → $0 (входить у Fargate) | Aurora на паузі → $0 | Cloud SQL `db-f1-micro`, **зупинений** → $0 (24/7: $7.67) |
| БД, storage | ефемерний диск таски → $0 (дані зникають) | ~1 GB × $0.10 → $0.10 | 10 GB SSD × $0.17 → **$1.70** (і в зупиненого теж) |
| Registry, секрети, логи | ECR ~1 GB → ~$0.10, CloudWatch — копійки | кілька центів | Artifact Registry ≤0.5 GB, Secret Manager 2 версії, Logging — у free tier → $0 |
| **Разом** | **≈ $49.15** | **≈ $0.30** | **≈ $1.70** (Cloud SQL зупинений) / **≈ $9.37** (Cloud SQL 24/7) |

### Чотири профілі навантаження

Однакова модель трафіку для всіх стовпців: в активні години в середньому **1 запит/с, 100 мс кожен**.
Cloud Run: 1 vCPU / 512 MiB, request-based billing (оплачується лише час, поки обробляється запит). Активний час
CPU = запити × 0,1 с. Aurora: 0,5 ACU × $0.12/ACU-год, поки не на паузі. Cloud SQL «зупинений» = запущений лише в
активні години.

| Профіль | Активних год | Запитів | AWS як зараз (ECS + ALB) | AWS Lab 4 (Lambda + Aurora) | GCP, Cloud SQL зупиняється | GCP, Cloud SQL 24/7 |
|---|---|---|---|---|---|---|
| Ніхто | 0 | 0 | **$49.15** | **$0.30** | $1.70 | $9.37 |
| Демо на парах (10 × 2 год) | 20 | 72 000 | $49.15 | **$1.50** | $1.91 | $9.37 |
| Office hours (8 год × 22 дні) | 176 | 633 600 | $49.15 | $10.86 | **$3.55** | $9.37 |
| Зайнято цілодобово | 730 | 2 628 000 | $49.15 | $44.43 | **$11.60** | $11.60 |

Звідки числа GCP: Cloud Run у перших трьох профілях укладається в безкоштовні 180 000 vCPU-с і 2 M запитів → $0. У
«цілодобово» 262 800 vCPU-с − 180 000 = 82 800 × $0.000024 = $1.99, плюс 0,63 M запитів × $0.40 = $0.25, разом
**$2.24**. Пам'ять (131 400 GiB-с) — у free tier. Cloud SQL: $0.0105 × активні години + $1.70 storage.
AWS Lab 4: Aurora $0.06/год × активні години + $0.30 база. Lambda поза free tier лише в «цілодобово» (1,63 M ×
$0.20/M = $0.33).

**Припущення free tier:** Cloud Run — 2 M запитів, 180 000 vCPU-с, 360 000 GiB-с на місяць. Firebase Hosting — 10 GB
сховища і 360 MB/день трафіку (бандл ~75 KB gzip, тобто ~4 800 «холодних» завантажень сторінки на день). Artifact
Registry — 0.5 GB (cleanup лишає 5 образів). Secret Manager — 6 активних версій і 10 000 звернень (у нас 2 версії, а
звернення — лише при старті інстансу). Cloud Logging — 50 GiB. AWS: CloudFront — 1 TB і 10 M запитів, Lambda — 1 M
запитів і 400 000 GB-с.

### Яка хмара дешевша і який рядок це вирішує

- **Проти того, що розгорнуто зараз (ECS):** GCP дешевший **у всіх чотирьох профілях**. Вирішують рядки **ALB +
  4 публічні IPv4 ($31/міс)**: вони платні незалежно від трафіку. Fargate-таска ($18), що працює завжди, додає
  решту. Навіть у «цілодобово» Cloud Run за $2.24 дешевший, бо 0.5 vCPU, які ECS тримає 730 годин, на нашому
  трафіку зайняті ~10% часу.
- **Проти еталону Lab 4 (Lambda + Aurora):**
  - *ніхто* і *демо* — **AWS** ($0.30 / $1.50 проти $1.70 / $1.91). Рядок — **storage Cloud SQL**: мінімум 10 GB SSD
    ($1.70), який оплачується й у зупиненого інстансу, проти ~1 GB Aurora.
  - *office hours* і *цілодобово* — **GCP** ($3.55 / $11.60 проти $10.86 / $44.43). Рядок — **compute БД**: година
    Aurora (0,5 ACU) коштує $0.06, а `db-f1-micro` — $0.0105, тобто в 5,7 раза менше.
  - Якщо Cloud SQL не зупиняти, GCP програє в перших двох профілях ще сильніше ($9.37): тоді вирішує рядок
    **Cloud SQL compute 24/7, $7.67**.

### Пастка на боці GCP (аналог «Aurora, яку щось тримає активною»)

В Aurora пастка в тому, що щось її будить (пул з'єднань, health check, cron), і вона ніколи не стає на паузу. На GCP
**Cloud SQL не має паузи взагалі**: пастка — **просто забути його ввімкненим**. Це $7.67 на місяць за порожню базу, а
storage платиться навіть за зупинений інстанс. Друга пастка в Cloud Run: `min_instance_count ≥ 1` або CPU always
allocated (instance-based billing). Тоді Cloud Run перестає масштабуватись до нуля і оплачується кожна секунда
(1 vCPU 24/7 ≈ $40–60/міс). Тобто це той самий «Aurora не засинає», лише на рівні API. Ping-моніторинг щохвилини,
навпаки, майже безкоштовний: 43 800 запитів × 0,1 с — у free tier, бо request-based billing не рахує час між
запитами. У нас: `min_instance_count = 0`, `cpu_idle = true`, `db_activation_policy` як змінна, а в README описано,
як зупинити базу.

## Part 4. Що ще вміє Google Cloud

Демо — у ноутбуці [lab9/](../../lab9/) (DuckDB замість BigQuery, Tesseract/EasyOCR замість Vision, Qwen3-VL 2B
замість Document AI) і в дашборді Looker Studio.

**Промпт для секції 5** — [submission/my_prompt.txt](submission/my_prompt.txt). Перевірено локально на тій самій
моделі (`qwen3-vl:2b-instruct` через Ollama, Apple M3): **A (Markdown) 8 з 9, B (зображення) 8 з 9**. Єдине хибне поле
в обох — `seller`: `Kozelnyska` замість `Kozelnytska`. Помилка вже є в Markdown із секції 4 (у збереженому прогоні
викладача на T4 — так само), тобто модель неправильно прочитала літеру на зменшеному до 868 px скані. Промпт її не
виправить без підказки відповіді. Спроба «читай назви по літерах» нічого не змінила.

**Lab 8 на GCP.** Сирі JSON-події в S3 + Glue Crawler/таблиця + Athena + CTAS у Parquet → **Cloud Storage +
BigQuery** (external table або завантаження в native-таблицю; партиціонування й кластеризація замість ручних
`dt=`-партицій і CTAS). Kinesis + consumer → **Pub/Sub + Dataflow** (той самий Beam-код для batch і streaming, з
вікнами й watermark замість власного коду вікон і `late_dropped`). QuickSight/ручні графіки → **Looker Studio** поверх
BigQuery. Більше не треба керувати: Glue-каталогом і краулером, `MSCK REPAIR`/партиціями, конвертацією в Parquet
(BigQuery зберігає колонками сам), шардами Kinesis і чекпойнтами consumer'а, бакетом для результатів Athena.

**Коли Document AI, а не загальна модель.** Document AI кращий, коли документів багато й вони однотипні (тисячі
рахунків на місяць): $1.50 за 1 000 сторінок OCR — дешевше й швидше за GPU-час для LLM. Він дає однаковий результат
щоразу, координати полів і confidence, таблиці на кількох сторінках і рукописний текст, а також SLA і регіон
обробки даних. Загальна модель краща, коли документи різні й нерегулярні (агенда з листа в Lab 6 — це не форма),
коли потрібне тлумачення, а не копіювання полів, і коли документи не можна відправляти в чужу хмару: тоді відкрита
модель локально.

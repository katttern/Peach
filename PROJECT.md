# spry — repository structure

`spry/` is a three-service monorepo for a small meetings application. This document defines its repository layout and the contracts between its parts; it does not prescribe implementation. The repository contains no service besides PostgreSQL, the backend, and the frontend.

## Running the repository

A new developer installs Docker Desktop, then runs exactly:

```sh
docker compose up
```

The root Compose file builds and starts PostgreSQL, the API, and the web UI. No other local setup or service is part of this repository.

## Root layout

```text
spry/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .gitignore
├── Makefile
├── PROJECT.md
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── app/
│   │   ├── main.py
│   │   ├── api/meetings.py
│   │   ├── api/agenda.py
│   │   ├── models/meeting.py
│   │   ├── models/agenda.py
│   │   ├── schemas/meeting.py
│   │   ├── schemas/agenda.py
│   │   ├── ai/
│   │   ├── auth.py
│   │   ├── settings.py
│   │   └── db/session.py
│   └── migrations/
│       ├── env.py
│       └── versions/
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/meetings.ts
        ├── pages/meetings-page.tsx
        └── components/
            ├── meeting-list.tsx
            ├── meeting-form.tsx
            └── ui/
```

## Root files

| Path | Purpose |
| --- | --- |
| `.github/workflows/ci.yml` | GitHub Actions workflow that runs backend and frontend lint jobs on every push. |
| `.gitignore` | Excludes locally installed frontend packages and Python bytecode from Git. |
| `Makefile` | Deployment contract: builds and publishes the frontend to S3/CloudFront and the backend image to ECR/ECS. |
| `PROJECT.md` | This structural contract. |
| `docker-compose.yml` | The complete local runtime definition: `postgres`, `backend`, and `frontend`. |

## `backend/`

`backend/` contains the FastAPI service and everything needed to persist meetings. Its Docker base image is **`python:3.12.4-slim-bookworm`**. Its dependencies are FastAPI **0.111.0**, SQLAlchemy **2.0.31**, Alembic **1.13.2**, psycopg **3.1.19**, and Uvicorn **0.30.1**. psycopg is the PostgreSQL driver; Uvicorn serves FastAPI.

| Path | Purpose |
| --- | --- |
| `Dockerfile` | Builds the backend container. |
| `pyproject.toml` | Pins the backend's Python dependencies. |
| `alembic.ini` | Alembic configuration. |
| `app/` | Backend application source; it contains HTTP, persistence, and application entry-point modules. |
| `app/main.py` | Creates the FastAPI application and mounts the API routes. |
| `app/api/` | HTTP-facing API modules. |
| `app/api/meetings.py` | Defines only the meetings HTTP endpoints. |
| `app/api/agenda.py` | Defines the per-meeting agenda endpoints (authenticated). |
| `app/auth.py` | Verifies Cognito access tokens; `require_user` FastAPI dependency. Does not import `app.db`. |
| `app/settings.py` | Environment settings (`COGNITO_AUTHORITY`, `COGNITO_CLIENT_ID`, `CORS_ORIGINS`, `PARSER_MODEL`, `AWS_REGION`). Does not import `app.db`. |
| `app/ai/` | Agenda parser (Claude on Amazon Bedrock) and its Lambda Function URL handler; deployed separately via `infra/ai.yml`, never touches the database. |
| `app/models/` | SQLAlchemy persistence-model modules. |
| `app/models/meeting.py` | SQLAlchemy persistence model for a meeting. |
| `app/models/agenda.py` | SQLAlchemy persistence model for a meeting's agenda (`agendas` table). |
| `app/schemas/` | JSON request and response schema modules. |
| `app/schemas/meeting.py` | Request and response shapes used by the API routes. |
| `app/schemas/agenda.py` | `AgendaIn` / `AgendaOut`; item shapes are reused from `app/ai/agenda.py`. |
| `tests/` | Pytest suite; API tests run against PostgreSQL when `TEST_DATABASE_URL` is set. |
| `app/db/` | Database connection and session modules. |
| `app/db/session.py` | Database engine and SQLAlchemy session boundary. |
| `migrations/` | Alembic migration environment and revisions. |
| `migrations/env.py` | Connects Alembic to the SQLAlchemy model metadata. |
| `migrations/versions/` | Ordered Alembic migration revisions, including the meetings table. |

`pyproject.toml` also configures Ruff **0.6.9** for Python error, import-order, and style checks. The backend lint command is `ruff check backend`.

### Backend API contract

The backend listens on container port **8000** and exposes only the endpoints below. Every endpoint requires `Authorization: Bearer <Cognito access token>` and returns `401` without a valid one. Meetings belong to the user who created them: the backend stores the token's `sub` as `owner_sub` (internal, never returned), lists only the caller's meetings, and answers `404` for someone else's meeting or its agenda, exactly as for a missing one.

| Method and path | Input | Output |
| --- | --- | --- |
| `GET /api/meetings` | No request body | `200 OK` with the caller's `Meeting[]` JSON. |
| `POST /api/meetings` | `CreateMeeting` JSON | `201 Created` with one `Meeting` JSON object, owned by the caller. |
| `GET /api/meetings/{id}/agenda` | No request body | `200 OK` with `Agenda` JSON; `404` if the meeting or its agenda does not exist. |
| `PUT /api/meetings/{id}/agenda` | `AgendaIn` JSON | `200 OK` with `Agenda` JSON (created or replaced; one agenda per meeting); `404` if the meeting does not exist; `422` on invalid input. |

`Meeting` is exactly this JSON object:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Sprint planning",
  "starts_at": "2026-10-01T09:00:00Z",
  "ends_at": "2026-10-01T10:00:00Z",
  "attendee_count": 6
}
```

| Field | JSON type | Contract |
| --- | --- | --- |
| `id` | string | UUID in canonical `8-4-4-4-12` form; generated by the backend. |
| `title` | string | Meeting title. |
| `starts_at` | string | UTC ISO 8601 timestamp in `YYYY-MM-DDTHH:MM:SSZ` form. |
| `ends_at` | string | UTC ISO 8601 timestamp in `YYYY-MM-DDTHH:MM:SSZ` form. |
| `attendee_count` | integer | Number of attendees. |

`GET /api/meetings` returns a JSON array of zero or more of the caller's `Meeting` objects, for example `[]` when they have none. Rows created before ownership existed (migration `0003`) carry `owner_sub = 'legacy'` and are visible to nobody. `CreateMeeting` has exactly `title`, `starts_at`, `ends_at`, and `attendee_count`, with the same types and formats as `Meeting`; it does not accept `id`.

`Agenda` is this JSON object:

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "meeting_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Sprint planning",
  "starts_at": "2026-10-01T09:00:00Z",
  "duration_minutes": 60,
  "items": [{"topic": "Backlog review", "owner": "Olia", "minutes": 15}],
  "action_items": [{"task": "Update the board", "owner": null, "due": "2026-10-03"}],
  "ai_suggestion": {"title": "Sprint planning", "items": [], "action_items": [], "language": "en"},
  "ai_model": "anthropic.claude-opus-5-5",
  "ai_prompt_version": "agenda-v1",
  "updated_at": "2026-10-01T08:00:00Z"
}
```

`AgendaIn` is the same object without `id`, `meeting_id` and `updated_at`. `title`, `starts_at` (same UTC format as `Meeting`), `duration_minutes` (1-600), `ai_suggestion` (at most 20 KB serialized), `ai_model` (at most 100 chars) and `ai_prompt_version` (at most 50 chars) may be `null`. `items` must hold at least one entry; every item has a non-empty `topic` plus nullable `owner` and `minutes` (1-480), and every action item has a non-empty `task` plus nullable `owner` and `due` (`YYYY-MM-DD`). The model's suggestion is stored as `ai_suggestion` for audit; only a person's `PUT` writes an agenda. The database schema is changed only through Alembic migrations.

## `frontend/`

`frontend/` contains the React single-page client, built with Vite. Its Docker base image is **`node:20.15.1-bookworm-slim`**. It uses React **18.3.1**, Vite **5.4.0**, Tailwind CSS **3.4.7**, and local shadcn/ui component source.

| Path | Purpose |
| --- | --- |
| `Dockerfile` | Builds and runs the frontend container. |
| `package.json` | Pins the frontend dependencies and scripts. |
| `vite.config.ts` | Vite configuration, including the internal `/api` proxy to `http://backend:8000`. |
| `eslint.config.js` | ESLint configuration for React and TypeScript files. |
| `prettier.config.js` | Prettier formatting configuration. |
| `.prettierignore` | Files excluded from Prettier checks. |
| `tailwind.config.ts` | Tailwind content scanning configuration. |
| `postcss.config.js` | Runs Tailwind through PostCSS. |
| `index.html` | Vite's HTML document and frontend mount point. |
| `src/` | Frontend application source. |
| `src/main.tsx` | Browser entry point. |
| `src/App.tsx` | Mounts the application's single meetings page. |
| `src/index.css` | Tailwind directives and application-wide styles. |
| `src/api/` | Browser-side API client modules. |
| `src/api/meetings.ts` | The sole browser-side client for `GET` and `POST /api/meetings`. |
| `src/pages/` | Page-level UI composition modules. |
| `src/pages/meetings-page.tsx` | Composes the meeting list and creation form. |
| `src/components/` | Reusable UI modules for the meetings page. |
| `src/components/meeting-list.tsx` | Renders the meetings returned by the API. |
| `src/components/meeting-form.tsx` | Collects a title, start, end, and attendee count and submits it. |
| `src/components/ui/` | shadcn/ui component files used by this page. |

The frontend listens on container port **5173**. Its only application-level dependency is the backend API: browser requests use the same-origin `/api/meetings` path, which Vite forwards inside the Compose network to `http://backend:8000`. It reads meetings with `GET /api/meetings` and creates them with `POST /api/meetings`. This proxy is Vite configuration, not an additional Compose service. The frontend does not access PostgreSQL. For the S3/CloudFront build, `FRONTEND_API_URL` supplies the backend's public origin as `VITE_API_URL`.

The frontend lint commands are `npm run lint` (ESLint **9.10.0**) and `npm run format:check` (Prettier **3.3.3**).

## Deployment contract

`Makefile` is the sole deployment recipe; a future deployment workflow must run these same targets rather than duplicate their commands.

| Target | Required variables | Actions |
| --- | --- | --- |
| `make deploy-frontend` | `FRONTEND_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, `FRONTEND_API_URL`; optional `AWS_REGION` (defaults to `us-east-1`) | Builds the Vite bundle, synchronizes `frontend/dist/` to S3, then invalidates all CloudFront paths. |
| `make deploy-backend` | `AWS_ACCOUNT_ID`, `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`; optional `AWS_REGION` and `IMAGE_TAG` | Builds the backend image, logs Docker in to ECR, pushes the image, forces a new ECS deployment, and waits until its service is stable. |

`IMAGE_TAG` defaults to the current Git commit's short hash. AWS authentication is provided by the caller (local AWS CLI credentials or future GitHub OIDC credentials); it is never stored in the Makefile.

## `docker-compose.yml` service contracts

| Service | Image/build and port | Depends on | Ready when |
| --- | --- | --- | --- |
| `postgres` | **`postgres:16.4-bookworm`**, port `5432` inside the Compose network | Nothing | Its `pg_isready` health check succeeds. |
| `backend` | Built from `backend/` using **`python:3.12.4-slim-bookworm`**, port `8000` | `postgres` with `condition: service_healthy` | It first runs all Alembic migrations, then starts FastAPI. Its TCP health check on port `8000` succeeds only once that process is listening. It connects to PostgreSQL using the Compose hostname `postgres`. |
| `frontend` | Built from `frontend/` using **`node:20.15.1-bookworm-slim`**, port `5173` | `backend` with `condition: service_healthy` | Its TCP health check on port `5173` succeeds only once Vite is listening. It reaches the API through the backend service contract. |

Compose publishes `8000` for the API and `5173` for the browser UI; PostgreSQL remains available to the other Compose services on `5432`. The backend is the only service that receives database connection settings, and the frontend is the only service that a developer needs to open in a browser.

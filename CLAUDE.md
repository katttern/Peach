# CLAUDE.md

## Deployed reality

Snapshot from read-only AWS CLI checks on 2026-10-28, account `470115905916`.
Re-verify before relying on it.

### Regions in use
- **eu-north-1**: main API (ECS), ALB, frontend S3 bucket, ECR `peach-backend`.
- **us-east-1**: Cognito, Lab 5 reports, Lab 6 agenda parser (all in Terraform, see below), ECR `peach-reports`.
- **eu-central-1**: nothing deployed.

### Main API (Lab 2 / FastAPI)
- ECS Fargate cluster `peach-cluster`, service `peach-service`, desired=1 running=1,
  task definition `peach-backend:7` as of 2026-10-28 (0.5 vCPU / 1 GB). The backend container env
  has `DATABASE_URL`, `COGNITO_AUTHORITY`, `COGNITO_CLIENT_ID` and `CORS_ORIGINS`.
- Every API endpoint requires a Cognito access token. Meetings are per user: `meetings.owner_sub` holds the
  Cognito `sub` (migration 0003, indexed). Lists are filtered by it, and someone else's meeting or agenda gives 404.
  Rows from before 0003 get `owner_sub='legacy'`.
- The report builder (`app/reports/weekly.py`) still aggregates over **all** owners. Its `seed` action takes
  `owner_sub` from the payload or `SEED_OWNER_SUB` (default `demo`). The deployed builder still runs image `v1`,
  so 0002/0003 are not applied to the reports RDS until that image is rebuilt and `migrate` runs.
- The service was created in the ECS console. No CloudFormation template exists for it.
  The console stack `ECS-Console-V2-Service-peach-service-peach-cluster-e91b6484` is in `CREATE_FAILED`.
- The task holds two containers. **Postgres is a sidecar** (`postgres:16.4-bookworm`,
  user/pass/db `spry`, no volume), and `DATABASE_URL=...@localhost:5432/spry`.
  Data is lost whenever the task restarts. The current task started 2026-10-16.
- The backend Dockerfile CMD runs migrations (`alembic upgrade head`) on every container start.
  `Running upgrade ...` lines appear in log group `/ecs/peach-backend` (stream `ecs/backend/<task>`).
- Deploy with `make deploy-backend AWS_REGION=eu-north-1 AWS_ACCOUNT_ID=470115905916 ECR_REPOSITORY=peach-backend ECS_CLUSTER=peach-cluster ECS_SERVICE=peach-service`.
  `scripts/ecs-deploy.sh` registers a new task-definition revision (new image plus the env above)
  and rolls the service onto it. A plain `--force-new-deployment` would keep the pinned old image tag.
  Every rollout starts with an empty sidecar DB.
- There is **no Lambda API and no Aurora** anywhere. Lab 4 as described in the course
  (Lambda API in a VPC + Aurora + Function URL) is not deployed in this account.

### How the browser reaches the API
- CloudFront `E37V7OK25PWZRX` (`d344hgmqfilirt.cloudfront.net`), PriceClass_All.
  - Default behavior: S3 `peach-frontend-katttern` (eu-north-1) through OAC, GET/HEAD.
  - `/api/*` goes to `peach-alb-1433143114.eu-north-1.elb.amazonaws.com`, **HTTP only**, all methods.
  - This is why `VITE_API_URL` is the CloudFront domain: the API is same-origin with the SPA.
- The ALB (internet-facing, HTTP:80) is also reachable directly, bypassing CloudFront.
- SPA routing (since 2026-10-28): CloudFront Function `peach-spa-rewrite` (`infra/cloudfront/spa-rewrite.js`,
  viewer-request, **default behavior only**) rewrites extensionless paths to `/index.html`.
  CustomErrorResponses were removed, so `/api/*` returns real 401/404 JSON, and a missing asset gives 403.
- Safe frontend paths are `/`, `/login` and `/meetings/<uuid>` (a trailing slash is fine). Nothing may start with `/api/`.
- The distribution and the function are not in CloudFormation. Update the function with
  `aws cloudfront update-function` followed by `publish-function`.

### Infrastructure as code (since 2026-10-30)
- Cognito, the Lab 5 report and the Lab 6 parser are Terraform in `infra/` (see `README.md`, ADR 0007). The
  CloudFormation stacks `peach-auth`, `peach-reports`, `peach-ai` were deleted with `Retain`; their resources
  were imported (43 imported, 1 re-created: the bucket notification).
- State and runs: HCP Terraform `peach_katttern/peach-dev`, remote execution, VCS-connected to `katttern/Peach`
  (`infra`, `main`), manual apply. AWS access via OIDC role `hcp-terraform-peach_katttern`, created by the
  bootstrap config in `~/tf-bootstrap` (local state, not in this repo).
- Never `terraform apply` from a laptop; change `infra/` through a PR. Read values with
  `terraform -chdir=infra output -raw <name>` (`make infra-plan`, `make infra-validate`, …).
- Secrets (`google_client_secret`, `db_password`) are sensitive workspace variables. They are also in state.
- Not in Terraform yet: the ECS backend, the frontend bucket and CloudFront, ECR.

### Databases
- us-east-1 `peach-reports-db-rym4qinkxoy9`: standalone RDS Postgres 18.3, db.t3.micro,
  20 GB gp2, private, single-AZ, **backup retention 0, deletion protection off**.
  Managed by Terraform as `aws_db_instance.reports` (`prevent_destroy`), VPC `vpc-0f9532b2001f7d04e`.
- This is **not** the main API's database (that is the ECS sidecar in eu-north-1).

### Lab 5 reports (us-east-1, `infra/reports.tf`)
- Lambdas: `peach-report-builder` (image `peach-reports:v1`, in the VPC, default CMD) and
  `peach-report-mailer` (zip, outside the VPC).
- Written from the deployed template, not the old `infra/reports.yml` (which was stale): own RDS, no SES identities.
- ECR `peach-reports` (us-east-1, MUTABLE) has one tag, `v1`, pushed 2026-10-15.
  It was built from `backend/Dockerfile.lambda`.
- The VPC has only an S3 gateway endpoint. No NAT, so VPC Lambdas cannot reach Bedrock or Cognito.

### Lambda images (how they are built now)
- Every us-east-1 Lambda image (report builder and agenda parser) is built with `make lambda-image`:
  `docker buildx build -f backend/Dockerfile.lambda --platform linux/amd64 --provenance=false --sbom=false --push`
  into ECR `peach-reports` (us-east-1), tagged with the git short sha. A dirty tree adds `-dirty-<timestamp>`.
  Lambda rejects OCI index manifests, so provenance and SBOM stay off. Both functions are `x86_64`.
- The handler is chosen per function with `ImageConfig.Command`. The Dockerfile CMD defaults to the report builder.

### Lab 6 (agenda-parser) placement
- `infra/ai.tf`, us-east-1. A new image: `make lambda-image`, then `parser_image_uri` in `infra/terraform.tfvars` via PR.
- The Terraform variable `parser_model` (Lambda env `PARSER_MODEL`) selects the provider by prefix:
  - `anthropic.*` → Messages API on `bedrock-mantle` (IAM `bedrock-mantle:CreateInference`);
  - anything else → Bedrock **Converse** (IAM `bedrock:InvokeModel` on `amazon.nova-*` and on the `us.amazon.nova-*`
    inference profile).
  Deployed since 2026-10-28: **`us.amazon.nova-pro-v1:0`**, because Anthropic models are blocked (see below).
  Nova `agreementAvailability` is AVAILABLE. The log line carries `"provider": "anthropic" | "converse"`.
- Function URL, AuthType NONE. The Cognito access token is checked in the handler, and CORS is set on the URL.
- Test token: the web client has no USER_PASSWORD_AUTH flow, so take it from the browser (`make token`).
- **Blocker (2026-10-28):** every Anthropic model in this account reports
  `get-foundation-model-availability` → `agreementAvailability.status = NOT_AVAILABLE`, so
  Mantle calls return `403 "... is not available for this account"`. The account owner has to accept
  the model agreement or use-case form in the Bedrock console (us-east-1) before any parse can work.
- Local checks: `make llm-hello` and `make parse TEXT="..." [MODEL=...]` (set `PYTHON=` to a venv with the backend installed).
- Bedrock in us-east-1 lists active Anthropic inference profiles, for example `us.anthropic.claude-*`.
- Cognito authority: `terraform -chdir=infra output -raw authority`.

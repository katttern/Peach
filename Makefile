SHELL := /bin/sh

AWS_REGION ?= us-east-1
IMAGE_TAG ?= $(shell git rev-parse --short HEAD)
ECR_REGISTRY ?= $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
BACKEND_IMAGE := $(ECR_REGISTRY)/$(ECR_REPOSITORY):$(IMAGE_TAG)
S3_BUCKET       ?= peach-frontend-katttern
CF_DISTRIBUTION ?= E37V7OK25PWZRX
FRONTEND_BUCKET ?= peach-frontend-katttern
CLOUDFRONT_DISTRIBUTION_ID ?= E37V7OK25PWZRX
FRONTEND_API_URL ?= https://d344hgmqfilirt.cloudfront.net

# ---------- Terraform (infra/, HCP Terraform workspace peach_katttern/peach-dev) ----------
# Cognito, the weekly report and the agenda parser are managed in infra/.
# Changes are applied in HCP Terraform after merge; there is no apply target.
TF = terraform -chdir=infra
# Reads one output from the HCP state (needs `terraform login` and infra-init).
tf_output = $(shell $(TF) output -raw $(1))

.PHONY: infra-init infra-fmt infra-validate infra-plan
infra-init:
	$(TF) init -input=false

infra-fmt:
	$(TF) fmt -check -recursive

infra-validate:
	$(TF) validate

# Runs remotely in HCP Terraform with the workspace's variables and credentials.
infra-plan:
	$(TF) plan -input=false

.PHONY: deploy-frontend deploy-backend

deploy-frontend:
	@test -n "$(FRONTEND_BUCKET)" || (echo "FRONTEND_BUCKET is required"; exit 1)
	@test -n "$(CLOUDFRONT_DISTRIBUTION_ID)" || (echo "CLOUDFRONT_DISTRIBUTION_ID is required"; exit 1)
	@test -n "$(FRONTEND_API_URL)" || (echo "FRONTEND_API_URL is required"; exit 1)
	cd frontend && npm ci && VITE_API_URL="$(FRONTEND_API_URL)" VITE_COGNITO_AUTHORITY="$(call tf_output,authority)" VITE_COGNITO_CLIENT_ID="$(call tf_output,client_id)" VITE_COGNITO_DOMAIN="$(call tf_output,hosted_domain)" VITE_AGENDA_PARSER_URL="$(call tf_output,parser_url)" npm run build
	# Hashed assets are immutable; index.html must be revalidated so a deploy
	# reaches browsers right away.
	aws s3 sync frontend/dist/ "s3://$(FRONTEND_BUCKET)/" --delete --exclude index.html --cache-control "public, max-age=31536000, immutable"
	aws s3 cp frontend/dist/index.html "s3://$(FRONTEND_BUCKET)/index.html" --cache-control "no-cache" --content-type "text/html"
	aws cloudfront create-invalidation --distribution-id "$(CLOUDFRONT_DISTRIBUTION_ID)" --paths "/*"

deploy-backend:
	@test -n "$(AWS_ACCOUNT_ID)" || (echo "AWS_ACCOUNT_ID is required"; exit 1)
	@test -n "$(ECR_REPOSITORY)" || (echo "ECR_REPOSITORY is required"; exit 1)
	@test -n "$(ECS_CLUSTER)" || (echo "ECS_CLUSTER is required"; exit 1)
	@test -n "$(ECS_SERVICE)" || (echo "ECS_SERVICE is required"; exit 1)
	aws ecr get-login-password --region "$(AWS_REGION)" | docker login --username AWS --password-stdin "$(ECR_REGISTRY)"
	docker build --platform linux/amd64 --tag "$(BACKEND_IMAGE)" backend
	docker push "$(BACKEND_IMAGE)"
	./scripts/ecs-deploy.sh "$(AWS_REGION)" "$(ECS_CLUSTER)" "$(ECS_SERVICE)" "$(BACKEND_IMAGE)" \
	  "COGNITO_AUTHORITY=$(call tf_output,authority)" \
	  "COGNITO_CLIENT_ID=$(call tf_output,client_id)" \
	  "CORS_ORIGINS=$(FRONTEND_API_URL),http://localhost:5173"
	aws ecs wait services-stable --region "$(AWS_REGION)" --cluster "$(ECS_CLUSTER)" --services "$(ECS_SERVICE)"

# ---------- Lambda images (us-east-1) and the agenda parser (Lab 6) ----------
# Every us-east-1 Lambda image (peach-report-builder, peach-agenda-parser) is
# built from backend/Dockerfile.lambda by `make lambda-image`. To deploy it,
# set report_builder_image_uri / parser_image_uri in infra/terraform.tfvars
# and open a PR (see README, "Інфраструктура").
AI_REGION         ?= us-east-1
AI_ECR_REPOSITORY ?= peach-reports
LAMBDA_PLATFORM   ?= linux/amd64
# Default model for the local llm-hello / parse commands.
PARSER_MODEL      ?= us.amazon.nova-pro-v1:0
# A dirty tree gets a unique suffix: the repo is MUTABLE and an unchanged
# image URI would not make Terraform update the function.
LAMBDA_IMAGE_TAG  := $(IMAGE_TAG)$(if $(shell git status --porcelain),-dirty-$(shell date +%Y%m%d%H%M%S))
AI_ACCOUNT_ID      = $(shell aws sts get-caller-identity --query Account --output text)
LAMBDA_IMAGE       = $(AI_ACCOUNT_ID).dkr.ecr.$(AI_REGION).amazonaws.com/$(AI_ECR_REPOSITORY):$(LAMBDA_IMAGE_TAG)

.PHONY: lambda-image parser-url token llm-hello parse

# Local Claude calls with your AWS credentials (backend deps must be installed,
# e.g. PYTHON=path/to/venv/bin/python). MODEL overrides PARSER_MODEL.
PYTHON ?= python3
MODEL  ?=
LLM_ENV = AWS_REGION=$(AI_REGION) $(if $(MODEL),PARSER_MODEL=$(MODEL))

llm-hello:
	cd backend && $(LLM_ENV) $(PYTHON) -m app.ai.cli hello

parse:
	@test -n "$(TEXT)" || (echo 'usage: make parse TEXT="..." [MODEL=...]'; exit 1)
	cd backend && $(LLM_ENV) $(PYTHON) -m app.ai.cli parse "$$PARSE_TEXT"

parse: export PARSE_TEXT = $(TEXT)

lambda-image:
	$(eval LAMBDA_IMAGE_REF := $(LAMBDA_IMAGE))
	aws ecr get-login-password --region "$(AI_REGION)" | docker login --username AWS --password-stdin "$(firstword $(subst /, ,$(LAMBDA_IMAGE_REF)))"
	docker buildx build -f backend/Dockerfile.lambda --platform "$(LAMBDA_PLATFORM)" --provenance=false --sbom=false --tag "$(LAMBDA_IMAGE_REF)" --push backend
	@echo "pushed $(LAMBDA_IMAGE_REF)"

parser-url:
	@echo "$(call tf_output,parser_url)"

# The web client has no USER_PASSWORD_AUTH flow, so the token comes from a browser session.
token:
	@echo "1. Open $(FRONTEND_API_URL) (or http://localhost:5173) and sign in."
	@echo "2. DevTools -> Console, run:"
	@echo "   JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(k => k.startsWith('oidc.user:')))).access_token"
	@echo "3. export TOKEN='<the printed value>'   # valid for 1 hour"

.PHONY: report-now
report-now:
	@test -n "$(WEEK)" || (echo "WEEK is required, e.g. make report-now WEEK=2026-W40"; exit 1)
	./scripts/report-now.sh "$(WEEK)" "$(call tf_output,queue_url)"

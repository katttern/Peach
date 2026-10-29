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

AUTH_STACK  ?= peach-auth
AUTH_REGION ?= us-east-1
cognito_output = $(shell aws cloudformation describe-stacks --region $(AUTH_REGION) --stack-name $(AUTH_STACK) --query "Stacks[0].Outputs[?OutputKey=='$(1)'].OutputValue" --output text)

AUTH_DOMAIN_PREFIX ?= peach-katttern-demo
AUTH_SITE_URL      ?= $(FRONTEND_API_URL)

.PHONY: deploy-frontend deploy-backend deploy-auth

# All auth.yml parameters come from .env / these variables on every deploy;
# none fall back to the stack's previous values. Add DRY_RUN=1 to only print.
deploy-auth:
	@./scripts/deploy-auth.sh "$(AUTH_STACK)" "$(AUTH_REGION)" "$(AUTH_DOMAIN_PREFIX)" "$(AUTH_SITE_URL)" $(if $(DRY_RUN),--dry-run)

deploy-frontend:
	@test -n "$(FRONTEND_BUCKET)" || (echo "FRONTEND_BUCKET is required"; exit 1)
	@test -n "$(CLOUDFRONT_DISTRIBUTION_ID)" || (echo "CLOUDFRONT_DISTRIBUTION_ID is required"; exit 1)
	@test -n "$(FRONTEND_API_URL)" || (echo "FRONTEND_API_URL is required"; exit 1)
	cd frontend && npm ci && VITE_API_URL="$(FRONTEND_API_URL)" VITE_COGNITO_AUTHORITY="$(call cognito_output,Authority)" VITE_COGNITO_CLIENT_ID="$(call cognito_output,ClientId)" VITE_COGNITO_DOMAIN="$(call cognito_output,HostedDomain)" VITE_AGENDA_PARSER_URL="$(call ai_output,ParserUrl)" npm run build
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
	  "COGNITO_AUTHORITY=$(call cognito_output,Authority)" \
	  "COGNITO_CLIENT_ID=$(call cognito_output,ClientId)" \
	  "CORS_ORIGINS=$(FRONTEND_API_URL),http://localhost:5173"
	aws ecs wait services-stable --region "$(AWS_REGION)" --cluster "$(ECS_CLUSTER)" --services "$(ECS_SERVICE)"

# ---------- Lambda images (us-east-1) and the agenda parser (Lab 6) ----------
# Every us-east-1 Lambda image (peach-report-builder, peach-agenda-parser) is
# built from backend/Dockerfile.lambda by `make lambda-image`.
AI_STACK          ?= peach-ai
AI_REGION         ?= us-east-1
AI_ECR_REPOSITORY ?= peach-reports
LAMBDA_PLATFORM   ?= linux/amd64
AI_ALLOWED_ORIGINS ?= $(FRONTEND_API_URL),http://localhost:5173
# Passed on every deploy: an omitted parameter would keep the stack's old value.
PARSER_MODEL      ?= us.amazon.nova-pro-v1:0
ALERT_EMAIL       ?= $(shell sed -n 's/^ALERT_EMAIL=//p' .env 2>/dev/null)
# A dirty tree gets a unique suffix: the repo is MUTABLE and an unchanged
# ImageUri would not make CloudFormation update the function.
LAMBDA_IMAGE_TAG  := $(IMAGE_TAG)$(if $(shell git status --porcelain),-dirty-$(shell date +%Y%m%d%H%M%S))
AI_ACCOUNT_ID      = $(shell aws sts get-caller-identity --query Account --output text)
LAMBDA_IMAGE       = $(AI_ACCOUNT_ID).dkr.ecr.$(AI_REGION).amazonaws.com/$(AI_ECR_REPOSITORY):$(LAMBDA_IMAGE_TAG)
ai_output = $(shell aws cloudformation describe-stacks --region $(AI_REGION) --stack-name $(AI_STACK) --query "Stacks[0].Outputs[?OutputKey=='$(1)'].OutputValue" --output text)

.PHONY: lambda-image deploy-ai parser-url token cfn-lint llm-hello parse

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

deploy-ai: cfn-lint lambda-image
	@test -n "$(ALERT_EMAIL)" || (echo "ALERT_EMAIL is required (set it in .env)"; exit 1)
	aws cloudformation deploy --region "$(AI_REGION)" --template-file infra/ai.yml --stack-name "$(AI_STACK)" --capabilities CAPABILITY_IAM \
	  --tags PROJECT_NAME=peach \
	  --parameter-overrides \
	    "ImageUri=$(LAMBDA_IMAGE_REF)" \
	    "ParserModel=$(PARSER_MODEL)" \
	    "CognitoAuthority=$(call cognito_output,Authority)" \
	    "CognitoClientId=$(call cognito_output,ClientId)" \
	    "AllowedOrigins=$(AI_ALLOWED_ORIGINS)" \
	    "AlertEmail=$(ALERT_EMAIL)"
	@$(MAKE) -s parser-url

parser-url:
	@echo "$(call ai_output,ParserUrl)"

# The web client has no USER_PASSWORD_AUTH flow, so the token comes from a browser session.
token:
	@echo "1. Open $(FRONTEND_API_URL) (or http://localhost:5173) and sign in."
	@echo "2. DevTools -> Console, run:"
	@echo "   JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(k => k.startsWith('oidc.user:')))).access_token"
	@echo "3. export TOKEN='<the printed value>'   # valid for 1 hour"

# Fails when the linter is missing instead of skipping silently.
# Without a global install: make deploy-ai CFN_LINT="uvx cfn-lint"
CFN_LINT ?= cfn-lint
cfn-lint:
	@command -v $(firstword $(CFN_LINT)) >/dev/null 2>&1 || { echo "cfn-lint is not installed (pip install cfn-lint, or CFN_LINT=\"uvx cfn-lint\")"; exit 1; }
	$(CFN_LINT) infra/ai.yml

REPORTS_STACK ?= peach-reports

.PHONY: report-now
report-now:
	@test -n "$(WEEK)" || (echo "WEEK is required, e.g. make report-now WEEK=2026-W40"; exit 1)
	./scripts/report-now.sh "$(WEEK)" "$(REPORTS_STACK)"

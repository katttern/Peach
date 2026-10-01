SHELL := /bin/sh

AWS_REGION ?= us-east-1
IMAGE_TAG ?= $(shell git rev-parse --short HEAD)
ECR_REGISTRY ?= $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
BACKEND_IMAGE := $(ECR_REGISTRY)/$(ECR_REPOSITORY):$(IMAGE_TAG)

.PHONY: deploy-frontend deploy-backend

deploy-frontend:
	@test -n "$(FRONTEND_BUCKET)" || (echo "FRONTEND_BUCKET is required"; exit 1)
	@test -n "$(CLOUDFRONT_DISTRIBUTION_ID)" || (echo "CLOUDFRONT_DISTRIBUTION_ID is required"; exit 1)
	@test -n "$(FRONTEND_API_URL)" || (echo "FRONTEND_API_URL is required"; exit 1)
	cd frontend && npm ci && VITE_API_URL="$(FRONTEND_API_URL)" npm run build
	aws s3 sync frontend/dist/ "s3://$(FRONTEND_BUCKET)/" --delete
	aws cloudfront create-invalidation --distribution-id "$(CLOUDFRONT_DISTRIBUTION_ID)" --paths "/*"

deploy-backend:
	@test -n "$(AWS_ACCOUNT_ID)" || (echo "AWS_ACCOUNT_ID is required"; exit 1)
	@test -n "$(ECR_REPOSITORY)" || (echo "ECR_REPOSITORY is required"; exit 1)
	@test -n "$(ECS_CLUSTER)" || (echo "ECS_CLUSTER is required"; exit 1)
	@test -n "$(ECS_SERVICE)" || (echo "ECS_SERVICE is required"; exit 1)
	aws ecr get-login-password --region "$(AWS_REGION)" | docker login --username AWS --password-stdin "$(ECR_REGISTRY)"
	docker build --tag "$(BACKEND_IMAGE)" backend
	docker push "$(BACKEND_IMAGE)"
	aws ecs update-service --region "$(AWS_REGION)" --cluster "$(ECS_CLUSTER)" --service "$(ECS_SERVICE)" --force-new-deployment
	aws ecs wait services-stable --region "$(AWS_REGION)" --cluster "$(ECS_CLUSTER)" --services "$(ECS_SERVICE)"

#!/bin/sh
# Register a new revision of the service's task definition with a new backend
# image and extra environment variables, then roll the service onto it.
#   ecs-deploy.sh <region> <cluster> <service> <image> [KEY=VALUE ...]
# Without this, `update-service --force-new-deployment` keeps the image tag
# pinned in the current revision and never runs a newly pushed image.
set -eu
region="$1" cluster="$2" service="$3" image="$4"
shift 4

env_json=$(for kv in "$@"; do
  jq -n --arg k "${kv%%=*}" --arg v "${kv#*=}" '{name: $k, value: $v}'
done | jq -s '.')

current=$(aws ecs describe-services --region "$region" --cluster "$cluster" \
  --services "$service" --query "services[0].taskDefinition" --output text)

aws ecs describe-task-definition --region "$region" --task-definition "$current" \
  --query taskDefinition --output json |
  jq --arg image "$image" --argjson env "$env_json" '
    .containerDefinitions |= map(
      if .name == "backend" then
        .image = $image
        | .environment = ((.environment // []) as $old
            | ($env | map(.name)) as $names
            | [$old[] | select(.name as $n | $names | index($n) | not)] + $env)
      else . end)
    | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
          .compatibilities, .registeredAt, .registeredBy)' \
  > "${TMPDIR:-/tmp}/taskdef.json"

next=$(aws ecs register-task-definition --region "$region" \
  --cli-input-json "file://${TMPDIR:-/tmp}/taskdef.json" \
  --query "taskDefinition.taskDefinitionArn" --output text)
rm -f "${TMPDIR:-/tmp}/taskdef.json"
echo "registered $next (was $current)"

aws ecs update-service --region "$region" --cluster "$cluster" --service "$service" \
  --task-definition "$next" --query "service.taskDefinition" --output text

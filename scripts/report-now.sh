#!/bin/sh
# Ask the report builder for one ISO week now.
#   report-now.sh <week> <queue-url>   (make report-now reads the URL from Terraform)
set -eu
week="$1"
queue="$2"
test -n "$queue" || { echo "queue URL is empty (run make infra-init and terraform login)" >&2; exit 1; }
aws sqs send-message --region us-east-1 --queue-url "$queue" \
  --message-body "{\"week\": \"$week\", \"source\": \"make\"}"

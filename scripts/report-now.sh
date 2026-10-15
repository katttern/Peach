#!/bin/sh
set -eu
week="$1"
stack="$2"
queue=$(aws cloudformation describe-stacks --region us-east-1 --stack-name "$stack" \
  --query "Stacks[0].Outputs[?OutputKey=='QueueUrl'].OutputValue" --output text)
aws sqs send-message --region us-east-1 --queue-url "$queue" \
  --message-body "{\"week\": \"$week\", \"source\": \"make\"}"

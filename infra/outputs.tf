# The Outputs of the former stacks, in snake_case, for
# `terraform output -raw <name>` in the Makefile and scripts.

# ---------- peach-auth ----------

output "user_pool_id" {
  description = "Cognito user pool ID (UserPoolId)."
  value       = aws_cognito_user_pool.main.id
}

output "client_id" {
  description = "Web app client ID (ClientId); VITE_COGNITO_CLIENT_ID and COGNITO_CLIENT_ID."
  value       = aws_cognito_user_pool_client.web.id
}

output "authority" {
  description = "OIDC issuer of the user pool (Authority); VITE_COGNITO_AUTHORITY and COGNITO_AUTHORITY."
  value       = "https://${aws_cognito_user_pool.main.endpoint}"
}

output "hosted_domain" {
  description = "Hosted login domain (HostedDomain); VITE_COGNITO_DOMAIN."
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
}

# ---------- peach-reports ----------

output "bucket_name" {
  description = "Reports bucket (BucketName)."
  value       = aws_s3_bucket.reports.bucket
}

output "queue_url" {
  description = "Report request queue (QueueUrl); used by scripts/report-now.sh."
  value       = aws_sqs_queue.requests.url
}

output "dlq_url" {
  description = "Dead-letter queue of the report requests (DlqUrl)."
  value       = aws_sqs_queue.dlq.url
}

output "builder_function" {
  description = "Report builder Lambda name (BuilderFunction)."
  value       = aws_lambda_function.builder.function_name
}

# ---------- peach-ai ----------

output "parser_url" {
  description = "Agenda parser Function URL (ParserUrl); VITE_AGENDA_PARSER_URL."
  value       = aws_lambda_function_url.parser.function_url
}

output "parser_function_name" {
  description = "Agenda parser Lambda name (FunctionName)."
  value       = aws_lambda_function.parser.function_name
}

# Parameters of the former CloudFormation stacks peach-auth, peach-reports and
# peach-ai. CognitoAuthority / CognitoClientId of peach-ai are not variables any
# more: ai.tf reads them from the user pool and client in auth.tf.

variable "region" {
  description = "AWS region of all three former stacks."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "PROJECT_NAME tag and name prefix (ProjectName in every stack)."
  type        = string
}

# ---------- auth (peach-auth) ----------

variable "domain_prefix" {
  description = "Cognito hosted domain prefix (DomainPrefix)."
  type        = string
}

variable "site_url" {
  description = "Public site origin used for the OAuth callback and logout URLs, without a trailing slash (SiteUrl)."
  type        = string
}

variable "google_client_id" {
  description = "Google OAuth client ID (GoogleClientId)."
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth client secret (GoogleClientSecret, NoEcho). Set it as a sensitive workspace variable."
  type        = string
  sensitive   = true
}

# ---------- weekly report (peach-reports) ----------

variable "vpc_id" {
  description = "VPC of the report builder and its database (VpcId)."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets for the builder Lambda and the DB subnet group (SubnetIds)."
  type        = list(string)
}

variable "route_table_ids" {
  description = "Route tables that get the S3 gateway endpoint (RouteTableIds)."
  type        = list(string)
}

variable "report_builder_image_uri" {
  description = "Container image of the report builder Lambda (ImageUri of peach-reports)."
  type        = string
}

variable "db_password" {
  description = "Master password of the reports database (DbPassword, NoEcho). Set it as a sensitive workspace variable."
  type        = string
  sensitive   = true
}

variable "sender_email" {
  description = "SES sender address of the report mailer (SenderEmail)."
  type        = string
}

variable "recipient_email" {
  description = "Recipient address of the weekly report (RecipientEmail)."
  type        = string
}

variable "schedule_expression" {
  description = "EventBridge Scheduler expression of the weekly report, in Europe/Kyiv time (ScheduleExpression)."
  type        = string
  default     = "cron(0 7 ? * MON *)"
}

variable "fail_week" {
  description = "ISO week for which the builder fails on purpose, to test the DLQ; \"none\" disables it (FailWeek)."
  type        = string
  default     = "none"
}

# ---------- agenda parser (peach-ai) ----------

variable "parser_image_uri" {
  description = "Container image of the agenda parser Lambda (ImageUri of peach-ai)."
  type        = string
}

variable "parser_model" {
  description = "Bedrock model of the parser; anthropic.* uses the Messages API, anything else Converse (ParserModel)."
  type        = string
  default     = "us.amazon.nova-pro-v1:0"
}

variable "allowed_origins" {
  description = "Browser origins allowed by the Function URL CORS config (AllowedOrigins)."
  type        = list(string)
}

variable "alert_email" {
  description = "Email address for the monthly budget alerts (AlertEmail)."
  type        = string
}

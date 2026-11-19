variable "project_id" {
  description = "GCP project ID: permanent and globally unique, e.g. spry-katttern-2026."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "6-30 characters: lowercase letters, digits and hyphens, starting with a letter."
  }
}

variable "region" {
  description = "Region for Cloud Run, Cloud SQL and Artifact Registry."
  type        = string
  default     = "us-central1"
}

# ---------- API (Cloud Run) ----------

variable "backend_image_tag" {
  description = "Tag of the backend image in Artifact Registry (git short sha, pushed by `make gcp-image`)."
  type        = string
  default     = "latest"
}

variable "max_instances" {
  description = "Upper bound on Cloud Run instances: a cost ceiling and a cap on Cloud SQL connections."
  type        = number
  default     = 2
}

# Sign-in stays on AWS (ADR 0008): the API keeps verifying Cognito access tokens.
variable "cognito_authority" {
  description = "Cognito issuer URL (terraform -chdir=infra output -raw authority)."
  type        = string
  default     = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Mxjm62BAS"
}

variable "cognito_client_id" {
  description = "Cognito web client ID (terraform -chdir=infra output -raw client_id). Not a secret."
  type        = string
  default     = "18a2au33rm9n9t9eck3g9ja3ve"
}

# ---------- Database (Cloud SQL) ----------

variable "db_tier" {
  description = "Cloud SQL machine type. db-f1-micro is the smallest shared-core tier."
  type        = string
  default     = "db-f1-micro"
}

variable "db_activation_policy" {
  description = "ALWAYS = running and billed per hour; NEVER = stopped (only storage is billed)."
  type        = string
  default     = "ALWAYS"

  validation {
    condition     = contains(["ALWAYS", "NEVER"], var.db_activation_policy)
    error_message = "Use ALWAYS (running) or NEVER (stopped)."
  }
}

variable "db_deletion_protection" {
  description = "Keep false for the lab so that `terraform destroy` removes the instance at clean-up."
  type        = bool
  default     = false
}

# ---------- CI: GitHub Actions through Workload Identity Federation ----------

# Numeric IDs, not names: a name can be re-registered by someone else.
# gh api repos/katttern/Peach --jq '.id, .owner.id'
variable "github_repository_id" {
  description = "Numeric ID of the GitHub repository allowed to deploy (empty = no GitHub WIF)."
  type        = string
  default     = ""
}

variable "github_repository_owner_id" {
  description = "Numeric ID of the repository owner."
  type        = string
  default     = ""
}

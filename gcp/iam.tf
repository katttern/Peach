# One service account per program (Part 0). The API does not run as the default
# compute service account, which starts with the Editor role.
resource "google_service_account" "api" {
  account_id   = "spry-api"
  display_name = "Spry API on Cloud Run"
  depends_on   = [google_project_service.enabled]
}

# Only what the API needs: open the Cloud SQL connection and read its own secret.
resource "google_project_iam_member" "api_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = google_service_account.api.member
}

resource "google_secret_manager_secret_iam_member" "api_reads_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.api.member
}

# The Terraform service account (spry-terraform@...) is created once by hand or by a
# bootstrap config, like the AWS OIDC role in ~/tf-bootstrap: it cannot create itself.
# Its roles, on this project only: Cloud Run Admin, Cloud SQL Admin, Artifact Registry
# Administrator, Secret Manager Admin, Service Usage Admin, Service Account User
# (plus Firebase Hosting Admin and Workload Identity Pool Admin for hosting.tf and wif.tf).

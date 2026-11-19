output "api_url" {
  description = "Cloud Run URL of the API (the frontend reaches it through the Firebase rewrite)."
  value       = google_cloud_run_v2_service.api.uri
}

output "site_url" {
  description = "Firebase Hosting URL of the frontend."
  value       = "https://${google_firebase_hosting_site.web.site_id}.web.app"
}

output "backend_image" {
  description = "Image reference Cloud Run runs; `make gcp-image` pushes to this repository."
  value       = local.backend_image
}

output "sql_connection_name" {
  description = "For the Cloud SQL Auth Proxy: cloud-sql-proxy <this>."
  value       = google_sql_database_instance.main.connection_name
}

output "github_wif_provider" {
  description = "workload_identity_provider for google-github-actions/auth (empty without GitHub WIF)."
  value       = local.github_wif ? google_iam_workload_identity_pool_provider.github[0].name : ""
}

output "github_deployer_email" {
  description = "service_account for google-github-actions/auth (empty without GitHub WIF)."
  value       = local.github_wif ? google_service_account.deployer[0].email : ""
}

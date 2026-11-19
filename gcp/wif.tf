# Stretch: deploy from GitHub Actions with no stored key (Workload Identity Federation).
# GitHub presents a short-lived OIDC token; Google trades it for a short-lived token of
# the deployer service account. The same idea as the HCP -> AWS OIDC role in Lab 7.
# Created only when the numeric repository IDs are set.
locals {
  github_wif = var.github_repository_id != "" && var.github_repository_owner_id != ""
}

resource "google_iam_workload_identity_pool" "github" {
  count = local.github_wif ? 1 : 0

  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count = local.github_wif ? 1 : 0

  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub Actions OIDC" # max 32 characters

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
  }

  # Only this repository (by numeric ID) and only its main branch.
  attribute_condition = join(" && ", [
    "assertion.repository_id == '${var.github_repository_id}'",
    "assertion.repository_owner_id == '${var.github_repository_owner_id}'",
    "assertion.ref == 'refs/heads/main'",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  count = local.github_wif ? 1 : 0

  account_id   = "spry-deployer"
  display_name = "GitHub Actions deployer for Spry"
}

resource "google_service_account_iam_member" "github_impersonates_deployer" {
  count = local.github_wif ? 1 : 0

  service_account_id = google_service_account.deployer[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository_id/${var.github_repository_id}"
}

# The deployer pushes images and rolls out new Cloud Run revisions, nothing else.
resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  count = local.github_wif ? 1 : 0

  location   = google_artifact_registry_repository.backend.location
  repository = google_artifact_registry_repository.backend.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deployer[0].member
}

resource "google_cloud_run_v2_service_iam_member" "deployer_deploys" {
  count = local.github_wif ? 1 : 0

  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.developer"
  member   = google_service_account.deployer[0].member
}

# Deploying a revision that runs as spry-api needs actAs on that account.
resource "google_service_account_iam_member" "deployer_acts_as_api" {
  count = local.github_wif ? 1 : 0

  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer[0].member
}

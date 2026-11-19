# Counterpart of ECR peach-backend. 0.5 GB stored is free.
resource "google_artifact_registry_repository" "backend" {
  repository_id = "spry"
  location      = var.region
  format        = "DOCKER"
  description   = "Spry backend images for Cloud Run"

  # Keep the free tier: only the 5 newest images survive.
  cleanup_policies {
    id     = "keep-5-newest"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }
  cleanup_policies {
    id     = "delete-the-rest"
    action = "DELETE"
    condition {
      tag_state = "ANY"
    }
  }

  depends_on = [google_project_service.enabled]
}

locals {
  registry_host = "${var.region}-docker.pkg.dev"
  backend_image = "${local.registry_host}/${var.project_id}/${google_artifact_registry_repository.backend.repository_id}/backend:${var.backend_image_tag}"
}

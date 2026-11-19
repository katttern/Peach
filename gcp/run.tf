# The API: the same image as on ECS (backend/Dockerfile), no Lambda adapter.
# Cloud Run sends HTTP to $PORT (8080); the Dockerfile CMD runs `alembic upgrade head`
# on start, so an empty Cloud SQL database gets the schema on the first deploy.
resource "google_cloud_run_v2_service" "api" {
  name                = "spry-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = 0 # scales to zero: an idle month costs nothing
      max_instance_count = var.max_instances
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    containers {
      image = local.backend_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true # request-based billing: CPU only while a request is served
        startup_cpu_boost = true # migrations + imports on a cold start
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "COGNITO_AUTHORITY"
        value = var.cognito_authority
      }
      env {
        name  = "COGNITO_CLIENT_ID"
        value = var.cognito_client_id
      }
      env {
        # Firebase rewrites /api/** here, so the browser is same-origin; localhost is for dev.
        name  = "CORS_ORIGINS"
        value = "https://${var.project_id}.web.app,https://${var.project_id}.firebaseapp.com,http://localhost:5173"
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      startup_probe {
        tcp_socket {
          port = 8080
        }
        initial_delay_seconds = 0
        period_seconds        = 5
        failure_threshold     = 24 # up to 2 minutes for migrations on a cold Cloud SQL
      }
    }
  }

  depends_on = [
    google_project_iam_member.api_sql_client,
    google_secret_manager_secret_iam_member.api_reads_database_url,
    google_secret_manager_secret_version.database_url,
  ]
}

# Public, because the API checks Cognito tokens itself: every /api route except none
# answers 401 without a valid access token (app/auth.py).
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Two secrets, two versions: well inside the 6 free active versions.
#   spry-db-password  - for people (psql through the Cloud SQL Auth Proxy);
#   spry-database-url - what the API reads. The app takes one DATABASE_URL and Cloud Run
#                       does not expand ${VAR} inside env values, so the URL is the secret.

resource "google_secret_manager_secret" "db_password" {
  secret_id = "spry-db-password"
  replication {
    auto {}
  }
  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db.result
}

resource "google_secret_manager_secret" "database_url" {
  secret_id = "spry-database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id
  # psycopg connects through the Unix socket that Cloud Run mounts under /cloudsql.
  secret_data = format(
    "postgresql+psycopg://%s:%s@/%s?host=/cloudsql/%s",
    google_sql_user.app.name,
    random_password.db.result,
    google_sql_database.spry.name,
    google_sql_database_instance.main.connection_name,
  )
}

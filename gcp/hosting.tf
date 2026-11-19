# The frontend: Firebase Hosting (CDN + managed HTTPS, free plan) instead of S3 + CloudFront.
# Terraform creates the Firebase project and the site; the files are deployed with
# `firebase deploy --only hosting` (firebase.json at the repo root), which also
# rewrites /api/** to the Cloud Run service: one origin, no CORS, as CloudFront did.
resource "google_firebase_project" "main" {
  provider   = google-beta
  project    = var.project_id
  depends_on = [google_project_service.enabled]
}

resource "google_firebase_hosting_site" "web" {
  provider   = google-beta
  project    = google_firebase_project.main.project
  site_id    = var.project_id # the default site: https://<project-id>.web.app
  depends_on = [google_firebase_project.main]
}

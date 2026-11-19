terraform {
  required_version = ">= 1.10"

  # Its own state: a second HCP Terraform workspace next to peach-dev (infra/, AWS).
  # One plan cannot touch both clouds. Not created yet: the lab took the
  # no-GCP-account route (see docs/lab9/submission.md), so only
  # `terraform init -backend=false` and `terraform validate` are run.
  cloud {
    organization = "peach_katttern"

    workspaces {
      name = "peach-gcp"
    }
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# Credentials: never a JSON key. On a laptop, `gcloud auth application-default login`;
# in HCP Terraform, Workload Identity Federation (wif.tf + TFC_GCP_* workspace variables).
provider "google" {
  project = var.project_id
  region  = var.region

  default_labels = {
    project    = "spry"
    managed-by = "terraform"
  }
}

# Firebase Hosting resources exist only in the beta provider.
provider "google-beta" {
  project = var.project_id
  region  = var.region

  default_labels = {
    project    = "spry"
    managed-by = "terraform"
  }
}

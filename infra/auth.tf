# Former stack peach-auth (infra/auth.yml): Cognito user pool with email +
# password and Google sign-in, hosted managed login.

resource "aws_cognito_user_pool" "main" {
  name           = "${var.project_name}-users"
  user_pool_tier = "ESSENTIALS"

  # Changing username_attributes / alias_attributes or adding schema blocks
  # replaces the pool (and loses every user). The template had no Schema, so
  # there are no schema blocks: only the standard attributes exist.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  # The values below were not in the template; they are what Cognito set by
  # default, written out so the import shows no changes.
  sign_in_policy {
    allowed_first_auth_factors = ["PASSWORD"]
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
    recovery_mechanism {
      name     = "verified_phone_number"
      priority = 2
    }
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  # Cognito fills in the Google endpoints itself; they are listed so the plan
  # after import does not try to remove them.
  provider_details = {
    client_id                     = var.google_client_id
    client_secret                 = var.google_client_secret
    authorize_scopes              = "openid email profile"
    attributes_url                = "https://people.googleapis.com/v1/people/me?personFields="
    attributes_url_add_attributes = "true"
    authorize_url                 = "https://accounts.google.com/o/oauth2/v2/auth"
    oidc_issuer                   = "https://accounts.google.com"
    token_request_method          = "POST"
    token_url                     = "https://www.googleapis.com/oauth2/v4/token"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    username       = "sub"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project_name}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  # No generate_secret: it is ForceNew and not returned by the API, so
  # setting it (even to false) replaces the imported client. Unset = no secret.
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  # Referencing the provider replaces the template's DependsOn: GoogleProvider.
  supported_identity_providers = ["COGNITO", aws_cognito_identity_provider.google.provider_name]

  # Cognito returns the URLs sorted; keep that order to avoid a diff.
  callback_urls = sort(["${var.site_url}/", "http://localhost:5173/"])
  logout_urls   = sort(["${var.site_url}/", "http://localhost:5173/"])

  refresh_token_validity                        = 30
  auth_session_validity                         = 3
  enable_token_revocation                       = true
  enable_propagate_additional_user_context_data = false
}

resource "aws_cognito_user_pool_domain" "main" {
  domain                = var.domain_prefix
  user_pool_id          = aws_cognito_user_pool.main.id
  managed_login_version = 2
}

resource "aws_cognito_managed_login_branding" "web" {
  user_pool_id                = aws_cognito_user_pool.main.id
  client_id                   = aws_cognito_user_pool_client.web.id
  use_cognito_provided_values = true
}

# ADR 0007: Manage the project's AWS infrastructure with Terraform in HCP Terraform

- **Status:** Accepted, 2026-10-31
- **Deciders:** Spry team (Lab 7)
- **Supersedes:** the CloudFormation stacks `peach-auth` (Lab 4), `peach-reports` (Lab 5), `peach-ai` (Lab 6)
- **Related:** [infra/](../../infra/), [migration review](../../infra/migration/review.md), [README → Інфраструктура](../../README.md#інфраструктура), [ADR 0006](0006-llm-agenda-parsing.md)

## Context

Labs 4–6 created the Cognito user pool, the weekly report and the agenda parser with three CloudFormation templates,
deployed by hand from a laptop (`make deploy-auth`, `make deploy-ai`, a console deploy for the reports stack).
That had three problems:

- **The repo did not describe reality.** `infra/reports.yml` no longer matched the deployed stack: the live stack
  owned its own RDS and had no SES identities. Deploying the file would have deleted the database.
- **Who changed what was not recorded.** Any developer with AWS keys could run `cloudformation deploy`. Nobody
  reviewed a plan before it ran, and there was no record of who ran it.
- **The project already goes beyond one AWS account and one cloud**: a Google OAuth client, a GitHub repository,
  CloudFront, two AWS regions. A second environment (stage) is coming.

## Decision

1. **Terraform (HCL), one root module in `infra/`**: `auth.tf`, `reports.tf`, `ai.tf`, `variables.tf`,
   `outputs.tf`, `versions.tf`. The existing resources were **imported, not re-created**. The stacks were first
   updated with `DeletionPolicy: Retain` and deleted. 43 resources were imported and 1 re-created (the S3 bucket
   notification), and nothing was destroyed (see [review](../../infra/migration/review.md#результат-міграції)).
2. **State and runs in HCP Terraform**: organization `peach_katttern`, workspace `peach-dev`, remote execution.
   The workspace is connected to `katttern/Peach` (working directory `infra`, branch `main`). A pull request gets
   a speculative plan as a check. A merge to `main` queues a run, and a person confirms the apply in HCP
   (auto-apply is off).
3. **No AWS keys in HCP Terraform.** Every run exchanges an OIDC token for short-lived credentials of the
   role `hcp-terraform-peach_katttern`. The role and the OIDC provider are created by a small bootstrap
   configuration with local state, outside this repository.
4. **No `terraform apply` from laptops.** The Makefile has `infra-init`, `infra-fmt`, `infra-validate`,
   `infra-plan` and reads values with `terraform output -raw`. It has no apply target.

## Why Terraform, and not…

| Option | Why not, for this project |
|---|---|
| **Stay on CloudFormation** | AWS-only. The Google OAuth client, GitHub branch protection and DNS outside AWS cannot be in the same plan. Our templates had already drifted from the live stacks without anyone noticing. Change sets are optional, and Terraform's plan is the centre of the workflow. |
| **AWS CDK** | Synthesises CloudFormation, so it has the same AWS-only boundary and the same stacks, with a second language (TypeScript/Python) on top. It would not solve the multi-provider need. |
| **OpenTofu** | Reads the same HCL and would work as well. We chose Terraform because the course and HCP Terraform (state, locking, VCS-driven runs, OIDC to AWS) are built around it. Moving to OpenTofu later is a change of binary and backend, not a rewrite. The trigger would be the BSL licence or the cost of HCP Terraform. |

## Who can change the infrastructure, and how

- **Anyone on the team proposes**, by opening a pull request against `infra/`. The plan appears as a check on
  the PR. An AI assistant may draft the change and run `terraform plan`, but it goes through the same PR.
- **A reviewer approves the plan, not only the HCL diff**, and looks for `destroy`, `-/+` and `forces replacement`.
  `prevent_destroy` guards the user pool, the reports bucket and the database.
- **Only HCP Terraform applies**, after the merge to `main`, once a member of the organization confirms it.
  Local `terraform plan` runs remotely as a speculative plan and cannot apply.
- **Changes made by hand in the console are drift.** The next plan shows them and would revert them. A hot fix
  made by hand must be followed by a PR that writes the same value into `infra/`.

## Where the secrets end up

| Secret | Where it is | Who can see it |
|---|---|---|
| Google client secret, DB password | HCP workspace variables, *Sensitive* (write-only in the UI and API) | nobody reads them back. Workspace admins can overwrite them |
| The same values in **state** | HCP Terraform state of `peach-dev`, in plain text (`provider_details.client_secret`, `DATABASE_URL` of the builder) | anyone with state read access in the organization, or anyone who runs `terraform state pull` |
| The same values in AWS | Cognito IdP config, Lambda environment of the builder | IAM principals with `cognito-idp:Describe*` / `lambda:GetFunctionConfiguration` |
| Plans and logs | shown as `(sensitive value)` | — |
| Git | none. `terraform.tfvars` holds only non-secret values, and `.env` is gitignored | — |

Consequences: access to the HCP organization and to state reads is limited to the team. Nobody shares state or
`state pull` output. Moving `DATABASE_URL` to Secrets Manager would take the password out of the Lambda environment
and out of the state. That is a follow-up.

## What happens if HCP Terraform is down

- **The running system is not affected.** HCP Terraform is not on the request path: Cognito, Lambda, RDS, S3 and
  SQS keep working.
- **Infrastructure changes wait.** No plans, no applies, no state reads. `make deploy-frontend`/`deploy-backend`
  cannot read `terraform output` either, so application deploys that need those values wait too, unless the values
  are passed by hand.
- **In a real emergency**, an owner can switch the workspace to Local execution once HCP is back, or apply from a
  laptop against the remote state with their own credentials (the first row of the table in Part 0). Every state
  version is kept in HCP, so a broken apply can be compared with the previous version.

## Consequences

- One reviewed, planned road for infrastructure changes. Drift shows up on every plan.
- The state is now ours to protect (HCP Terraform with locking and versions). Losing access to the organization
  means losing control of the resources. They keep running, but they would have to be re-imported.
- A failed apply stops halfway, with no automatic rollback. The fix is another commit and apply.
- Still outside Terraform: the ECS backend (eu-north-1), the frontend bucket and CloudFront, the ECR repositories.
  They are candidates for the next migration.

#!/bin/sh
# Deploy infra/auth.yml with EVERY parameter passed explicitly from .env.
# `cloudformation deploy` silently reuses a parameter's previous value when it is
# omitted, so a stale Google secret would survive a redeploy without this.
# Secrets go through a 0600 temp file (not argv) and are never printed.
#   deploy-auth.sh <stack> <region> <domain-prefix> <site-url> [--dry-run]
set -eu
stack="$1" region="$2" domain_prefix="$3" site_url="$4" mode="${5:-}"

env_value() {
  # Plain KEY=value lines only; .env is never sourced or executed.
  sed -n "s/^$1=//p" .env | tail -n 1
}
# Fingerprint only: sha256 of the first 8 chars plus the length.
mask() {
  printf '<len %s, sha256(first8) %s>' "${#1}" \
    "$(printf %s "$1" | cut -c1-8 | tr -d '\n' | shasum -a 256 | cut -c1-16)"
}

client_id=$(env_value GOOGLE_CLIENT_ID)
client_secret=$(env_value GOOGLE_CLIENT_SECRET)
for name in client_id client_secret; do
  eval "value=\$$name"
  case "$value" in
    "") echo "$name is empty in .env" >&2; exit 1 ;;
    *[[:space:]\"\']*) echo "$name in .env has quotes or whitespace" >&2; exit 1 ;;
  esac
done
case "$client_secret" in
  GOCSPX-*) ;;
  *) echo "GOOGLE_CLIENT_SECRET does not start with GOCSPX-" >&2; exit 1 ;;
esac

# Preflight: a bogus code with a valid secret gives invalid_grant; a bad secret
# gives invalid_client. Only Google sees the secret, exactly as Cognito sends it.
redirect="https://$domain_prefix.auth.$region.amazoncognito.com/oauth2/idpresponse"
verdict=$(CID="$client_id" CSEC="$client_secret" REDIRECT="$redirect" python3 -c '
import os, urllib.parse
print(urllib.parse.urlencode({"client_id": os.environ["CID"],
  "client_secret": os.environ["CSEC"], "code": "preflight-invalid-code",
  "grant_type": "authorization_code", "redirect_uri": os.environ["REDIRECT"]}), end="")
' | curl -s --data @- https://oauth2.googleapis.com/token |
  python3 -c 'import json,sys; print(json.load(sys.stdin).get("error",""))')
if [ "$verdict" = "invalid_client" ]; then
  echo "Google rejects GOOGLE_CLIENT_SECRET for this client id (invalid_client)." >&2
  echo "Copy the current secret of this OAuth client from Google Cloud Console into .env." >&2
  exit 1
fi
echo "Google preflight: $verdict (expected invalid_grant for a valid secret)"

params=$(mktemp)
chmod 600 "$params"
trap 'rm -f "$params"' EXIT
CID="$client_id" CSEC="$client_secret" python3 -c '
import json, os, sys
json.dump([
  {"ParameterKey": "ProjectName", "ParameterValue": "peach"},
  {"ParameterKey": "DomainPrefix", "ParameterValue": sys.argv[1]},
  {"ParameterKey": "SiteUrl", "ParameterValue": sys.argv[2]},
  {"ParameterKey": "GoogleClientId", "ParameterValue": os.environ["CID"]},
  {"ParameterKey": "GoogleClientSecret", "ParameterValue": os.environ["CSEC"]},
], open(sys.argv[3], "w"))
' "$domain_prefix" "$site_url" "$params"

echo "aws cloudformation deploy --region $region --stack-name $stack --template-file infra/auth.yml \\"
echo "  --parameter-overrides ProjectName=peach DomainPrefix=$domain_prefix SiteUrl=$site_url \\"
echo "    GoogleClientId=$(mask "$client_id") GoogleClientSecret=$(mask "$client_secret")"
[ "$mode" = "--dry-run" ] && { echo "(dry run, nothing deployed)"; exit 0; }

aws cloudformation deploy --region "$region" --stack-name "$stack" \
  --template-file infra/auth.yml --parameter-overrides "file://$params" \
  --no-fail-on-empty-changeset
aws cloudformation describe-stacks --region "$region" --stack-name "$stack" \
  --query "Stacks[0].StackStatus" --output text

pool=$(aws cloudformation describe-stacks --region "$region" --stack-name "$stack" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
aws cognito-idp describe-identity-provider --region "$region" --user-pool-id "$pool" \
  --provider-name Google --query "IdentityProvider.ProviderDetails" --output json |
  CID="$client_id" CSEC="$client_secret" python3 -c '
import json, os, sys
p = json.load(sys.stdin)
print("Cognito client_id matches .env:", p.get("client_id") == os.environ["CID"])
print("Cognito client_secret len:", len(p.get("client_secret", "")),
      "| .env len:", len(os.environ["CSEC"]),
      "| identical:", p.get("client_secret") == os.environ["CSEC"])'

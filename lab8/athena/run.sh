#!/usr/bin/env bash
# Runs one .sql file in Athena (workgroup lab8), waits for it, saves the result
# to results/<name>.csv and appends a line to results/stats.csv.
# Usage: lab8/athena/run.sh lab8/athena/03_turnover.sql
set -euo pipefail

REGION=us-east-1
WORKGROUP=lab8
DATABASE=lab8
RESULTS_DIR="${RESULTS_DIR:-$(cd "$(dirname "$0")" && pwd)/results}"

file="${1:?usage: run.sh <file.sql>}"
name="$(basename "$file" .sql)"
export AWS_PAGER=""

id="$(aws athena start-query-execution --region "$REGION" --work-group "$WORKGROUP" \
  --query-execution-context "Database=$DATABASE" \
  --query-string "$(cat "$file")" \
  --query QueryExecutionId --output text)"

while true; do
  state="$(aws athena get-query-execution --region "$REGION" --query-execution-id "$id" \
    --query QueryExecution.Status.State --output text)"
  case "$state" in
    SUCCEEDED) break ;;
    FAILED | CANCELLED)
      reason="$(aws athena get-query-execution --region "$REGION" --query-execution-id "$id" \
        --query QueryExecution.Status.StateChangeReason --output text)"
      echo "$name: $state: $reason" >&2
      exit 1
      ;;
  esac
  sleep 2
done

read -r scanned engine total output <<<"$(aws athena get-query-execution --region "$REGION" \
  --query-execution-id "$id" --output text \
  --query 'QueryExecution.[Statistics.DataScannedInBytes,Statistics.EngineExecutionTimeInMillis,Statistics.TotalExecutionTimeInMillis,ResultConfiguration.OutputLocation]')"

# DDL statements (CREATE TABLE, CTAS, CREATE VIEW) leave no CSV to download.
if [[ "$output" == *.csv ]]; then
  aws s3 cp "$output" "$RESULTS_DIR/$name.csv" --region "$REGION" --only-show-errors
fi

stats="$RESULTS_DIR/stats.csv"
[[ -f "$stats" ]] || echo "name,DataScannedInBytes,EngineExecutionTimeInMillis,TotalExecutionTimeInMillis" >"$stats"
echo "$name,$scanned,$engine,$total" >>"$stats"
echo "$name: scanned=$scanned engine=${engine}ms total=${total}ms"

import json
import logging
import os

from alembic import command
from alembic.config import Config

from app.reports.seed import seed_demo_data
from app.reports.weekly import build_weekly_report, previous_iso_week

log = logging.getLogger()
log.setLevel(logging.INFO)


def handler(event, context):
    records = event.get("Records")
    if records and records[0].get("eventSource") == "aws:sqs":
        return [_run(json.loads(r["body"]), from_sqs=True) for r in records]
    return _run(event, from_sqs=False)


def _run(payload: dict, from_sqs: bool) -> dict:
    action = payload.get("action", "report")
    if action == "migrate":
        command.upgrade(Config("alembic.ini"), "head")
        log.info("report-builder migrated trigger=direct")
        return {"migrated": True}

    week = payload.get("week") or previous_iso_week()
    source = payload.get("source", "manual")
    if source == "schedule":
        trigger = "schedule"
    elif from_sqs:
        trigger = "sqs"
    else:
        trigger = "direct"
    log.info(
        "report-builder triggered trigger=%s requested_by=%s week=%s action=%s",
        trigger,
        source,
        week,
        action,
    )

    if action == "seed":
        return {"seeded": seed_demo_data(week)}

    if week == os.environ.get("FAIL_WEEK"):
        raise RuntimeError(f"deliberate failure for {week}")

    import boto3

    body = build_weekly_report(week)
    key = f"reports/{week}.csv"
    boto3.client("s3").put_object(
        Bucket=os.environ["REPORTS_BUCKET"],
        Key=key,
        Body=body,
        ContentType="text/csv",
    )
    log.info("report-builder saved key=%s bytes=%d", key, len(body))
    return {"key": key}

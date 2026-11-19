"""Lab 8, Part 4: replays one day of payment events into Kinesis Data Streams.

Events are sent in receivedAt order and their timestamps are not changed, so a late event
arrives after its neighbours, as in production.

Usage:
    python producer_kinesis.py --file events.jsonl --limit 20000 --rate 11
"""

import argparse
import json
import random
import sys
import time
from pathlib import Path

import boto3

# PutRecords accepts at most 500 records per call.
MAX_BATCH = 500
# Send once a second even if the batch is not full: at 33 records/s, waiting for 500 records
# would add a 15-second delay.
FLUSH_SECONDS = 1.0
MAX_RETRIES = 5


def parse_args():
    parser = argparse.ArgumentParser(description="Replay payment events into Kinesis")
    parser.add_argument("--file", type=Path, default=Path("events.jsonl"))
    parser.add_argument("--stream", default="lab8-payments")
    # Explicit, because the default region of this account is eu-north-1.
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--rate", type=float, default=20.0, help="payments per second")
    parser.add_argument("--fail-rate", type=float, default=0.0, help="share of success payments turned into failure")
    parser.add_argument("--limit", type=int, default=None, help="send only N records")
    parser.add_argument("--start-at", default=None, help="start from this receivedAt time, HH:MM (UTC)")
    parser.add_argument("--seed", type=int, default=42, help="seed for --fail-rate")
    return parser.parse_args()


def load_events(path):
    with path.open(encoding="utf-8") as file:
        events = [json.loads(line) for line in file]
    # ISO 8601 strings in one format sort like the times they hold, so no parsing is needed.
    events.sort(key=lambda event: event["receivedAt"])
    return events


def inject_failures(events, fail_rate, seed):
    """Turns success into failure for a share of payments and returns how many were changed."""
    # Pick payments, not events: a duplicated success must change together with its original,
    # otherwise one payment would be both successful and failed.
    # sorted makes the choice repeatable, because set order differs between Python runs.
    successful = sorted({event["invoiceId"] for event in events if event["status"] == "success"})
    rng = random.Random(seed)
    doomed = {invoice for invoice in successful if rng.random() < fail_rate}
    for event in events:
        if event["status"] == "success" and event["invoiceId"] in doomed:
            event["status"] = "failure"
            event["finalAmount"] = 0
            event["failureReason"] = "Injected failure"
    return len(doomed)


def skip_to(events, start_at):
    """Drops the events before the first one with receivedAt >= HH:MM."""
    for index, event in enumerate(events):
        # Characters 11-15 of 2026-10-01T17:00:05Z are HH:MM. Find the first match instead of
        # filtering, to keep the tail after midnight (00:06 comes after 23:59 in the replay).
        if event["receivedAt"][11:16] >= start_at:
            return events[index:]
    return []


def to_record(event):
    return {
        # Firehose joins records into a file with no separator. Without '\n' a file would be one
        # long line, and Athena would read one row per file.
        "Data": (json.dumps(event, ensure_ascii=False) + "\n").encode(),
        # The key is hashed to a shard, so all events of a payment keep their order in one shard.
        "PartitionKey": event["invoiceId"],
    }


def put_batch(client, stream, records):
    """Sends a batch and retries rejected records. Returns (FailedRecordCount total, undelivered)."""
    failed_total = 0
    pending = records

    for attempt in range(MAX_RETRIES + 1):
        response = client.put_records(StreamName=stream, Records=pending)
        failed = response["FailedRecordCount"]
        failed_total += failed
        if failed == 0:
            return failed_total, 0

        # The call succeeds even if some records were rejected, so there is no exception to catch.
        # The response keeps the request order, and a rejected record has an ErrorCode field.
        pending = [
            record
            for record, result in zip(pending, response["Records"], strict=True)
            if "ErrorCode" in result
        ]
        if attempt < MAX_RETRIES:
            # Usually the shard limit, so back off: 0.1, 0.2, 0.4 s and so on.
            time.sleep(0.1 * 2**attempt)

    return failed_total, len(pending)


def main():
    args = parse_args()
    events = load_events(args.file)

    # The rate is in payments, but events are sent, about 3 per payment.
    records_per_second = args.rate * len(events) / len({event["invoiceId"] for event in events})

    # Inject failures before --limit and --start-at, so the share does not depend on the slice.
    doomed = inject_failures(events, args.fail_rate, args.seed) if args.fail_rate else 0
    if args.start_at:
        events = skip_to(events, args.start_at)
    if args.limit:
        events = events[: args.limit]

    print(
        f"sending {len(events)} records to {args.stream} ({args.region}): {args.rate} payments/s = "
        f"{records_per_second:.1f} records/s, injected failures: {doomed}",
        flush=True,
    )

    client = boto3.client("kinesis", region_name=args.region)
    batch = []
    sent = 0
    failed_total = 0
    undelivered = 0
    started = time.monotonic()
    last_flush = started

    def flush():
        nonlocal batch, sent, failed_total, undelivered, last_flush
        if batch:
            failed, lost = put_batch(client, args.stream, batch)
            sent += len(batch) - lost
            failed_total += failed
            undelivered += lost
            print(
                f"batch={len(batch)} sent={sent} FailedRecordCount={failed} "
                f"failed_total={failed_total} undelivered={undelivered}",
                flush=True,
            )
            batch = []
        last_flush = time.monotonic()

    try:
        for index, event in enumerate(events):
            # Each record has its own send time relative to the start, so the time spent in API
            # calls does not add up and the rate does not drift.
            delay = started + index / records_per_second - time.monotonic()
            if delay > 0:
                time.sleep(delay)

            batch.append(to_record(event))
            if len(batch) >= MAX_BATCH or time.monotonic() - last_flush >= FLUSH_SECONDS:
                flush()
    except KeyboardInterrupt:
        print("interrupted, sending the last batch", flush=True)

    flush()
    print(f"done: sent={sent} failed_total={failed_total} undelivered={undelivered}", flush=True)
    if undelivered:
        sys.exit(1)


if __name__ == "__main__":
    main()

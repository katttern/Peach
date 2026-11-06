"""Lab 8, Part 4: той самий replay, що в Part 3, але в Kinesis Data Streams.

Приклади:
    python producer_kinesis.py --limit 2000 --rate 20 --start-at 17:00
    python producer_kinesis.py --limit 2000 --rate 20 --start-at 17:00 --fail-rate 0.3
"""

import argparse
import json
import sys
import time
from pathlib import Path

import boto3

# Спільна логіка лежить поруч із продюсером Part 3. Це окремий скрипт, а не пакет,
# тому додаємо теку в шлях імпорту вручну.
STREAMING_DIR = Path(__file__).resolve().parent.parent / "streaming"
sys.path.insert(0, str(STREAMING_DIR))

from replay import prepare_events  # noqa: E402

DEFAULT_FILE = STREAMING_DIR / "data" / "events.jsonl"
# Межа API: не більше 500 записів в одному виклику PutRecords.
MAX_BATCH = 500
# Відправляємо раз на секунду, навіть якщо пачка неповна: при 60 повідомленнях/с
# чекати 500 записів означало б затримку у 8 секунд.
FLUSH_SECONDS = 1.0
MAX_RETRIES = 5


def parse_args():
    parser = argparse.ArgumentParser(description="Replay payment events into Kinesis")
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
    parser.add_argument("--stream", default="lab8-payments")
    # Явно, бо регіон за замовчуванням у цьому акаунті eu-north-1, а стрім живе в us-east-1.
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--rate", type=float, default=20.0, help="платежів за секунду")
    parser.add_argument("--fail-rate", type=float, default=0.0, help="частка success, що стане failure")
    parser.add_argument("--limit", type=int, default=None, help="надіслати лише N записів")
    parser.add_argument("--start-at", default=None, help="почати з цього часу receivedAt, HH:MM (UTC)")
    parser.add_argument("--seed", type=int, default=42, help="seed для --fail-rate")
    return parser.parse_args()


def to_record(event):
    return {
        # Firehose склеює записи в один файл без роздільника. Без '\n' вийшов би один довгий рядок
        # на файл, а JSON SerDe читає файл порядково: Athena побачила б лише один рядок із файлу.
        "Data": (json.dumps(event, ensure_ascii=False) + "\n").encode(),
        # Ключ хешується в шард, тому всі події платежу йдуть в один шард і зберігають порядок.
        # Зараз шард один, але ключ потрібен, щоб код не зламався зі збільшенням їх кількості.
        "PartitionKey": event["invoiceId"],
    }


def put_batch(client, stream, records):
    """Надсилає пачку, повторює відхилені записи. Повертає (сума FailedRecordCount, кількість недоставлених)."""
    failed_total = 0
    pending = records

    for attempt in range(MAX_RETRIES + 1):
        response = client.put_records(StreamName=stream, Records=pending)
        failed = response["FailedRecordCount"]
        failed_total += failed
        if failed == 0:
            return failed_total, 0

        # Головна пастка PutRecords: виклик успішний, навіть якщо частина записів відхилена.
        # Винятку не буде, тому FailedRecordCount треба перевіряти самим. Відповідь іде в тому самому
        # порядку, що й запит, а відхилений запис має поле ErrorCode. Повторюємо лише такі.
        pending = [
            record
            for record, result in zip(pending, response["Records"], strict=True)
            if "ErrorCode" in result
        ]
        if attempt < MAX_RETRIES:
            # Найчастіша причина це ліміт шарда, тож пауза росте: 0.1, 0.2, 0.4 с і далі.
            # Повторений запис потрапляє в шард після сусідів, тому порядок може порушитись.
            # Це нормально: consumer рахує за event time, а не за порядком прибуття.
            time.sleep(0.1 * 2**attempt)

    return failed_total, len(pending)


def main():
    args = parse_args()
    events, records_per_second, doomed = prepare_events(
        args.file, args.rate, args.fail_rate, args.seed, args.start_at, args.limit
    )
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
            # Той самий розклад, що в Part 3: кожен запис має свій момент відносно старту,
            # тому час самих викликів API не накопичується і темп не пливе.
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

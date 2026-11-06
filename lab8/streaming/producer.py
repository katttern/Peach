"""Lab 8, Part 3: replay одного дня платежів у топік payments.

Події йдуть у порядку receivedAt, тобто в тому порядку, в якому вони дійшли до нас.
Мітки часу не змінюються, тому запізніла подія (старий modifiedDate) приходить пізніше
за сусідні, як у продакшні.

Приклади:
    python producer.py --rate 20
    python producer.py --limit 2000 --rate 200 --start-at 17:00 --fail-rate 0.3
"""

import argparse
import json
import sys
import time
from pathlib import Path

from confluent_kafka import Producer

from replay import prepare_events

DEFAULT_FILE = Path(__file__).parent / "data" / "events.jsonl"
LOG_EVERY = 1000


def parse_args():
    parser = argparse.ArgumentParser(description="Replay payment events into Redpanda")
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
    parser.add_argument("--bootstrap", default="localhost:19092")
    parser.add_argument("--topic", default="payments")
    parser.add_argument("--rate", type=float, default=20.0, help="платежів за секунду")
    parser.add_argument("--fail-rate", type=float, default=0.0, help="частка success, що стане failure")
    parser.add_argument("--limit", type=int, default=None, help="надіслати лише N повідомлень")
    parser.add_argument("--start-at", default=None, help="почати з цього часу receivedAt, HH:MM (UTC)")
    parser.add_argument("--seed", type=int, default=42, help="seed для --fail-rate, щоб запуск був відтворюваним")
    return parser.parse_args()


def main():
    args = parse_args()
    events, messages_per_second, doomed = prepare_events(
        args.file, args.rate, args.fail_rate, args.seed, args.start_at, args.limit
    )

    print(
        f"sending {len(events)} messages to {args.topic}: {args.rate} payments/s = "
        f"{messages_per_second:.1f} messages/s, injected failures: {doomed}",
        flush=True,
    )

    delivered = 0
    failed = 0

    def on_delivery(error, _message):
        # Викликається з producer.poll() або flush(), коли брокер підтвердив запис або відмовив.
        nonlocal delivered, failed
        if error:
            failed += 1
            print(f"delivery failed: {error}", file=sys.stderr, flush=True)
        else:
            delivered += 1

    producer = Producer(
        {
            "bootstrap.servers": args.bootstrap,
            # Порт опубліковано лише на 127.0.0.1, тож спроби через ::1 дали б помилки в лозі.
            "broker.address.family": "v4",
            # Повторна спроба після збою мережі не створить дубля в лозі.
            # Дублі в даних лишаються навмисно: вони прийшли з датасету.
            "enable.idempotence": True,
            # Чекаємо до 5 мс, щоб зібрати пачку: менше запитів, а затримка непомітна.
            "linger.ms": 5,
        }
    )

    started = time.monotonic()
    sent = 0
    try:
        for index, event in enumerate(events):
            # Кожне повідомлення має свій момент відправки відносно старту. Якщо просто спати
            # 1/rate між повідомленнями, час самої відправки накопичувався б, і темп поплив би.
            delay = started + index / messages_per_second - time.monotonic()
            if delay > 0:
                time.sleep(delay)

            while True:
                try:
                    producer.produce(
                        args.topic,
                        # Ключ хешується в номер партиції, тому всі події платежу йдуть в одну
                        # партицію. У межах партиції Kafka зберігає порядок.
                        key=event["invoiceId"].encode(),
                        # ensure_ascii=False лишає кирилицю читабельною в Console.
                        value=json.dumps(event, ensure_ascii=False).encode(),
                        on_delivery=on_delivery,
                    )
                    break
                except BufferError:
                    # Локальна черга заповнена: даємо бібліотеці відправити частину і пробуємо знову.
                    producer.poll(0.1)

            # produce() лише кладе в чергу. poll(0) не блокує і запускає накопичені on_delivery.
            producer.poll(0)
            sent = index + 1
            if sent % LOG_EVERY == 0:
                rate = sent / (time.monotonic() - started)
                print(f"sent={sent} delivered={delivered} rate={rate:.1f} msg/s receivedAt={event['receivedAt']}", flush=True)
    except KeyboardInterrupt:
        print("interrupted, flushing", flush=True)

    # Дочекатись підтвердження всього, що ще в черзі, інакше хвіст пропаде при виході.
    undelivered = producer.flush(30)
    print(f"done: sent={sent} delivered={delivered} failed={failed} undelivered={undelivered}", flush=True)
    if failed or undelivered:
        sys.exit(1)


if __name__ == "__main__":
    main()

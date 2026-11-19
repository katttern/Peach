"""Lab 8, Part 3: частка failure у хвилинних вікнах event time, з алертами.

Приклади:
    python consumer.py --run-name baseline
    python consumer.py --run-name no-wait --lateness 0 --group lab8-no-wait
"""

import argparse
import json
import signal
import time
from datetime import UTC, datetime
from pathlib import Path

from confluent_kafka import Consumer

WINDOW_SECONDS = 60
ALERT_SHARE = 0.10
# На 2–3 платежах одна помилка дає 33–50%, тож без мінімуму алерт був би шумом.
ALERT_MIN_N = 5
STATS_EVERY_SECONDS = 30
FINAL_STATUSES = {"success", "failure"}
OUTPUT_DIR = Path(__file__).parent / "outputs"


def parse_time(value):
    """Рядок 2026-10-01T08:15:31Z у секунди Unix."""
    return int(datetime.fromisoformat(value).timestamp())


def format_time(seconds):
    return datetime.fromtimestamp(seconds, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class FailureRateWindows:
    """Дедуплікація і вікна. Не знає про Kafka: на вхід приходить подія, на вихід рядки логу."""

    def __init__(self, lateness, watermark_mode, log):
        self.lateness = lateness
        self.watermark_mode = watermark_mode
        self.log = log
        # Множина росте без меж: за день ~100 тис. ключів. У продакшні це Redis або стан Flink із TTL.
        self.seen = set()
        # Початок вікна -> метод оплати -> [усього фінальних подій, із них failure].
        self.windows = {}
        # Партиції, призначені цьому споживачу. Оновлюються при кожному rebalance.
        self.assigned = set()
        # Партиція -> найбільший modifiedDate, який ми в ній бачили.
        self.partition_max = {}
        # None, поки watermark не визначений: тоді нічого не закриваємо і нічого не вважаємо запізнілим.
        self.watermark = None
        self.consumed = 0
        self.duplicates = 0
        self.late_dropped = 0
        # Частина late_dropped, що справді змінила б числа: у вікнах рахуються лише фінальні статуси.
        self.late_final = 0
        self.windows_closed = 0
        self.alerts = 0

    def set_assigned(self, partitions):
        self.assigned = set(partitions)
        # Забуваємо лише партиції, які в нас забрали. Сам watermark лишається: він не йде назад.
        self.partition_max = {p: t for p, t in self.partition_max.items() if p in self.assigned}

    def advance_watermark(self, partition, event_time):
        """Watermark каже: подій старших за цей момент більше не чекаємо. Рухається лише в event time."""
        # Годинник ноутбука тут не можна використовувати: replay стискає добу приблизно в 50 разів,
        # тож секунда реального часу це ~50 секунд часу подій. Watermark рухають лише самі події.
        key = partition if self.watermark_mode == "partition" else "all"
        # max, бо запізніла подія не має повертати час назад.
        self.partition_max[key] = max(self.partition_max.get(key, event_time), event_time)

        if self.watermark_mode == "partition":
            # Kafka віддає партиції пачками, тож одна може вирватись на години event time вперед.
            # Беремо мінімум, бо час потоку не може випереджати найповільнішу партицію. Інакше вчасні
            # події з відсталих партицій виглядали б запізнілими: на черзі таких було 56%.
            if not self.assigned <= self.partition_max.keys():
                # Поки якась партиція мовчить, про її час ми нічого не знаємо, тож чекаємо.
                # Плата за це: партиція без подій зупиняє watermark (Flink лікує це idle timeout).
                return
            low = min(self.partition_max[p] for p in self.assigned)
        else:
            # Буквальне правило max(modifiedDate) по всьому потоку. Коректне лише для рівного потоку.
            low = self.partition_max[key]

        candidate = low - self.lateness
        # Watermark ніколи не зменшується: після rebalance нова партиція може мати менший час,
        # але вже закрите вікно відкрити не можна.
        if self.watermark is None or candidate > self.watermark:
            self.watermark = candidate

    def process(self, event, partition):
        self.consumed += 1

        # Ключ саме такий: той самий платіж законно має кілька подій зі своїми статусами,
        # а дубль це повторна доставка тієї самої зміни статусу.
        key = (event["invoiceId"], event["status"], event["modifiedDate"])
        if key in self.seen:
            self.duplicates += 1
            return
        self.seen.add(key)

        event_time = parse_time(event["modifiedDate"])
        # Watermark рухають усі події, а не лише фінальні: created теж свідчить, що час дійшов сюди.
        self.advance_watermark(partition, event_time)

        # Початок вікна: округлення вниз до хвилини. Вікна tumbling, тому подія потрапляє рівно в одне.
        window_start = event_time - event_time % WINDOW_SECONDS

        # Те саме правило, що й при закритті: вікно [t, t+60) закрите, коли watermark >= t+60.
        if self.watermark is not None and window_start + WINDOW_SECONDS <= self.watermark:
            self.late_dropped += 1
            if event["status"] in FINAL_STATUSES:
                self.late_final += 1
            return

        if event["status"] in FINAL_STATUSES:
            # Лише фінальні статуси: created і processing є в кожного платежу і нічого не кажуть про результат.
            methods = self.windows.setdefault(window_start, {})
            counts = methods.setdefault(event["paymentMethod"], [0, 0])
            counts[0] += 1
            if event["status"] == "failure":
                counts[1] += 1

        if self.watermark is not None:
            self.close_ready_windows(self.watermark)

    def close_ready_windows(self, watermark):
        # sorted: за один стрибок watermark може закритись кілька вікон, друкуємо їх по порядку часу.
        ready = sorted(start for start in self.windows if start + WINDOW_SECONDS <= watermark)
        for start in ready:
            # pop звільняє пам'ять: закрите вікно більше не зміниться, запізнілі події його не чіпають.
            methods = self.windows.pop(start)
            self.windows_closed += 1
            for method in sorted(methods):
                total, failures = methods[method]
                share = failures / total
                self.log(
                    f"WINDOW {format_time(start)} method={method} n={total} "
                    f"failures={failures} share={share:.1%}"
                )
                if share > ALERT_SHARE and total >= ALERT_MIN_N:
                    self.alerts += 1
                    self.log(f"ALERT {format_time(start)} method={method} n={total} share={share:.1%}")


def parse_args():
    parser = argparse.ArgumentParser(description="Windowed failure rate over the payments topic")
    parser.add_argument("--bootstrap", default="localhost:19092")
    parser.add_argument("--topic", default="payments")
    parser.add_argument("--group", default="lab8")
    parser.add_argument("--lateness", type=int, default=120, help="скільки секунд event time чекати запізнілі події")
    parser.add_argument(
        "--watermark",
        choices=["partition", "global"],
        default="partition",
        help="partition: мінімум із максимумів партицій; global: один максимум на весь потік",
    )
    parser.add_argument("--run-name", default=None, help="ім'я файлу в outputs/")
    return parser.parse_args()


def main():
    args = parse_args()
    run_name = args.run_name or f"run-{int(time.time())}"
    OUTPUT_DIR.mkdir(exist_ok=True)
    # Режим "a": повторний запуск з тим самим іменем не зітре результат попереднього експерименту.
    log_file = (OUTPUT_DIR / f"{run_name}.log").open("a", encoding="utf-8")

    def log(line):
        print(line, flush=True)
        # flush одразу: якщо процес уб'ють, рядок уже буде у файлі.
        log_file.write(line + "\n")
        log_file.flush()

    pipeline = FailureRateWindows(args.lateness, args.watermark, log)
    consumer = Consumer(
        {
            "bootstrap.servers": args.bootstrap,
            # Порт опубліковано лише на 127.0.0.1, тож спроби через ::1 дали б помилки в лозі.
            "broker.address.family": "v4",
            # Споживачі з одним group.id ділять партиції між собою, а Kafka зберігає для групи offset.
            "group.id": args.group,
            # Нова група без збереженого offset читає лог із початку, а не лише нові повідомлення.
            "auto.offset.reset": "earliest",
            # За замовчуванням offset позначається як готовий уже в poll(), ще до обробки. Вимикаємо:
            # інакше збій між poll() і process() закомітив би подію, яку ми не порахували.
            "enable.auto.offset.store": False,
        }
    )

    def stats():
        partitions = sorted(item.partition for item in consumer.assignment())
        watermark = pipeline.watermark
        log(
            f"STATS consumed={pipeline.consumed} duplicates={pipeline.duplicates} "
            f"late_dropped={pipeline.late_dropped} late_final={pipeline.late_final} "
            f"windows_closed={pipeline.windows_closed} open_windows={len(pipeline.windows)} "
            f"alerts={pipeline.alerts} "
            f"watermark={format_time(watermark) if watermark is not None else '-'} "
            f"assigned_partitions={partitions}"
        )

    def on_assign(_consumer, partitions):
        # Спрацьовує при кожному rebalance: тут видно, як два споживачі ділять партиції.
        pipeline.set_assigned(item.partition for item in partitions)
        log(f"ASSIGNED {sorted(item.partition for item in partitions)}")

    def on_revoke(_consumer, partitions):
        log(f"REVOKED {sorted(item.partition for item in partitions)}")

    running = True

    def stop(_signum, _frame):
        # Лише прапорець, без винятку. Виняток міг би вилетіти між poll() і process(),
        # і вже отримане повідомлення пропало б: так ми втратили 1 подію з 10 000.
        nonlocal running
        running = False

    # Ctrl+C (SIGINT) і kill (SIGTERM) ідуть одним шляхом виходу. kill -9 перехопити неможливо.
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    consumer.subscribe([args.topic], on_assign=on_assign, on_revoke=on_revoke)
    log(f"START run={run_name} group={args.group} lateness={args.lateness}s watermark={args.watermark}")
    next_stats = time.monotonic() + STATS_EVERY_SECONDS

    try:
        while running:
            # Таймаут 1 с: цикл не висить вічно, тож лічильники друкуються і без нових подій.
            message = consumer.poll(1.0)
            if message is not None:
                if message.error():
                    log(f"ERROR {message.error()}")
                else:
                    pipeline.process(json.loads(message.value()), message.partition())
                    # Спочатку обробка, потім offset: це at-least-once. Після збою подія може
                    # прочитатись двічі, але не загубиться. Сам commit іде у фоні кожні 5 с.
                    consumer.store_offsets(message=message)
            # Це єдине місце з реальним часом: воно лише про те, як часто друкувати лічильники.
            if time.monotonic() >= next_stats:
                stats()
                next_stats = time.monotonic() + STATS_EVERY_SECONDS
    finally:
        stats()
        # Відкриті вікна не закриваємо примусово: їхній watermark не настав, тому числа неповні.
        # close() комітить offset і виходить із групи, тож інший споживач одразу отримує партиції.
        consumer.close()
        log_file.close()


if __name__ == "__main__":
    main()

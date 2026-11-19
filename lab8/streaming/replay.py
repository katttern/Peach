"""Lab 8: спільна логіка replay для producer.py (Redpanda) і cloud/producer_kinesis.py (Kinesis).

Тут лише підготовка подій, без жодного клієнта брокера.
"""

import json
import random


def load_events(path):
    with path.open(encoding="utf-8") as file:
        events = [json.loads(line) for line in file]
    # Рядки ISO 8601 в одному форматі сортуються так само, як час, тому парсити дати не треба.
    # sort стабільний: події з однаковим receivedAt лишаються у вихідному порядку.
    events.sort(key=lambda event: event["receivedAt"])
    return events


def inject_failures(events, fail_rate, seed):
    """Перетворює success на failure для частки платежів і повертає їхню кількість."""
    # Вибираємо ПЛАТЕЖІ, а не події: дубльований success мусить змінитись разом з оригіналом,
    # інакше той самий платіж був би водночас і успішним, і невдалим.
    # sorted робить вибір детермінованим: порядок обходу set між запусками Python різний.
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
    """Відкидає події до першої з часом receivedAt >= HH:MM."""
    for index, event in enumerate(events):
        # Символи 11–15 рядка 2026-10-01T17:00:05Z це HH:MM. Шукаємо перший збіг, а не фільтруємо,
        # щоб не загубити хвіст після півночі: там час 00:06, але події йдуть після 23:59.
        if event["receivedAt"][11:16] >= start_at:
            return events[index:]
    return []


def prepare_events(path, rate, fail_rate=0.0, seed=42, start_at=None, limit=None):
    """Повертає (події, повідомлень за секунду, кількість зіпсованих платежів)."""
    events = load_events(path)

    # Темп задано в платежах, а надсилаємо події, яких на платіж припадає ~3.
    # Тому рахуємо реальне співвідношення і переводимо платежі/с у повідомлення/с.
    events_per_payment = len(events) / len({event["invoiceId"] for event in events})
    messages_per_second = rate * events_per_payment

    # Помилки вводимо до limit і start_at, щоб частка не залежала від шматка дня.
    doomed = inject_failures(events, fail_rate, seed) if fail_rate else 0
    if start_at:
        events = skip_to(events, start_at)
    if limit:
        events = events[:limit]
    return events, messages_per_second, doomed

from datetime import date, timedelta


def streak(days, today):
    day_set = set(days)
    cursor = date.fromisoformat(today)
    if today not in day_set:
        cursor -= timedelta(days=1)

    count = 0
    while cursor.isoformat() in day_set:
        count += 1
        cursor -= timedelta(days=1)

    return count

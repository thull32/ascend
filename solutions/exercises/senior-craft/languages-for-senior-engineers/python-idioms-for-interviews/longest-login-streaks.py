from collections import defaultdict
from itertools import groupby


def longest_streaks(logins):
    days_by_user = defaultdict(set)
    for user, day in logins:
        days_by_user[user].add(day)

    result = {}
    for user, days in days_by_user.items():
        sorted_days = sorted(days)
        best = 0
        for _, group in groupby(enumerate(sorted_days), key=lambda p: p[1] - p[0]):
            best = max(best, len(list(group)))
        result[user] = best
    return result

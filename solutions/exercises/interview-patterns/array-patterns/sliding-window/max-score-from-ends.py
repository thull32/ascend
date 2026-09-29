def max_score_from_ends(cards, k):
    n = len(cards)
    total = sum(cards)
    if k == 0:
        return 0
    window = n - k
    if window == 0:
        return total
    current = sum(cards[:window])
    min_window = current
    for i in range(window, n):
        current += cards[i] - cards[i - window]
        min_window = min(min_window, current)
    return total - min_window

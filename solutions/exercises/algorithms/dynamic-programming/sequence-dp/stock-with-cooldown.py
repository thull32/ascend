def max_profit_cooldown(prices):
    hold, sold, free = float("-inf"), float("-inf"), 0
    for p in prices:
        new_hold = max(hold, free - p)
        new_sold = hold + p
        new_free = max(free, sold)
        hold, sold, free = new_hold, new_sold, new_free
    return max(free, sold) if prices else 0

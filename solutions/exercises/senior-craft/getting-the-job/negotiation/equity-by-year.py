def equity_by_year(grants, prices):
    result = [0] * len(prices)

    for start_year, value, conversion_price, schedule in grants:
        shares = value // conversion_price
        for i, pct in enumerate(schedule):
            idx = start_year + i - 1
            if 0 <= idx < len(prices):
                result[idx] += shares * pct / 100 * prices[idx]

    return result

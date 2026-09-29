def backfill_partitions(source, runs):
    table = {}   # logical_date -> {country: total}

    for run_on, logical_date in runs:
        totals = {}
        for order_date, country, amount, arrived_on in source:
            if order_date == logical_date and arrived_on <= run_on:
                totals[country] = totals.get(country, 0) + amount
        table[logical_date] = totals

    rows = []
    for date, totals in table.items():
        for country, total in totals.items():
            rows.append([date, country, total])
    rows.sort(key=lambda r: (r[0], r[1]))
    return rows

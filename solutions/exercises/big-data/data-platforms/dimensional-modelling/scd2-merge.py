def scd2_merge(dim, updates):
    rows = [list(r) for r in dim]

    def find_current(customer_id):
        for r in rows:
            if r[0] == customer_id and r[3] is None:
                return r
        return None

    for customer_id, country, effective_date in updates:
        current = find_current(customer_id)
        if current is None:
            rows.append([customer_id, country, effective_date, None])
        elif current[1] == country:
            continue
        else:
            current[3] = effective_date
            rows.append([customer_id, country, effective_date, None])

    return sorted(rows, key=lambda r: (r[0], r[2]))

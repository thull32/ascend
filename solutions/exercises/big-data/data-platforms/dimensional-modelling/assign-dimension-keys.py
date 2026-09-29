def assign_dimension_keys(dim, facts):
    by_customer = {}
    for customer_id, surrogate_key, eff_from, eff_to in dim:
        by_customer.setdefault(customer_id, []).append((eff_from, eff_to, surrogate_key))

    result = []
    for customer_id, event_date in facts:
        found = None
        for eff_from, eff_to, key in by_customer.get(customer_id, []):
            if eff_from <= event_date and (eff_to is None or event_date < eff_to):
                found = key
                break
        result.append(found)
    return result

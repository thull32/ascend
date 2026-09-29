def check_ledger(entries):
    balances = {}
    rejected = []
    accepted_ids = set()

    for entry_id, postings in entries:
        if entry_id in accepted_ids:
            rejected.append([entry_id, "duplicate"])
            continue
        if len(postings) < 2:
            rejected.append([entry_id, "too_few_postings"])
            continue
        if any(amount == 0 for _, amount, _ in postings):
            rejected.append([entry_id, "zero_posting"])
            continue

        sums = {}
        for _, amount, currency in postings:
            sums[currency] = sums.get(currency, 0) + amount
        if any(s != 0 for s in sums.values()):
            rejected.append([entry_id, "unbalanced"])
            continue

        accepted_ids.add(entry_id)
        for account, amount, currency in postings:
            acc_bal = balances.setdefault(account, {})
            acc_bal[currency] = acc_bal.get(currency, 0) + amount

    return {"balances": balances, "rejected": rejected}

def top_k_suggestions(pairs, prefix, k):
    totals = {}
    for query, count in pairs:
        totals[query] = totals.get(query, 0) + count

    matches = [q for q in totals if q.startswith(prefix)]
    matches.sort(key=lambda q: (-totals[q], q))

    return matches[:k]

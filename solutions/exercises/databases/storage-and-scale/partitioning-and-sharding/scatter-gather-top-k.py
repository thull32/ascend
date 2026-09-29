def global_top_k(shard_results, k):
    all_rows = []
    for shard in shard_results:
        all_rows.extend(shard)

    fetched = len(all_rows)
    all_rows.sort(key=lambda r: (r[0], r[1]), reverse=True)
    top = all_rows[:k]
    ids = [r[1] for r in top]

    return {"ids": ids, "fetched": fetched, "discarded": fetched - len(ids)}

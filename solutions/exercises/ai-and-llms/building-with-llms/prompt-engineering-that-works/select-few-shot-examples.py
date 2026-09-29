def select_examples(pool, query, k):
    scored = []
    for item in pool:
        score = sum(a * b for a, b in zip(item["vec"], query))
        scored.append((score, item["id"], item))

    ranked = sorted(scored, key=lambda t: (-t[0], t[1]))

    chosen_ids = []
    positions = {}
    seen_labels = set()
    for pos, (score, item_id, item) in enumerate(ranked):
        if len(chosen_ids) >= k:
            break
        label = item["label"]
        if label not in seen_labels:
            seen_labels.add(label)
            chosen_ids.append(item_id)
            positions[item_id] = pos

    if len(chosen_ids) < k:
        chosen_set = set(chosen_ids)
        for pos, (score, item_id, item) in enumerate(ranked):
            if len(chosen_ids) >= k:
                break
            if item_id not in chosen_set:
                chosen_ids.append(item_id)
                positions[item_id] = pos
                chosen_set.add(item_id)

    chosen_ids.sort(key=lambda item_id: -positions[item_id])
    return chosen_ids

def point_in_time_join(labels, features, ttl):
    by_entity = {}
    for entity, ts, value in features:
        by_entity.setdefault(entity, []).append((ts, value))
    for entity in by_entity:
        by_entity[entity].sort(key=lambda p: p[0])

    result = []
    for entity, label_ts in labels:
        best = None
        for ts, value in by_entity.get(entity, []):
            if ts <= label_ts:
                if best is None or ts > best[0]:
                    best = (ts, value)
            else:
                break
        if best is not None and label_ts - best[0] <= ttl:
            result.append(best[1])
        else:
            result.append(None)
    return result

def beam_search(points, graph, entry, query, ef, k):
    def key(i):
        p = points[i]
        dist = sum((p[j] - query[j]) ** 2 for j in range(len(query)))
        return (dist, i)

    visited = {entry}
    candidates = [entry]
    best = [entry]

    while candidates:
        c = min(candidates, key=key)
        candidates.remove(c)

        worst = max(best, key=key)
        if key(c) > key(worst):
            break

        for e in graph[c]:
            if e in visited:
                continue
            visited.add(e)
            worst = max(best, key=key)
            if len(best) < ef or key(e) < key(worst):
                candidates.append(e)
                best.append(e)
                if len(best) > ef:
                    drop = max(best, key=key)
                    best.remove(drop)

    best.sort(key=key)
    return best[:k]

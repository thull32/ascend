import heapq


def backfill_plan(deps, changed):
    downstream = {t: [] for t in deps}
    for t, ups in deps.items():
        for u in ups:
            downstream.setdefault(u, []).append(t)

    rerun = set()
    stack = list(changed)
    while stack:
        t = stack.pop()
        if t in rerun:
            continue
        rerun.add(t)
        for d in downstream.get(t, []):
            if d not in rerun:
                stack.append(d)

    indegree = {t: 0 for t in rerun}
    for t in rerun:
        for u in deps.get(t, []):
            if u in rerun:
                indegree[t] += 1

    ready = sorted(t for t in rerun if indegree[t] == 0)
    heapq.heapify(ready)

    result = []
    while ready:
        t = heapq.heappop(ready)
        result.append(t)
        for d in downstream.get(t, []):
            if d in rerun:
                indegree[d] -= 1
                if indegree[d] == 0:
                    heapq.heappush(ready, d)
    return result

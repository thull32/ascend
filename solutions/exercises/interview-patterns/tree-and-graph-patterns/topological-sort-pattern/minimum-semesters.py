from collections import deque


def min_semesters(n, prereqs):
    adj = [[] for _ in range(n)]
    indeg = [0] * n
    for a, b in prereqs:
        adj[b].append(a)
        indeg[a] += 1

    queue = deque(i for i in range(n) if indeg[i] == 0)
    taken = 0
    semesters = 0
    while queue:
        semesters += 1
        for _ in range(len(queue)):
            course = queue.popleft()
            taken += 1
            for nxt in adj[course]:
                indeg[nxt] -= 1
                if indeg[nxt] == 0:
                    queue.append(nxt)

    return semesters if taken == n else -1

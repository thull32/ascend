def garbage(objects, edges, roots):
    visited = set()
    stack = list(roots)
    while stack:
        x = stack.pop()
        if x in visited:
            continue
        visited.add(x)
        for nxt in edges.get(str(x), []):
            stack.append(nxt)
    return sorted(x for x in objects if x not in visited)

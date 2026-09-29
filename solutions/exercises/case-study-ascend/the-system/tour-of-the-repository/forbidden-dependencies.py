def forbidden_reachable(graph, start, forbidden):
    visited = set()
    stack = list(graph.get(start, []))

    while stack:
        node = stack.pop()
        if node in visited:
            continue
        visited.add(node)
        stack.extend(graph.get(node, []))

    return sorted(visited & set(forbidden))

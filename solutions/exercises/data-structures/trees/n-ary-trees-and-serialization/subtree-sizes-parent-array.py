def subtree_sizes(parent):
    n = len(parent)
    sizes = [1] * n
    children = [[] for _ in range(n)]
    root = -1
    for i, p in enumerate(parent):
        if p == -1:
            root = i
        else:
            children[p].append(i)

    order = []
    stack = [root]
    while stack:
        node = stack.pop()
        order.append(node)
        for c in children[node]:
            stack.append(c)

    for node in reversed(order):
        for c in children[node]:
            sizes[node] += sizes[c]

    return sizes

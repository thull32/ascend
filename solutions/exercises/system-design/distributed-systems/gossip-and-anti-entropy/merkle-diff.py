def _build_tree(leaves):
    levels = [list(leaves)]
    while len(levels[-1]) > 1:
        prev = levels[-1]
        nxt = []
        for i in range(0, len(prev), 2):
            left, right = prev[i], prev[i + 1]
            nxt.append((left * 1000003 + right) % 2147483647)
        levels.append(nxt)
    return levels


def merkle_diff(a, b):
    tree_a = _build_tree(a)
    tree_b = _build_tree(b)
    depth = len(tree_a) - 1

    level = depth
    frontier = [0]
    comparisons = 0
    diff = []

    while frontier:
        comparisons += len(frontier)
        if level == 0:
            diff = [idx for idx in frontier if tree_a[0][idx] != tree_b[0][idx]]
            break
        next_frontier = []
        for idx in frontier:
            if tree_a[level][idx] != tree_b[level][idx]:
                next_frontier.append(2 * idx)
                next_frontier.append(2 * idx + 1)
        frontier = next_frontier
        level -= 1

    diff.sort()
    return {"diff": diff, "comparisons": comparisons}

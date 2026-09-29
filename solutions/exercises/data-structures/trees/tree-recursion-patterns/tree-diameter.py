class BTNode:
    def __init__(self, val):
        self.val, self.left, self.right = val, None, None


def build_tree(values):
    if not values or values[0] is None:
        return None
    root = BTNode(values[0])
    queue, head, i = [root], 0, 1
    while head < len(queue) and i < len(values):
        node = queue[head]; head += 1
        if values[i] is not None:
            node.left = BTNode(values[i]); queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = BTNode(values[i]); queue.append(node.right)
        i += 1
    return root


def diameter(values):
    root = build_tree(values)
    best = [0]

    def dfs(node):
        if node is None:
            return -1
        hl = dfs(node.left)
        hr = dfs(node.right)
        best[0] = max(best[0], hl + hr + 2)
        return 1 + max(hl, hr)

    dfs(root)
    return best[0]

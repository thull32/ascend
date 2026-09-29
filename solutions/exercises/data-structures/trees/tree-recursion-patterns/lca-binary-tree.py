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


def _lca(node, a, b):
    if node is None or node.val == a or node.val == b:
        return node
    left = _lca(node.left, a, b)
    right = _lca(node.right, a, b)
    if left is not None and right is not None:
        return node
    return left if left is not None else right


def lca(values, a, b):
    root = build_tree(values)
    result = _lca(root, a, b)
    return result.val if result is not None else None

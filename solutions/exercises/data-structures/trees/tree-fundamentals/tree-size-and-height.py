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


def size(node):
    if node is None:
        return 0
    return 1 + size(node.left) + size(node.right)


def height(node):
    if node is None:
        return -1
    return 1 + max(height(node.left), height(node.right))


def tree_stats(values):
    root = build_tree(values)
    return [size(root), height(root)]

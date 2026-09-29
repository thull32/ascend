from collections import deque


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


def level_groups(values):
    root = build_tree(values)
    out = []
    if root is None:
        return out
    queue = deque([root])
    while queue:
        width = len(queue)
        level = []
        for _ in range(width):
            node = queue.popleft()
            level.append(node.val)
            if node.left is not None:
                queue.append(node.left)
            if node.right is not None:
                queue.append(node.right)
        out.append(level)
    return out

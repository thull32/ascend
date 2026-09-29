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


_UNBALANCED = -2


def _height_or_unbalanced(node):
    if node is None:
        return -1
    hl = _height_or_unbalanced(node.left)
    if hl == _UNBALANCED:
        return _UNBALANCED
    hr = _height_or_unbalanced(node.right)
    if hr == _UNBALANCED:
        return _UNBALANCED
    if abs(hl - hr) > 1:
        return _UNBALANCED
    return 1 + max(hl, hr)


def is_height_balanced(values):
    root = build_tree(values)
    return _height_or_unbalanced(root) != _UNBALANCED

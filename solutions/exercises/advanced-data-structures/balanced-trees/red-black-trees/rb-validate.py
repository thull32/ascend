from collections import deque


class _N:
    __slots__ = ("key", "color", "left", "right")

    def __init__(self, key, color):
        self.key = key
        self.color = color
        self.left = None
        self.right = None


def _build(nodes):
    if not nodes or nodes[0] is None:
        return None
    root = _N(nodes[0][0], nodes[0][1])
    q = deque([root])
    i = 1
    n = len(nodes)
    while q and i < n:
        cur = q.popleft()
        if i < n:
            entry = nodes[i]
            i += 1
            if entry is not None:
                cur.left = _N(entry[0], entry[1])
                q.append(cur.left)
        if i < n:
            entry = nodes[i]
            i += 1
            if entry is not None:
                cur.right = _N(entry[0], entry[1])
                q.append(cur.right)
    return root


def rb_valid(nodes):
    root = _build(nodes)
    if root is None:
        return True
    if root.color != "B":
        return False

    def check(node, lo, hi):
        if node is None:
            return 1
        if lo is not None and node.key <= lo:
            return -1
        if hi is not None and node.key >= hi:
            return -1
        if node.color == "R":
            if (node.left and node.left.color == "R") or (
                node.right and node.right.color == "R"
            ):
                return -1
        left_bh = check(node.left, lo, node.key)
        if left_bh == -1:
            return -1
        right_bh = check(node.right, node.key, hi)
        if right_bh == -1:
            return -1
        if left_bh != right_bh:
            return -1
        return left_bh + (1 if node.color == "B" else 0)

    return check(root, None, None) != -1

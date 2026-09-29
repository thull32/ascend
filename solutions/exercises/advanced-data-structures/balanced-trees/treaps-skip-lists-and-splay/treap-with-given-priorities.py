from collections import deque


class Node:
    def __init__(self, key, prio):
        self.key, self.prio = key, prio
        self.left = self.right = None


def rotate_right(node):
    left = node.left
    node.left = left.right
    left.right = node
    return left


def rotate_left(node):
    right = node.right
    node.right = right.left
    right.left = node
    return right


def insert(node, key, prio):
    if node is None:
        return Node(key, prio)
    if key < node.key:
        node.left = insert(node.left, key, prio)
        if node.left.prio > node.prio:
            node = rotate_right(node)
    else:
        node.right = insert(node.right, key, prio)
        if node.right.prio > node.prio:
            node = rotate_left(node)
    return node


def treap_level_order(items):
    root = None
    for key, prio in items:
        root = insert(root, key, prio)
    order = []
    if root:
        q = deque([root])
        while q:
            n = q.popleft()
            order.append(n.key)
            if n.left:
                q.append(n.left)
            if n.right:
                q.append(n.right)
    return order

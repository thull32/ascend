from collections import deque


class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None
        self.height = 1


def height(n):
    return n.height if n else 0


def update_height(n):
    n.height = 1 + max(height(n.left), height(n.right))


def balance_factor(n):
    return height(n.left) - height(n.right)


def rotate_right(y):
    x = y.left
    y.left = x.right
    x.right = y
    update_height(y)
    update_height(x)
    return x


def rotate_left(x):
    y = x.right
    x.right = y.left
    y.left = x
    update_height(x)
    update_height(y)
    return y


def rebalance(node):
    update_height(node)
    bf = balance_factor(node)
    if bf > 1:
        if balance_factor(node.left) < 0:
            node.left = rotate_left(node.left)
        return rotate_right(node)
    if bf < -1:
        if balance_factor(node.right) > 0:
            node.right = rotate_right(node.right)
        return rotate_left(node)
    return node


def insert(node, key):
    if node is None:
        return Node(key)
    if key < node.key:
        node.left = insert(node.left, key)
    else:
        node.right = insert(node.right, key)
    return rebalance(node)


def avl_level_order(values):
    root = None
    for v in values:
        root = insert(root, v)
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

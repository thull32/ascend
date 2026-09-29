class AVLNode:
    def __init__(self, val):
        self.val, self.left, self.right, self.height = val, None, None, 0


def h(node):
    return -1 if node is None else node.height


def update(node):
    node.height = 1 + max(h(node.left), h(node.right))


def rotate_right(y):
    x = y.left
    y.left = x.right
    x.right = y
    update(y)
    update(x)
    return x


def rotate_left(x):
    y = x.right
    x.right = y.left
    y.left = x
    update(x)
    update(y)
    return y


def insert(node, key):
    if node is None:
        return AVLNode(key)
    if key < node.val:
        node.left = insert(node.left, key)
    elif key > node.val:
        node.right = insert(node.right, key)
    else:
        return node
    update(node)
    bf = h(node.left) - h(node.right)
    if bf > 1:
        if key < node.left.val:
            return rotate_right(node)
        node.left = rotate_left(node.left)
        return rotate_right(node)
    if bf < -1:
        if key > node.right.val:
            return rotate_left(node)
        node.right = rotate_right(node.right)
        return rotate_left(node)
    return node


def _preorder(node, out):
    if node is None:
        return
    out.append(node.val)
    _preorder(node.left, out)
    _preorder(node.right, out)


def avl_insert_preorder(values):
    root = None
    for v in values:
        root = insert(root, v)
    out = []
    _preorder(root, out)
    return out

class BTNode:
    def __init__(self, val):
        self.val, self.left, self.right = val, None, None


def insert(node, key):
    if node is None:
        return BTNode(key)
    if key < node.val:
        node.left = insert(node.left, key)
    elif key > node.val:
        node.right = insert(node.right, key)
    return node


def delete(node, key):
    if node is None:
        return None
    if key < node.val:
        node.left = delete(node.left, key)
    elif key > node.val:
        node.right = delete(node.right, key)
    else:
        if node.left is None:
            return node.right
        if node.right is None:
            return node.left
        succ = node.right
        while succ.left is not None:
            succ = succ.left
        node.val = succ.val
        node.right = delete(node.right, succ.val)
    return node


def _preorder(node, out):
    if node is None:
        return
    out.append(node.val)
    _preorder(node.left, out)
    _preorder(node.right, out)


def bst_insert_delete(values, key):
    root = None
    for v in values:
        root = insert(root, v)
    root = delete(root, key)
    out = []
    _preorder(root, out)
    return out

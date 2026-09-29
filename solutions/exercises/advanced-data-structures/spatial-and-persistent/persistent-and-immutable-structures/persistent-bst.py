class Node:
    __slots__ = ("key", "left", "right")

    def __init__(self, key, left=None, right=None):
        self.key, self.left, self.right = key, left, right


class PersistentBST:
    def __init__(self):
        self.roots = [None]  # roots[v] is the root of version v

    def insert(self, version, key):
        count = [0]

        def ins(node):
            if node is None:
                count[0] += 1
                return Node(key)
            if key == node.key:
                return node
            if key < node.key:
                new_left = ins(node.left)
                if new_left is node.left:
                    return node
                count[0] += 1
                return Node(node.key, new_left, node.right)
            new_right = ins(node.right)
            if new_right is node.right:
                return node
            count[0] += 1
            return Node(node.key, node.left, new_right)

        new_root = ins(self.roots[version])
        self.roots.append(new_root)
        return count[0]

    def contains(self, version, key):
        node = self.roots[version]
        while node is not None:
            if key == node.key:
                return True
            node = node.left if key < node.key else node.right
        return False

    def inorder(self, version):
        result = []

        def visit(node):
            if node is not None:
                visit(node.left)
                result.append(node.key)
                visit(node.right)

        visit(self.roots[version])
        return result

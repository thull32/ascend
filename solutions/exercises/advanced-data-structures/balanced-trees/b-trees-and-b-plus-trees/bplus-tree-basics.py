from bisect import bisect_right


class Node:
    def __init__(self, leaf):
        self.leaf = leaf
        self.keys = []
        self.children = []  # internal nodes only
        self.next = None  # leaves only


class BPlusTree:
    def __init__(self):
        self.max_keys = 3
        self.root = Node(leaf=True)

    def set_order(self, max_keys):
        self.max_keys = max_keys

    def _insert(self, node, key):
        if node.leaf:
            i = bisect_right(node.keys, key)
            node.keys.insert(i, key)
            if len(node.keys) <= self.max_keys:
                return None
            m = len(node.keys)
            left_size = (m + 1) // 2
            new_leaf = Node(leaf=True)
            new_leaf.keys = node.keys[left_size:]
            node.keys = node.keys[:left_size]
            new_leaf.next = node.next
            node.next = new_leaf
            return (new_leaf.keys[0], new_leaf)

        i = bisect_right(node.keys, key)
        result = self._insert(node.children[i], key)
        if result is None:
            return None
        sep, new_child = result
        node.keys.insert(i, sep)
        node.children.insert(i + 1, new_child)
        if len(node.keys) <= self.max_keys:
            return None
        m = len(node.keys)
        mid = m // 2
        push_up = node.keys[mid]
        new_node = Node(leaf=False)
        new_node.keys = node.keys[mid + 1:]
        new_node.children = node.children[mid + 1:]
        node.keys = node.keys[:mid]
        node.children = node.children[:mid + 1]
        return (push_up, new_node)

    def insert(self, key):
        result = self._insert(self.root, key)
        if result is not None:
            sep, new_child = result
            new_root = Node(leaf=False)
            new_root.keys = [sep]
            new_root.children = [self.root, new_child]
            self.root = new_root

    def range(self, lo, hi):
        node = self.root
        while not node.leaf:
            i = bisect_right(node.keys, lo)
            node = node.children[i]
        out = []
        while node is not None:
            for k in node.keys:
                if k > hi:
                    return out
                if k >= lo:
                    out.append(k)
            node = node.next
        return out

    def height(self):
        h = 1
        node = self.root
        while not node.leaf:
            h += 1
            node = node.children[0]
        return h

    def leaves(self):
        node = self.root
        while not node.leaf:
            node = node.children[0]
        out = []
        while node is not None:
            out.append(list(node.keys))
            node = node.next
        return out

class _Node:
    __slots__ = ("children", "count", "end")

    def __init__(self):
        self.children = {}
        self.count = 0
        self.end = False


class Trie:
    def __init__(self):
        self.root = _Node()

    def insert(self, word):
        node = self.root
        node.count += 1
        for ch in word:
            if ch not in node.children:
                node.children[ch] = _Node()
            node = node.children[ch]
            node.count += 1
        node.end = True

    def count_prefix(self, prefix):
        node = self.root
        for ch in prefix:
            if ch not in node.children:
                return 0
            node = node.children[ch]
        return node.count

    def search(self, word):
        node = self.root
        for ch in word:
            if ch not in node.children:
                return False
            node = node.children[ch]
        return node.end

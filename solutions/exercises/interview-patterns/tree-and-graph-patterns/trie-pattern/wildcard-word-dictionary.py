class _Node:
    __slots__ = ("children", "end")

    def __init__(self):
        self.children = {}
        self.end = False


class WordDictionary:
    def __init__(self):
        self.root = _Node()

    def add_word(self, word):
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = _Node()
            node = node.children[ch]
        node.end = True

    def search(self, pattern):
        def dfs(node, i):
            if i == len(pattern):
                return node.end
            ch = pattern[i]
            if ch == ".":
                for child in node.children.values():
                    if dfs(child, i + 1):
                        return True
                return False
            child = node.children.get(ch)
            if child is None:
                return False
            return dfs(child, i + 1)

        return dfs(self.root, 0)

# Autocomplete: build a trie from a word list, then DFS the prefix's
# subtree in sorted character order so results come out lexicographic
# with no separate sort call.


class _Node:
    def __init__(self):
        self.children = {}
        self.end = False


def autocomplete(words, prefix):
    root = _Node()
    for word in words:
        node = root
        for ch in word:
            node = node.children.setdefault(ch, _Node())
        node.end = True

    node = root
    for ch in prefix:
        node = node.children.get(ch)
        if node is None:
            return []

    out = []

    def dfs(node, accumulated):
        if node.end:
            out.append(accumulated)
        for ch in sorted(node.children):
            dfs(node.children[ch], accumulated + ch)

    dfs(node, prefix)
    return out

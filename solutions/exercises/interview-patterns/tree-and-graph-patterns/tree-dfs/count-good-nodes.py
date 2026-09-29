def count_good_nodes(root):
    if root is None:
        return 0

    def dfs(node, path_max):
        if node is None:
            return 0
        good = 1 if node.val >= path_max else 0
        new_max = max(path_max, node.val)
        return good + dfs(node.left, new_max) + dfs(node.right, new_max)

    return dfs(root, root.val)

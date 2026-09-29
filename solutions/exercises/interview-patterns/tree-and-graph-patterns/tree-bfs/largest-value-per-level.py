from collections import deque


def largest_per_level(root):
    if root is None:
        return []
    result = []
    queue = deque([root])
    while queue:
        size = len(queue)
        level_max = None
        for _ in range(size):
            node = queue.popleft()
            if level_max is None or node.val > level_max:
                level_max = node.val
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        result.append(level_max)
    return result

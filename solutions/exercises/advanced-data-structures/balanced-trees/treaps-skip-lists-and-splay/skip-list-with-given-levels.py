class SLNode:
    def __init__(self, key, level):
        self.key = key
        self.forward = [None] * level


class SkipList:
    def __init__(self):
        self.head = SLNode(None, 1)

    def insert(self, key, level):
        max_level = len(self.head.forward)
        if level > max_level:
            self.head.forward.extend([None] * (level - max_level))
            max_level = level

        update = [None] * max_level
        node = self.head
        for i in range(max_level - 1, -1, -1):
            while node.forward[i] is not None and node.forward[i].key < key:
                node = node.forward[i]
            update[i] = node

        new_node = SLNode(key, level)
        for i in range(level):
            new_node.forward[i] = update[i].forward[i]
            update[i].forward[i] = new_node

    def contains(self, key):
        node = self.head
        top = len(self.head.forward) - 1
        for i in range(top, -1, -1):
            while node.forward[i] is not None and node.forward[i].key < key:
                node = node.forward[i]
        nxt = node.forward[0]
        return nxt is not None and nxt.key == key

    def delete(self, key):
        top = len(self.head.forward) - 1
        update = [None] * (top + 1)
        node = self.head
        for i in range(top, -1, -1):
            while node.forward[i] is not None and node.forward[i].key < key:
                node = node.forward[i]
            update[i] = node

        target = node.forward[0]
        if target is None or target.key != key:
            return False

        for i in range(len(target.forward)):
            if update[i].forward[i] is target:
                update[i].forward[i] = target.forward[i]
        return True

    def levels(self):
        result = []
        for i in range(len(self.head.forward)):
            keys = []
            node = self.head.forward[i]
            while node is not None:
                keys.append(node.key)
                node = node.forward[i]
            if not keys:
                break
            result.append(keys)
        return result

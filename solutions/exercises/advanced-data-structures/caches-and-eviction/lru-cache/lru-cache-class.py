class Node:
    def __init__(self, key=None, value=None):
        self.key, self.value = key, value
        self.prev = self.next = None


class LRUCache:
    def __init__(self):
        self.capacity = 0
        self.map = {}
        self.head, self.tail = Node(), Node()
        self.head.next, self.tail.prev = self.tail, self.head

    def set_capacity(self, capacity):
        self.capacity = capacity

    def _unlink(self, node):
        node.prev.next = node.next
        node.next.prev = node.prev

    def _push_front(self, node):
        node.next = self.head.next
        node.prev = self.head
        self.head.next.prev = node
        self.head.next = node

    def get(self, key):
        if key not in self.map:
            return -1
        node = self.map[key]
        self._unlink(node)
        self._push_front(node)
        return node.value

    def put(self, key, value):
        if key in self.map:
            node = self.map[key]
            node.value = value
            self._unlink(node)
            self._push_front(node)
            return

        if len(self.map) >= self.capacity:
            if self.capacity <= 0:
                return
            lru = self.tail.prev
            self._unlink(lru)
            del self.map[lru.key]

        node = Node(key, value)
        self.map[key] = node
        self._push_front(node)

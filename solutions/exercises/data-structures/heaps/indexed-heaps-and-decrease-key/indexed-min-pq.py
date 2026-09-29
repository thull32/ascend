# Indexed min-priority queue: a plain binary heap of keys plus a position
# map updated on every swap, so decrease-key can sift up from the key's
# current index in O(log n) instead of scanning the array.


class IndexedMinPQ:
    def __init__(self):
        self.keys = []    # heap array of keys
        self.pri = {}     # key -> priority
        self.pos = {}     # key -> index in self.keys

    def _swap(self, i, j):
        self.keys[i], self.keys[j] = self.keys[j], self.keys[i]
        self.pos[self.keys[i]] = i
        self.pos[self.keys[j]] = j

    def _sift_up(self, i):
        while i > 0:
            parent = (i - 1) // 2
            if self.pri[self.keys[parent]] <= self.pri[self.keys[i]]:
                break
            self._swap(parent, i)
            i = parent

    def _sift_down(self, i):
        n = len(self.keys)
        while True:
            left, right = 2 * i + 1, 2 * i + 2
            smallest = i
            if left < n and self.pri[self.keys[left]] < self.pri[self.keys[smallest]]:
                smallest = left
            if right < n and self.pri[self.keys[right]] < self.pri[self.keys[smallest]]:
                smallest = right
            if smallest == i:
                break
            self._swap(i, smallest)
            i = smallest

    def insert(self, key, priority):
        self.keys.append(key)
        self.pri[key] = priority
        self.pos[key] = len(self.keys) - 1
        self._sift_up(len(self.keys) - 1)

    def decrease(self, key, priority):
        self.pri[key] = priority
        self._sift_up(self.pos[key])

    def pop(self):
        if not self.keys:
            return None
        root = self.keys[0]
        last = self.keys.pop()
        del self.pos[root]
        del self.pri[root]
        if self.keys:
            self.keys[0] = last
            self.pos[last] = 0
            self._sift_down(0)
        return root

    def contains(self, key):
        return key in self.pos

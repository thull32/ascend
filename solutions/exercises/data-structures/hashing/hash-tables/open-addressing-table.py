class HashTable:
    TOMBSTONE = object()

    def __init__(self):
        self.cap = 8
        self.slots = [None] * self.cap   # each slot: None | TOMBSTONE | (key, value)
        self.used = 0                     # live entries + tombstones

    def _index(self, key):
        return hash(key) % self.cap

    def _grow(self):
        live = [s for s in self.slots if s is not None and s is not HashTable.TOMBSTONE]
        self.cap *= 2
        self.slots = [None] * self.cap
        self.used = 0
        for key, value in live:
            idx = self._index(key)
            while self.slots[idx] is not None:
                idx = (idx + 1) % self.cap
            self.slots[idx] = (key, value)
            self.used += 1

    def set(self, key, value):
        idx = self._index(key)
        first_tombstone = None
        for _ in range(self.cap):
            slot = self.slots[idx]
            if slot is None:
                if first_tombstone is not None:
                    self.slots[first_tombstone] = (key, value)
                else:
                    self.slots[idx] = (key, value)
                    self.used += 1
                if self.used > self.cap * 5 // 8:
                    self._grow()
                return
            if slot is HashTable.TOMBSTONE:
                if first_tombstone is None:
                    first_tombstone = idx
            elif slot[0] == key:
                self.slots[idx] = (key, value)
                return
            idx = (idx + 1) % self.cap
        if first_tombstone is not None:
            self.slots[first_tombstone] = (key, value)

    def get(self, key):
        idx = self._index(key)
        for _ in range(self.cap):
            slot = self.slots[idx]
            if slot is None:
                return None
            if slot is not HashTable.TOMBSTONE and slot[0] == key:
                return slot[1]
            idx = (idx + 1) % self.cap
        return None

    def delete(self, key):
        idx = self._index(key)
        for _ in range(self.cap):
            slot = self.slots[idx]
            if slot is None:
                return False
            if slot is not HashTable.TOMBSTONE and slot[0] == key:
                self.slots[idx] = HashTable.TOMBSTONE
                return True
            idx = (idx + 1) % self.cap
        return False

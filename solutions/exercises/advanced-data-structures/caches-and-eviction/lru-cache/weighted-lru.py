from collections import OrderedDict


class WeightedLRU:
    def __init__(self):
        self.capacity = 0
        self.weight = 0
        self.entries = OrderedDict()  # key -> (value, weight), LRU first

    def set_capacity(self, capacity):
        self.capacity = capacity

    def _remove(self, key):
        if key in self.entries:
            _, w = self.entries.pop(key)
            self.weight -= w

    def put(self, key, value, weight):
        self._remove(key)

        if weight > self.capacity:
            return False

        while self.weight + weight > self.capacity:
            oldest_key, (_, oldest_weight) = next(iter(self.entries.items()))
            self.entries.pop(oldest_key)
            self.weight -= oldest_weight

        self.entries[key] = (value, weight)
        self.weight += weight
        return True

    def get(self, key):
        if key not in self.entries:
            return -1
        value, weight = self.entries.pop(key)
        self.entries[key] = (value, weight)
        return value

    def total_weight(self):
        return self.weight

    def keys(self):
        return list(self.entries.keys())

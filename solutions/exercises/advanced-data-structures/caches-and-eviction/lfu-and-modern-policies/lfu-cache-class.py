from collections import OrderedDict


class LFUCache:
    def __init__(self):
        self.capacity = 0
        self.values = {}  # key -> value
        self.freq = {}  # key -> frequency
        self.buckets = {}  # frequency -> OrderedDict of keys (LRU first)
        self.min_freq = 0

    def set_capacity(self, capacity):
        self.capacity = capacity

    def _promote(self, key):
        f = self.freq[key]
        del self.buckets[f][key]
        if not self.buckets[f]:
            del self.buckets[f]
            if self.min_freq == f:
                self.min_freq = f + 1
        new_f = f + 1
        self.freq[key] = new_f
        self.buckets.setdefault(new_f, OrderedDict())[key] = None

    def get(self, key):
        if key not in self.values:
            return -1
        self._promote(key)
        return self.values[key]

    def put(self, key, value):
        if self.capacity <= 0:
            return

        if key in self.values:
            self.values[key] = value
            self._promote(key)
            return

        if len(self.values) >= self.capacity:
            bucket = self.buckets[self.min_freq]
            evict_key = next(iter(bucket))
            del bucket[evict_key]
            if not bucket:
                del self.buckets[self.min_freq]
            del self.values[evict_key]
            del self.freq[evict_key]

        self.values[key] = value
        self.freq[key] = 1
        self.buckets.setdefault(1, OrderedDict())[key] = None
        self.min_freq = 1

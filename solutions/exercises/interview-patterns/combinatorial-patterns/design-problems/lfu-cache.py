from collections import OrderedDict, defaultdict


class LFUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.min_count = 0
        self.key_val = {}
        self.key_count = {}
        self.count_keys = defaultdict(OrderedDict)

    def _touch(self, key):
        count = self.key_count[key]
        del self.count_keys[count][key]
        if not self.count_keys[count] and self.min_count == count:
            self.min_count += 1
        new_count = count + 1
        self.key_count[key] = new_count
        self.count_keys[new_count][key] = None

    def get(self, key):
        if key not in self.key_val:
            return -1
        value = self.key_val[key]
        self._touch(key)
        return value

    def put(self, key, value):
        if self.capacity <= 0:
            return
        if key in self.key_val:
            self.key_val[key] = value
            self._touch(key)
            return

        if len(self.key_val) >= self.capacity:
            oldest_key = next(iter(self.count_keys[self.min_count]))
            del self.count_keys[self.min_count][oldest_key]
            del self.key_val[oldest_key]
            del self.key_count[oldest_key]

        self.key_val[key] = value
        self.key_count[key] = 1
        self.count_keys[1][key] = None
        self.min_count = 1

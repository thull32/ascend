def hash32(s):
    h = 0x811c9dc5
    for ch in s:
        h = ((h ^ ord(ch)) * 0x01000193) & 0xffffffff
    h ^= h >> 16; h = (h * 0x85ebca6b) & 0xffffffff
    h ^= h >> 13; h = (h * 0xc2b2ae35) & 0xffffffff
    return h ^ (h >> 16)


class BloomFilter:
    M = 64
    K = 3

    def __init__(self):
        self.bits = [False] * self.M

    def _indices(self, item):
        return [hash32(f"{i}:{item}") % self.M for i in range(self.K)]

    def add(self, item):
        for idx in self._indices(item):
            self.bits[idx] = True

    def might_contain(self, item):
        return all(self.bits[idx] for idx in self._indices(item))

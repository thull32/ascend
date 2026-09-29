def fnv1a(s):
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def djb2(s):
    h = 5381
    for ch in s:
        h = (h * 33 + ord(ch)) & 0xFFFFFFFF
    return h


class BloomFilter:
    M = 64
    K = 3

    def __init__(self):
        self.bits = [0] * self.M

    def _positions(self, key):
        h1 = fnv1a(key)
        h2 = djb2(key)
        return [(h1 + i * h2) % self.M for i in range(self.K)]

    def add(self, key):
        for p in self._positions(key):
            self.bits[p] = 1

    def might_contain(self, key):
        return all(self.bits[p] == 1 for p in self._positions(key))

    def bits_set(self):
        return sum(self.bits)

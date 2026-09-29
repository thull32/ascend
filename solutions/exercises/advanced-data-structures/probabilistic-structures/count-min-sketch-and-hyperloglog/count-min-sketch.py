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


class CountMinSketch:
    D = 3
    W = 16

    def __init__(self):
        self.table = [[0] * self.W for _ in range(self.D)]

    def _cols(self, key):
        h1 = fnv1a(key)
        h2 = djb2(key)
        return [(h1 + i * h2) % self.W for i in range(self.D)]

    def add(self, key, count):
        for row, col in enumerate(self._cols(key)):
            self.table[row][col] += count

    def estimate(self, key):
        return min(self.table[row][col] for row, col in enumerate(self._cols(key)))

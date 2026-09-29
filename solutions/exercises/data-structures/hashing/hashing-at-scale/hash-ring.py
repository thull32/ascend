import bisect


def hash32(s):
    h = 0x811c9dc5
    for ch in s:
        h = ((h ^ ord(ch)) * 0x01000193) & 0xffffffff
    h ^= h >> 16; h = (h * 0x85ebca6b) & 0xffffffff
    h ^= h >> 13; h = (h * 0xc2b2ae35) & 0xffffffff
    return h ^ (h >> 16)


class HashRing:
    VNODES = 3

    def __init__(self):
        self.points = []          # sorted list of (position, node)

    def add(self, node):
        for i in range(self.VNODES):
            pos = hash32(f"{node}#{i}")
            bisect.insort(self.points, (pos, node))

    def remove(self, node):
        self.points = [p for p in self.points if p[1] != node]

    def get(self, key):
        if not self.points:
            return None
        h = hash32(key)
        lo, hi = 0, len(self.points)
        while lo < hi:
            mid = (lo + hi) // 2
            if self.points[mid][0] < h:
                lo = mid + 1
            else:
                hi = mid
        if lo == len(self.points):
            lo = 0
        return self.points[lo][1]

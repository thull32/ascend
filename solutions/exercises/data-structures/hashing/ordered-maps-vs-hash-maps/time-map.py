class TimeMap:
    def __init__(self):
        self.store = {}      # key -> list of (timestamp, value)

    def set(self, key, value, timestamp):
        self.store.setdefault(key, []).append((timestamp, value))

    def get(self, key, timestamp):
        arr = self.store.get(key)
        if not arr:
            return ""
        lo, hi = 0, len(arr)
        while lo < hi:
            mid = (lo + hi) // 2
            if arr[mid][0] <= timestamp:
                lo = mid + 1
            else:
                hi = mid
        return arr[lo - 1][1] if lo > 0 else ""

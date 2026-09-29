import heapq
from collections import defaultdict


class MedianBag:
    def __init__(self):
        self.low, self.high = [], []   # max-heap (negated), min-heap
        self.pending = defaultdict(int)
        self.live = defaultdict(int)
        self.n_low = self.n_high = 0

    def _prune_low(self):
        while self.low and self.pending[-self.low[0]] > 0:
            v = -heapq.heappop(self.low)
            self.pending[v] -= 1

    def _prune_high(self):
        while self.high and self.pending[self.high[0]] > 0:
            v = heapq.heappop(self.high)
            self.pending[v] -= 1

    def _rebalance(self):
        self._prune_low()
        self._prune_high()
        if self.n_low > self.n_high + 1:
            v = -heapq.heappop(self.low)
            self.n_low -= 1
            heapq.heappush(self.high, v)
            self.n_high += 1
            self._prune_low()
            self._prune_high()
        elif self.n_high > self.n_low:
            v = heapq.heappop(self.high)
            self.n_high -= 1
            heapq.heappush(self.low, -v)
            self.n_low += 1
            self._prune_low()
            self._prune_high()

    def add(self, x):
        self._prune_low()
        self._prune_high()
        if not self.low or x <= -self.low[0]:
            heapq.heappush(self.low, -x)
            self.n_low += 1
        else:
            heapq.heappush(self.high, x)
            self.n_high += 1
        self.live[x] += 1
        self._rebalance()

    def remove(self, x):
        if self.live[x] <= 0:
            return False
        self._prune_low()
        self._prune_high()
        belongs_to_low = bool(self.low) and x <= -self.low[0]
        self.live[x] -= 1
        self.pending[x] += 1
        if belongs_to_low:
            self.n_low -= 1
        else:
            self.n_high -= 1
        self._prune_low()
        self._prune_high()
        self._rebalance()
        return True

    def median(self):
        self._prune_low()
        self._prune_high()
        total = self.n_low + self.n_high
        if total == 0:
            return None
        if self.n_low > self.n_high:
            return -self.low[0]
        return (-self.low[0] + self.high[0]) / 2

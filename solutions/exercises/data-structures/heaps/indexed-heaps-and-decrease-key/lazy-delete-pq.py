# Min-priority queue with lazy deletion: remove() never touches the heap
# array, it just adjusts live/pending counts; pop() discards stale roots
# whose pending count is still positive before returning a live value.

import heapq
from collections import defaultdict


class LazyMinPQ:
    def __init__(self):
        self.h = []
        self.live = defaultdict(int)      # value -> live copies
        self.pending = defaultdict(int)   # value -> copies to discard
        self.n = 0                        # live size

    def push(self, x):
        heapq.heappush(self.h, x)
        self.live[x] += 1
        self.n += 1

    def remove(self, x):
        if self.live[x] > 0:
            self.live[x] -= 1
            self.pending[x] += 1
            self.n -= 1

    def pop(self):
        while self.h and self.pending[self.h[0]] > 0:
            stale = heapq.heappop(self.h)
            self.pending[stale] -= 1
        if not self.h:
            return None
        x = heapq.heappop(self.h)
        self.live[x] -= 1
        self.n -= 1
        return x

    def size(self):
        return self.n

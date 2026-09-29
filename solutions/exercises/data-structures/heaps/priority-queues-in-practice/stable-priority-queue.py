# Stable priority queue: heapq with a monotonic sequence number as the
# tiebreaker so items themselves are never compared.

import heapq


class StablePQ:
    def __init__(self):
        self.h = []
        self.seq = 0

    def push(self, item, priority):
        heapq.heappush(self.h, (priority, self.seq, item))
        self.seq += 1

    def pop(self):
        if not self.h:
            return None
        return heapq.heappop(self.h)[2]

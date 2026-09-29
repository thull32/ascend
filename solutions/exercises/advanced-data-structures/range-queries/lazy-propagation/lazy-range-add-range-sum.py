class LazySegmentTree:
    def build(self, values):
        self.n = len(values)
        self.tot = [0] * (4 * self.n)
        self.lazy = [0] * (4 * self.n)
        self._build(1, 0, self.n - 1, values)

    def _build(self, node, lo, hi, values):
        if lo == hi:
            self.tot[node] = values[lo]
            return
        mid = (lo + hi) // 2
        self._build(2 * node, lo, mid, values)
        self._build(2 * node + 1, mid + 1, hi, values)
        self.tot[node] = self.tot[2 * node] + self.tot[2 * node + 1]

    def _apply(self, node, lo, hi, delta):
        self.tot[node] += delta * (hi - lo + 1)
        self.lazy[node] += delta

    def _push(self, node, lo, hi):
        if self.lazy[node]:
            mid = (lo + hi) // 2
            self._apply(2 * node, lo, mid, self.lazy[node])
            self._apply(2 * node + 1, mid + 1, hi, self.lazy[node])
            self.lazy[node] = 0

    def add(self, l, r, delta):
        self._add(1, 0, self.n - 1, l, r, delta)

    def _add(self, node, lo, hi, l, r, delta):
        if r < lo or hi < l:
            return
        if l <= lo and hi <= r:
            self._apply(node, lo, hi, delta)
            return
        self._push(node, lo, hi)
        mid = (lo + hi) // 2
        self._add(2 * node, lo, mid, l, r, delta)
        self._add(2 * node + 1, mid + 1, hi, l, r, delta)
        self.tot[node] = self.tot[2 * node] + self.tot[2 * node + 1]

    def sum(self, l, r):
        return self._sum(1, 0, self.n - 1, l, r)

    def _sum(self, node, lo, hi, l, r):
        if r < lo or hi < l:
            return 0
        if l <= lo and hi <= r:
            return self.tot[node]
        self._push(node, lo, hi)
        mid = (lo + hi) // 2
        return self._sum(2 * node, lo, mid, l, r) + self._sum(
            2 * node + 1, mid + 1, hi, l, r
        )

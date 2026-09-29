class AssignAddTree:
    def build(self, values):
        self.n = len(values)
        self.tot = [0] * (4 * self.n)
        self.mul = [1] * (4 * self.n)  # pending tag x -> mul*x + add
        self.add_ = [0] * (4 * self.n)
        self._build(1, 0, self.n - 1, values)

    def _build(self, node, lo, hi, values):
        if lo == hi:
            self.tot[node] = values[lo]
            return
        mid = (lo + hi) // 2
        self._build(2 * node, lo, mid, values)
        self._build(2 * node + 1, mid + 1, hi, values)
        self.tot[node] = self.tot[2 * node] + self.tot[2 * node + 1]

    def _apply(self, node, lo, hi, m, a):
        self.tot[node] = m * self.tot[node] + a * (hi - lo + 1)
        self.mul[node] = m * self.mul[node]
        self.add_[node] = m * self.add_[node] + a

    def _push(self, node, lo, hi):
        if self.mul[node] != 1 or self.add_[node] != 0:
            mid = (lo + hi) // 2
            self._apply(2 * node, lo, mid, self.mul[node], self.add_[node])
            self._apply(2 * node + 1, mid + 1, hi, self.mul[node], self.add_[node])
            self.mul[node] = 1
            self.add_[node] = 0

    def _update(self, node, lo, hi, l, r, m, a):
        if r < lo or hi < l:
            return
        if l <= lo and hi <= r:
            self._apply(node, lo, hi, m, a)
            return
        self._push(node, lo, hi)
        mid = (lo + hi) // 2
        self._update(2 * node, lo, mid, l, r, m, a)
        self._update(2 * node + 1, mid + 1, hi, l, r, m, a)
        self.tot[node] = self.tot[2 * node] + self.tot[2 * node + 1]

    def assign(self, l, r, v):
        self._update(1, 0, self.n - 1, l, r, 0, v)

    def add(self, l, r, d):
        self._update(1, 0, self.n - 1, l, r, 1, d)

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

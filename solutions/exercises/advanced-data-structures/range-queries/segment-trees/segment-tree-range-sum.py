class SegmentTree:
    def build(self, values):
        self.n = len(values)
        self.tree = [0] * (2 * self.n)
        for i, v in enumerate(values):
            self.tree[self.n + i] = v
        for i in range(self.n - 1, 0, -1):
            self.tree[i] = self.tree[2 * i] + self.tree[2 * i + 1]

    def update(self, i, value):
        i += self.n
        self.tree[i] = value
        i //= 2
        while i >= 1:
            self.tree[i] = self.tree[2 * i] + self.tree[2 * i + 1]
            i //= 2

    def query(self, l, r):
        l += self.n
        r += self.n + 1
        total = 0
        while l < r:
            if l & 1:
                total += self.tree[l]
                l += 1
            if r & 1:
                r -= 1
                total += self.tree[r]
            l //= 2
            r //= 2
        return total

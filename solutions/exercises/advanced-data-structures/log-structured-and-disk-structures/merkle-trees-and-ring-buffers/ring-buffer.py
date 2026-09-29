class RingBuffer:
    def __init__(self):
        self.buf = []
        self.cap = 0
        self.head = 0  # index of the oldest item
        self.tail = 0  # index where the next item goes
        self.count = 0

    def set_capacity(self, n):
        self.cap = n
        self.buf = [None] * n
        self.head = 0
        self.tail = 0
        self.count = 0
        return None

    def push(self, x):
        if self.count >= self.cap:
            return False
        self.buf[self.tail] = x
        self.tail = (self.tail + 1) % self.cap
        self.count += 1
        return True

    def pop(self):
        if self.count == 0:
            return None
        x = self.buf[self.head]
        self.head = (self.head + 1) % self.cap
        self.count -= 1
        return x

    def size(self):
        return self.count

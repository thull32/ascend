class RingQueue:
    def __init__(self):
        self.cap = 3
        self.buf = [None] * self.cap
        self.head = 0
        self.count = 0

    def enqueue(self, x):
        if self.count == self.cap:
            return False
        tail = (self.head + self.count) % self.cap
        self.buf[tail] = x
        self.count += 1
        return True

    def dequeue(self):
        if self.count == 0:
            return None
        x = self.buf[self.head]
        self.buf[self.head] = None
        self.head = (self.head + 1) % self.cap
        self.count -= 1
        return x

    def peek(self):
        if self.count == 0:
            return None
        return self.buf[self.head]

    def size(self):
        return self.count

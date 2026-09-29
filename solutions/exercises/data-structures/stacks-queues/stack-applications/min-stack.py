class MinStack:
    def __init__(self):
        self.stack = []
        self.mins = []

    def push(self, x):
        self.stack.append(x)
        if self.mins:
            self.mins.append(min(x, self.mins[-1]))
        else:
            self.mins.append(x)

    def pop(self):
        self.stack.pop()
        self.mins.pop()

    def top(self):
        return self.stack[-1]

    def get_min(self):
        return self.mins[-1]

def largest_rectangle(heights):
    n = len(heights)
    stack = []  # indices, heights increasing bottom to top
    best = 0
    for i in range(n + 1):
        cur = heights[i] if i < n else 0  # sentinel flushes the stack
        while stack and heights[stack[-1]] > cur:
            j = stack.pop()
            left = stack[-1] if stack else -1
            best = max(best, heights[j] * (i - left - 1))
        stack.append(i)
    return best

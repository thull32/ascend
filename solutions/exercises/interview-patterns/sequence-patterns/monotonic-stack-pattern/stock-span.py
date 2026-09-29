def stock_span(prices):
    stack = []  # indices with strictly decreasing prices
    spans = []
    for i, price in enumerate(prices):
        while stack and prices[stack[-1]] <= price:
            stack.pop()
        span = i - stack[-1] if stack else i + 1
        spans.append(span)
        stack.append(i)
    return spans

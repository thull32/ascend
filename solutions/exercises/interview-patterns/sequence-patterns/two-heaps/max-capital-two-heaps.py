import heapq


def max_capital(k, w, profits, capital):
    by_capital = sorted(zip(capital, profits))
    profit_heap = []
    i = 0
    n = len(by_capital)

    for _ in range(k):
        while i < n and by_capital[i][0] <= w:
            heapq.heappush(profit_heap, -by_capital[i][1])
            i += 1
        if not profit_heap:
            break
        w += -heapq.heappop(profit_heap)

    return w

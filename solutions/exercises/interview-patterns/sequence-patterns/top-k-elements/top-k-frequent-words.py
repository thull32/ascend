import heapq
from collections import Counter


def top_k_frequent_words(words, k):
    counts = Counter(words)
    heap = [(-count, word) for word, count in counts.items()]
    heapq.heapify(heap)
    result = []
    for _ in range(k):
        _, word = heapq.heappop(heap)
        result.append(word)
    return result

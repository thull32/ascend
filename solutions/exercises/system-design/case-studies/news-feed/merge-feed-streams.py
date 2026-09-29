import heapq


def merge_feed(streams, blocked, deleted, k):
    blocked = set(blocked)
    deleted = set(deleted)

    heap = []
    for s_idx, stream in enumerate(streams):
        if stream:
            post_id, author_id = stream[0]
            heapq.heappush(heap, (-post_id, s_idx, 0))

    result = []
    seen = set()

    while heap and len(result) < k:
        neg_id, s_idx, pos = heapq.heappop(heap)
        post_id, author_id = streams[s_idx][pos]

        if pos + 1 < len(streams[s_idx]):
            next_id = streams[s_idx][pos + 1][0]
            heapq.heappush(heap, (-next_id, s_idx, pos + 1))

        if post_id in seen or author_id in blocked or post_id in deleted:
            continue
        seen.add(post_id)
        result.append(post_id)

    return result

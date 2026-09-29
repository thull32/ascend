import heapq


def sqs_lifecycle(visibility, max_receives, polls):
    received = []
    side_effects = 0
    final = "pending"

    state = "visible"
    invisible_until = 0
    latest_receipt = -1
    receive_count = 0

    heap = []
    for i in range(len(polls)):
        heapq.heappush(heap, (polls[i][0], 1, i, "poll"))

    while heap:
        t, rank, i, kind = heapq.heappop(heap)
        if kind == "complete":
            duration, outcome = polls[i][1], polls[i][2]
            if outcome in ("ok", "crash_after_effect"):
                side_effects += 1
            if outcome == "ok":
                if latest_receipt == i and state not in ("dlq", "deleted"):
                    state = "deleted"
                    final = "deleted"
        else:
            if state == "invisible" and t >= invisible_until:
                state = "visible"
            if state != "visible":
                continue
            if receive_count >= max_receives:
                state = "dlq"
                final = "dlq"
                continue
            receive_count += 1
            latest_receipt = i
            duration = polls[i][1]
            invisible_until = t + visibility
            state = "invisible"
            received.append(i)
            heapq.heappush(heap, (t + duration, 0, i, "complete"))

    return {"received": received, "side_effects": side_effects, "final": final}

def epoll_reads(arrivals, chunk, mode):
    reads = []
    buffered = 0
    for a in arrivals:
        buffered += a
        reported = (mode == "level" and buffered > 0) or (mode == "edge" and a > 0)
        if reported:
            take = min(chunk, buffered)
            reads.append(take)
            buffered -= take
    return {"reads": reads, "unread": buffered}

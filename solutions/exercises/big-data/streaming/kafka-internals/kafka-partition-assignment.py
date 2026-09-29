def assign_partitions(strategy, consumers, topics):
    members = sorted(consumers)
    result = {c: [] for c in members}
    C = len(members)
    if C == 0:
        return result

    if strategy == "range":
        for topic in sorted(topics.keys()):
            P = topics[topic]
            base = P // C
            extra = P % C
            start = 0
            for i, c in enumerate(members):
                count = base + (1 if i < extra else 0)
                for p in range(start, start + count):
                    result[c].append(f"{topic}-{p}")
                start += count
    else:  # roundrobin
        tps = []
        for topic in sorted(topics.keys()):
            for p in range(topics[topic]):
                tps.append(f"{topic}-{p}")
        for j, tp in enumerate(tps):
            result[members[j % C]].append(tp)

    return result

def cache_hits(addresses, line_size, num_sets, ways):
    sets = [[] for _ in range(num_sets)]  # each ordered least- to most-recently-used
    hits = 0
    for addr in addresses:
        line = addr // line_size
        entries = sets[line % num_sets]
        if line in entries:
            hits += 1
            entries.remove(line)
            entries.append(line)
        else:
            if len(entries) >= ways:
                entries.pop(0)
            entries.append(line)
    return hits

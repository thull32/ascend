def count_page_faults(refs, frames, policy):
    order = []  # resident pages; index 0 is the eviction candidate
    resident = set()
    faults = 0
    for r in refs:
        if r in resident:
            if policy == "lru":
                order.remove(r)
                order.append(r)
            continue
        faults += 1
        if len(order) >= frames:
            victim = order.pop(0)
            resident.discard(victim)
        order.append(r)
        resident.add(r)
    return faults

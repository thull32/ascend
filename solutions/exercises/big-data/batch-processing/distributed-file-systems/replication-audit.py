def replication_audit(blocks, racks, dead, rf):
    dead_set = set(dead)
    missing = []
    under_replicated = []
    single_rack = []

    for block_id in sorted(blocks.keys()):
        live = [n for n in blocks[block_id] if n not in dead_set]
        if not live:
            missing.append(block_id)
        elif len(live) < rf:
            under_replicated.append([block_id, len(live)])
        if len(live) >= 2 and len({racks[n] for n in live}) == 1:
            single_rack.append(block_id)

    return {
        "missing": missing,
        "under_replicated": under_replicated,
        "single_rack": single_rack,
    }

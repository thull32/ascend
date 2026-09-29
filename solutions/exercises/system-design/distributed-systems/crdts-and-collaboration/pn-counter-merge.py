def pn_counter_value(states):
    merged_p = {}
    merged_n = {}

    for state in states:
        for rid, val in state.get("p", {}).items():
            if val > merged_p.get(rid, 0):
                merged_p[rid] = val
        for rid, val in state.get("n", {}).items():
            if val > merged_n.get(rid, 0):
                merged_n[rid] = val

    return sum(merged_p.values()) - sum(merged_n.values())

def tumbling_counts(events, size, max_delay):
    results = []
    late = []
    windows = {}
    fired = set()
    largest = float("-inf")

    def watermark():
        return largest - max_delay

    def fire_up_to(wm):
        starts = sorted(s for s in windows if s not in fired and s + size <= wm)
        for s in starts:
            for k in sorted(windows[s].keys()):
                results.append([s, k, windows[s][k]])
            fired.add(s)

    for t, key in events:
        start = t - t % size
        if start + size <= watermark():
            late.append([t, key])
            continue
        windows.setdefault(start, {})
        windows[start][key] = windows[start].get(key, 0) + 1
        if t > largest:
            largest = t
        fire_up_to(watermark())

    fire_up_to(float("inf"))

    return {"results": results, "late": late}

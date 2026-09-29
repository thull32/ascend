def window_counts(events, window, delay):
    fired = []
    late = []
    seen = set()
    counts = {}  # (ad_id, window_start) -> count
    watermark = float("-inf")

    def fire(force):
        ready = [
            (ws, ad) for (ad, ws) in list(counts.keys())
            if force or ws + window <= watermark
        ]
        ready.sort()
        for ws, ad in ready:
            c = counts.pop((ad, ws))
            fired.append([ad, ws, c])

    for impression_id, ad_id, event_time in events:
        if impression_id in seen:
            continue
        seen.add(impression_id)

        window_start = event_time - event_time % window
        if window_start + window <= watermark:
            late.append(impression_id)
        else:
            key = (ad_id, window_start)
            counts[key] = counts.get(key, 0) + 1

        watermark = max(watermark, event_time - delay)
        fire(False)

    fire(True)
    return [fired, late]

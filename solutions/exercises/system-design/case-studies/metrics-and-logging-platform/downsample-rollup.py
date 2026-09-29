def rollup(samples, step):
    windows = {}
    for ts, value in samples:
        start = ts - ts % step
        if start not in windows:
            windows[start] = [start, value, value, value, 1]
        else:
            w = windows[start]
            w[1] = min(w[1], value)
            w[2] = max(w[2], value)
            w[3] += value
            w[4] += 1

    return [windows[k] for k in sorted(windows)]

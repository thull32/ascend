import math


def phi_values(arrivals, checks, window, min_std, pause):
    out = []
    for c in checks:
        history = [a for a in arrivals if a <= c]
        if len(history) < 2:
            out.append(0.0)
            continue

        intervals = [history[i + 1] - history[i] for i in range(len(history) - 1)]
        intervals = intervals[-window:]
        n = len(intervals)
        mean = sum(intervals) / n
        var = sum((x - mean) ** 2 for x in intervals) / n
        var = max(var, 0.0)
        std = math.sqrt(var)
        if std < min_std:
            std = min_std

        dt = c - history[-1]
        y = (dt - (mean + pause)) / std
        g = y * (1.5976 + 0.070566 * y * y)

        if g > 40:
            phi = g / math.log(10)
        else:
            phi = math.log10(1 + math.exp(g))

        out.append(round(phi, 2))
    return out

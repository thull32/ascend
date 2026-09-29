def volume_anomalies(counts, window, threshold):
    def median(values):
        s = sorted(values)
        n = len(s)
        mid = n // 2
        if n % 2 == 1:
            return s[mid]
        return (s[mid - 1] + s[mid]) / 2

    flagged = []
    for i in range(window, len(counts)):
        history = counts[i - window:i]
        m = median(history)
        mad = median([abs(x - m) for x in history])
        if abs(counts[i] - m) > threshold * mad:
            flagged.append(i)
    return flagged

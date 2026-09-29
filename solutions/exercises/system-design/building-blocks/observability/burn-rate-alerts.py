def first_alerts(budget_ppm, minutes, rules):
    n = len(minutes)
    prefix_total = [0] * (n + 1)
    prefix_err = [0] * (n + 1)
    for i in range(n):
        prefix_total[i + 1] = prefix_total[i] + minutes[i][0]
        prefix_err[i + 1] = prefix_err[i] + minutes[i][1]

    def is_burning(end, w, burn_x10):
        start = end - w + 1
        if start < 0:
            return False
        total = prefix_total[end + 1] - prefix_total[start]
        errors = prefix_err[end + 1] - prefix_err[start]
        if total <= 0:
            return False
        return errors * 10_000_000 >= burn_x10 * budget_ppm * total

    result = []
    for long_w, short_w, burn_x10 in rules:
        fired = -1
        for i in range(n):
            if is_burning(i, long_w, burn_x10) and is_burning(i, short_w, burn_x10):
                fired = i
                break
        result.append(fired)
    return result

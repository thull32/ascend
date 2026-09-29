# Power-of-two-choices least-requests balancing simulation.

def p2c(n, events):
    active = [0] * n
    chosen = []
    for event in events:
        if event[0] == "req":
            a, b = event[1], event[2]
            target = a if active[a] <= active[b] else b
            active[target] += 1
            chosen.append(target)
        else:  # "done"
            k = event[1]
            active[k] -= 1
    return chosen

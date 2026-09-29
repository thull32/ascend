def amdahl(parts):
    remaining = 1.0
    total = 0.0
    for fraction, speedup in parts:
        remaining -= fraction
        total += fraction / speedup
    new_time = remaining + total
    return round(1 / new_time, 2)

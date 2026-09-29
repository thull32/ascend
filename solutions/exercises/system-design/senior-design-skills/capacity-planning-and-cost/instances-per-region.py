import math


def instances_per_region(peak_rps, per_instance_rps, target_pct, regions):
    if regions > 1:
        load = peak_rps / (regions - 1)
    else:
        load = peak_rps

    usable = per_instance_rps * target_pct / 100
    n = math.ceil(load / usable)
    return max(n, 2)

def raid_profile(level, n, size_tb, iops):
    if level == "0":
        if n < 1:
            return None
        return {"usable_tb": n * size_tb, "failures": 0, "write_iops": n * iops}
    if level == "1":
        if n < 2:
            return None
        return {"usable_tb": size_tb, "failures": n - 1, "write_iops": iops}
    if level == "5":
        if n < 3:
            return None
        return {
            "usable_tb": (n - 1) * size_tb,
            "failures": 1,
            "write_iops": (n * iops) // 4,
        }
    if level == "6":
        if n < 4:
            return None
        return {
            "usable_tb": (n - 2) * size_tb,
            "failures": 2,
            "write_iops": (n * iops) // 6,
        }
    if level == "10":
        if n < 2 or n % 2 != 0:
            return None
        return {
            "usable_tb": (n // 2) * size_tb,
            "failures": 1,
            "write_iops": (n * iops) // 2,
        }
    return None

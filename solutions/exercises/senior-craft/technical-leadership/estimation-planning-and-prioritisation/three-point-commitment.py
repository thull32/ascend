import math


def commit_plan(tasks, z, focus):
    if not tasks:
        return {"mean": 0, "sigma": 0, "riskiest": -1, "working_days": 0, "commit_day": 0}

    total_mean = 0.0
    total_var = 0.0
    riskiest = 0
    best_var = -1.0

    for i, (o, m, p) in enumerate(tasks):
        mean = (o + 4 * m + p) / 6
        sd = (p - o) / 6
        var = sd * sd
        total_mean += mean
        total_var += var
        if var > best_var:
            best_var = var
            riskiest = i

    sigma = math.sqrt(total_var)
    commitment = total_mean + z * sigma
    working_days = math.ceil(commitment / focus)

    if working_days == 0:
        commit_day = 0
    else:
        w = working_days
        commit_day = w + 2 * ((w - 1) // 5)

    return {
        "mean": round(total_mean, 2),
        "sigma": round(sigma, 2),
        "riskiest": riskiest,
        "working_days": working_days,
        "commit_day": commit_day,
    }

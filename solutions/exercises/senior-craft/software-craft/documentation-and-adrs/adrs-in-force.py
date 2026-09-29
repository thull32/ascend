def in_force(adrs):
    superseded = set()
    for a in adrs:
        if a["status"] == "accepted":
            superseded.update(a["supersedes"])
    in_force_adrs = [
        a for a in adrs if a["status"] == "accepted" and a["id"] not in superseded
    ]
    in_force_adrs.sort(key=lambda a: a["id"])
    return [a["title"] for a in in_force_adrs]

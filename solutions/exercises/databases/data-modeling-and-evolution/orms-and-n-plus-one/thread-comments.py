def thread_comments(rows):
    result = []
    roots = {}

    for row in rows:
        if row["parent_id"] is None:
            entry = [row["id"], []]
            roots[row["id"]] = entry
            result.append(entry)

    for row in rows:
        pid = row["parent_id"]
        if pid is not None and pid in roots:
            roots[pid][1].append(row["id"])

    return result

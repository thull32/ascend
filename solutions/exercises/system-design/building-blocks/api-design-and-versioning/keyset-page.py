def keyset_page(rows, limit, cursor):
    ordered = sorted(rows, key=lambda r: (r[1], r[0]), reverse=True)
    if cursor is not None:
        c_created, c_id = cursor
        ordered = [r for r in ordered if (r[1], r[0]) < (c_created, c_id)]

    page = ordered[:limit + 1]
    has_more = len(page) > limit
    page = page[:limit]

    ids = [r[0] for r in page]
    next_cursor = [page[-1][1], page[-1][0]] if has_more else None

    return {"ids": ids, "next": next_cursor}

# Keyset pagination with an opaque base64 cursor.

import base64


def keyset_page(rows, limit, cursor):
    ordered = sorted(rows, key=lambda r: (r[0], r[1]), reverse=True)

    if cursor is None:
        after = None
    else:
        decoded = base64.b64decode(cursor).decode("ascii")
        created_at_str, id_str = decoded.split(",", 1)
        after = (int(created_at_str), int(id_str))

    remaining = ordered
    if after is not None:
        remaining = [r for r in ordered if (r[0], r[1]) < after]

    page = remaining[:limit]
    has_next = len(remaining) > limit

    ids = [r[1] for r in page]
    if not page or not has_next:
        next_cursor = None
    else:
        last = page[-1]
        raw = f"{last[0]},{last[1]}"
        next_cursor = base64.b64encode(raw.encode("ascii")).decode("ascii")

    return {"ids": ids, "next": next_cursor}

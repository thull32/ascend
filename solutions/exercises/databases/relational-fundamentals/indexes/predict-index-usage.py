def index_usage(index_cols, equals, ranges, order_by):
    equals_set = set(equals)
    ranges_set = set(ranges)

    bound_columns = 0
    for col in index_cols:
        if col in equals_set:
            bound_columns += 1
            continue
        elif col in ranges_set:
            bound_columns += 1
            break
        else:
            break

    sorted_ok = False
    if order_by in index_cols:
        p = index_cols.index(order_by)
        if all(c in equals_set for c in index_cols[:p]):
            sorted_ok = True

    return {"bound_columns": bound_columns, "sorted": sorted_ok}

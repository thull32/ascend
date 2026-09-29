def heap_layout(data_bytes, fillfactor, n_rows):
    tuple_bytes = ((24 + data_bytes) + 7) // 8 * 8
    reserved = 8192 * (100 - fillfactor) // 100
    available = 8168 - reserved
    rows_per_page = available // (tuple_bytes + 4)
    rows_per_page = min(rows_per_page, 291)

    if n_rows == 0:
        pages = 0
    else:
        pages = (n_rows + rows_per_page - 1) // rows_per_page

    return {"tuple_bytes": tuple_bytes, "rows_per_page": rows_per_page, "pages": pages}

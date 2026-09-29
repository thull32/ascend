def redo(pages, log, checkpoint_lsn):
    pages_after = {k: list(v) for k, v in pages.items()}
    applied = 0

    for lsn, page_id, value in log:
        if lsn < checkpoint_lsn:
            continue
        page_lsn, _ = pages_after.get(page_id, [0, None])
        if lsn > page_lsn:
            pages_after[page_id] = [lsn, value]
            applied += 1

    return [pages_after, applied]

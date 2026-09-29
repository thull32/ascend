def first_borrow_error(stmts):
    creation = {}  # name -> (created_index, kind)
    last_use = {}  # name -> last index it is used at (creation index if never used)

    for i, s in enumerate(stmts):
        if s[0] in ("shared", "mut"):
            name = s[1]
            creation[name] = (i, s[0])
            last_use.setdefault(name, i)
        elif s[0] == "use":
            last_use[s[1]] = i

    moved = False
    for i, s in enumerate(stmts):
        kind = s[0]
        if kind == "use":
            continue
        if moved:
            return i

        live_shared = False
        live_mut = False
        for name, (created, borrow_kind) in creation.items():
            if created < i < last_use[name]:
                if borrow_kind == "shared":
                    live_shared = True
                else:
                    live_mut = True

        if kind in ("shared", "read"):
            if live_mut:
                return i
        elif kind in ("mut", "write", "move"):
            if live_shared or live_mut:
                return i

        if kind == "move":
            moved = True

    return -1

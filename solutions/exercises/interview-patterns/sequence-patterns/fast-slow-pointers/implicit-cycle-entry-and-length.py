def find_cycle(nxt, start):
    slow = fast = start
    while True:
        slow = nxt[slow]
        fast = nxt[nxt[fast]]
        if slow == fast:
            break

    entry = start
    while entry != slow:
        entry = nxt[entry]
        slow = nxt[slow]

    length = 1
    cur = nxt[entry]
    while cur != entry:
        cur = nxt[cur]
        length += 1

    return [entry, length]

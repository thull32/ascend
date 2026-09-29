from collections import deque

def rw_grant_order(ops):
    readers = 0
    writer = None
    waiting_readers = deque()
    waiting_writers = deque()
    granted = []
    mode = {}

    for kind, tid in ops:
        if kind == "read":
            if writer is None and not waiting_writers:
                readers += 1
                granted.append(tid)
                mode[tid] = "r"
            else:
                waiting_readers.append(tid)
        elif kind == "write":
            if writer is None and readers == 0:
                writer = tid
                granted.append(tid)
                mode[tid] = "w"
            else:
                waiting_writers.append(tid)
        else:  # done
            released = mode.pop(tid)
            if released == "w":
                writer = None
                if waiting_readers:
                    while waiting_readers:
                        r = waiting_readers.popleft()
                        readers += 1
                        granted.append(r)
                        mode[r] = "r"
                elif waiting_writers:
                    w = waiting_writers.popleft()
                    writer = w
                    granted.append(w)
                    mode[w] = "w"
            else:
                readers -= 1
                if readers == 0 and waiting_writers:
                    w = waiting_writers.popleft()
                    writer = w
                    granted.append(w)
                    mode[w] = "w"

    return granted

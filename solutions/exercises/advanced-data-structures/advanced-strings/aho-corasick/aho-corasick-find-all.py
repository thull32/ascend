from collections import deque


def _build(patterns):
    children = [{}]
    fail = [0]
    output = [[]]

    for idx, p in enumerate(patterns):
        cur = 0
        for ch in p:
            nxt = children[cur].get(ch)
            if nxt is None:
                children.append({})
                fail.append(0)
                output.append([])
                nxt = len(children) - 1
                children[cur][ch] = nxt
            cur = nxt
        output[cur].append(idx)

    queue = deque()
    for ch, v in children[0].items():
        fail[v] = 0
        queue.append(v)

    while queue:
        u = queue.popleft()
        for ch, v in children[u].items():
            queue.append(v)
            f = fail[u]
            while f != 0 and ch not in children[f]:
                f = fail[f]
            if ch in children[f] and children[f][ch] != v:
                fail[v] = children[f][ch]
            else:
                fail[v] = 0
            output[v] = output[v] + output[fail[v]]

    return children, fail, output


def _search(children, fail, output, text):
    matches = []
    node = 0
    for i, ch in enumerate(text):
        while node != 0 and ch not in children[node]:
            node = fail[node]
        node = children[node].get(ch, 0)
        for idx in output[node]:
            matches.append((i, idx))
    return matches


def find_all(patterns, text):
    if not patterns:
        return []
    children, fail, output = _build(patterns)
    matches = _search(children, fail, output, text)
    result = [
        [i - len(patterns[idx]) + 1, patterns[idx]] for i, idx in matches
    ]
    result.sort(key=lambda x: (x[0], x[1]))
    return result

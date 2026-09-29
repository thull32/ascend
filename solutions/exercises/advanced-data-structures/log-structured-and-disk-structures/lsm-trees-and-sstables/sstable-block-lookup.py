def sstable_block(first_keys, key):
    lo, hi = 0, len(first_keys) - 1
    answer = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if first_keys[mid] <= key:
            answer = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return answer

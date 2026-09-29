def rotate_right(head, k):
    if head is None:
        return None

    n = 1
    tail = head
    while tail.next:
        tail = tail.next
        n += 1

    k %= n
    if k == 0:
        return head

    steps_to_new_tail = n - k - 1
    new_tail = head
    for _ in range(steps_to_new_tail):
        new_tail = new_tail.next

    new_head = new_tail.next
    new_tail.next = None
    tail.next = head
    return new_head

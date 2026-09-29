def delete_value(head, value):
    sentinel = ListNode(0, head)
    p = sentinel
    while p.next is not None:
        if p.next.val == value:
            p.next = p.next.next
        else:
            p = p.next
    return sentinel.next

def insert_sorted(head, value):
    sentinel = ListNode(0, head)
    p = sentinel
    while p.next is not None and p.next.val <= value:
        p = p.next
    node = ListNode(value)
    node.next = p.next
    p.next = node
    return sentinel.next

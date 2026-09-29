def partition_list(head, x):
    less, more = ListNode(0), ListNode(0)
    lt, mt = less, more
    node = head
    while node is not None:
        if node.val < x:
            lt.next = node
            lt = node
        else:
            mt.next = node
            mt = node
        node = node.next
    mt.next = None
    lt.next = more.next
    return less.next

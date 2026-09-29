def delete_middle(head):
    if head is None:
        return None
    dummy = ListNode(0, head)
    slow, fast = dummy, head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    slow.next = slow.next.next
    return dummy.next

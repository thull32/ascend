def kth_from_end(head, k):
    lead = head
    for _ in range(k):
        if lead is None:
            return None
        lead = lead.next
    trail = head
    while lead is not None:
        lead = lead.next
        trail = trail.next
    return trail.val

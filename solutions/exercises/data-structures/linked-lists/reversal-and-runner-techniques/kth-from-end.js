function kth_from_end(head, k) {
  let lead = head;
  for (let i = 0; i < k; i++) {
    if (lead === null) return null;
    lead = lead.next;
  }
  let trail = head;
  while (lead !== null) {
    lead = lead.next;
    trail = trail.next;
  }
  return trail.val;
}

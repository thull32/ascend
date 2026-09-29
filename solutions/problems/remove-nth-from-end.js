// Remove Nth Node From End of List: gap two-pointer with a dummy head.
// Uses the global ListNode class provided by the harness.
function remove_nth_from_end(head, n) {
  const dummy = new ListNode(0, head);
  let lead = dummy;
  let trail = dummy;
  for (let i = 0; i < n + 1; i++) {
    lead = lead.next;
  }
  while (lead !== null) {
    lead = lead.next;
    trail = trail.next;
  }
  trail.next = trail.next.next;
  return dummy.next;
}

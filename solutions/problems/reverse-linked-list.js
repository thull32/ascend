// Reverse Linked List: iterative pointer flip.
// Uses the global ListNode class provided by the harness.
function reverse_list(head) {
  let prev = null;
  let cur = head;
  while (cur !== null) {
    const nxt = cur.next; // save before overwriting
    cur.next = prev; // flip the arrow
    prev = cur; // advance the reversed prefix
    cur = nxt; // advance into the unreversed suffix
  }
  return prev;
}

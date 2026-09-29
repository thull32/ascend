// Merge Two Sorted Lists: dummy head, splice smaller node each step, attach the remainder.
// Uses ListNode which is provided globally by the grading harness.
function merge_two_lists(a, b) {
  const dummy = new ListNode(0);
  let tail = dummy;
  while (a !== null && a !== undefined && b !== null && b !== undefined) {
    if (a.val <= b.val) {
      tail.next = a;
      a = a.next;
    } else {
      tail.next = b;
      b = b.next;
    }
    tail = tail.next;
  }
  tail.next = a !== null && a !== undefined ? a : b;
  return dummy.next;
}

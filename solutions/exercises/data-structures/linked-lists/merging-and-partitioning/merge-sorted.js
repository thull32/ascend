function merge_sorted(a, b) {
  const sentinel = new ListNode(0);
  let tail = sentinel;
  while (a !== null && b !== null) {
    if (a.val <= b.val) {
      tail.next = a;
      a = a.next;
    } else {
      tail.next = b;
      b = b.next;
    }
    tail = tail.next;
  }
  tail.next = a !== null ? a : b;
  return sentinel.next;
}

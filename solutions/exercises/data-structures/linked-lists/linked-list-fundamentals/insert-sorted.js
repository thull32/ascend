function insert_sorted(head, value) {
  const sentinel = new ListNode(0, head);
  let p = sentinel;
  while (p.next !== null && p.next.val <= value) {
    p = p.next;
  }
  const node = new ListNode(value);
  node.next = p.next;
  p.next = node;
  return sentinel.next;
}

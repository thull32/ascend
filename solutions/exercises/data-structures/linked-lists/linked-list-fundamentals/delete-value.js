function delete_value(head, value) {
  const sentinel = new ListNode(0, head);
  let p = sentinel;
  while (p.next !== null) {
    if (p.next.val === value) {
      p.next = p.next.next;
    } else {
      p = p.next;
    }
  }
  return sentinel.next;
}

function reverse_between(head, left, right) {
  const dummy = new ListNode(0, head);
  let before = dummy;
  for (let i = 0; i < left - 1; i++) before = before.next;

  let prev = null;
  let curr = before.next;
  for (let i = 0; i < right - left + 1; i++) {
    const nxt = curr.next;
    curr.next = prev;
    prev = curr;
    curr = nxt;
  }

  before.next.next = curr;
  before.next = prev;
  return dummy.next;
}

function delete_middle(head) {
  if (head === null) return null;
  const dummy = new ListNode(0, head);
  let slow = dummy, fast = head;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
  }
  slow.next = slow.next.next;
  return dummy.next;
}

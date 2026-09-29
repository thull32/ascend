function reverse_list(head) {
  let prev = null;
  let curr = head;
  while (curr !== null) {
    const nxt = curr.next;
    curr.next = prev;
    prev = curr;
    curr = nxt;
  }
  return prev;
}

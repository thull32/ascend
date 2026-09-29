function partition_list(head, x) {
  const less = new ListNode(0);
  const more = new ListNode(0);
  let lt = less;
  let mt = more;
  let node = head;
  while (node !== null) {
    if (node.val < x) {
      lt.next = node;
      lt = node;
    } else {
      mt.next = node;
      mt = node;
    }
    node = node.next;
  }
  mt.next = null;
  lt.next = more.next;
  return less.next;
}

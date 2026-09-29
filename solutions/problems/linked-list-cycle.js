// Linked List Cycle — build the list, then Floyd's tortoise and hare.
function has_cycle(values, pos) {
  const nodes = values.map((v) => new ListNode(v));
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i].next = nodes[i + 1];
  }
  if (nodes.length && pos !== -1) {
    nodes[nodes.length - 1].next = nodes[pos];
  }
  const head = nodes.length ? nodes[0] : null;

  let slow = head;
  let fast = head;
  while (fast !== null && fast.next !== null) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) return true;
  }
  return false;
}

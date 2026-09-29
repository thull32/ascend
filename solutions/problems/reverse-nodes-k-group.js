// Reverse Nodes in k-Group: look ahead k nodes, reverse exactly k, reconnect.
// Uses the global ListNode class provided by the harness.
function reverse_k_group(head, k) {
  const dummy = new ListNode(0, head);
  let groupPrev = dummy;

  while (true) {
    // 1. is there a full group ahead?
    let kth = groupPrev;
    let ok = true;
    for (let i = 0; i < k; i++) {
      kth = kth.next;
      if (kth === null) {
        ok = false;
        break;
      }
    }
    if (!ok) return dummy.next;
    const groupNext = kth.next;

    // 2-3. reverse exactly k nodes, landing on groupNext
    let prev = groupNext;
    let cur = groupPrev.next;
    for (let i = 0; i < k; i++) {
      const nxt = cur.next;
      cur.next = prev;
      prev = cur;
      cur = nxt;
    }

    // 4. reconnect
    const first = groupPrev.next; // old first node, now the group's tail
    groupPrev.next = kth;
    groupPrev = first;
  }
}

// Reorder List: find middle, reverse second half, interleave.
// Uses the global ListNode class provided by the harness.
function reorder_list(head) {
  if (head === null || head.next === null) return head;

  // 1. middle: slow ends on the last node of the first half
  let slow = head;
  let fast = head;
  while (fast.next !== null && fast.next.next !== null) {
    slow = slow.next;
    fast = fast.next.next;
  }

  // 2. split and reverse the second half
  let second = slow.next;
  slow.next = null;
  let prev = null;
  while (second !== null) {
    const nxt = second.next;
    second.next = prev;
    prev = second;
    second = nxt;
  }
  second = prev;

  // 3. interleave
  let first = head;
  while (second !== null) {
    const fNext = first.next;
    const sNext = second.next;
    first.next = second;
    second.next = fNext;
    first = fNext;
    second = sNext;
  }
  return head;
}

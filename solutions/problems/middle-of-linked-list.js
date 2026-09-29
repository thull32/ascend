// Middle of the Linked List: fast/slow pointers; fast moves twice as fast as slow.
// Uses ListNode which is provided globally by the grading harness.
function middle_node(head) {
  let slow = head;
  let fast = head;
  while (fast !== null && fast !== undefined && fast.next !== null && fast.next !== undefined) {
    slow = slow.next;
    fast = fast.next.next;
  }
  return slow;
}

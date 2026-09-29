// Palindrome Linked List: find the middle, reverse the second half, compare, then restore.
// Uses ListNode which is provided globally by the grading harness.
function is_palindrome(head) {
  if (head === null || head === undefined || head.next === null || head.next === undefined) {
    return true;
  }

  let slow = head;
  let fast = head;
  while (fast !== null && fast !== undefined && fast.next !== null && fast.next !== undefined) {
    slow = slow.next;
    fast = fast.next.next;
  }

  function reverse(node) {
    let prev = null;
    while (node !== null && node !== undefined) {
      const nxt = node.next;
      node.next = prev;
      prev = node;
      node = nxt;
    }
    return prev;
  }

  const second = reverse(slow);
  let ok = true;
  let a = head;
  let b = second;
  while (b !== null && b !== undefined) {
    if (a.val !== b.val) {
      ok = false;
      break;
    }
    a = a.next;
    b = b.next;
  }

  reverse(second); // restore the original list
  return ok;
}

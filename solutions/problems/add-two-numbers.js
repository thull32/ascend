// Simulate grade-school addition digit by digit with a carry.
function add_two_numbers(a, b) {
  const dummy = new ListNode(0);
  let tail = dummy;
  let carry = 0;
  while (a !== null || b !== null || carry) {
    let total = carry;
    if (a !== null) {
      total += a.val;
      a = a.next;
    }
    if (b !== null) {
      total += b.val;
      b = b.next;
    }
    carry = Math.floor(total / 10);
    const digit = total % 10;
    tail.next = new ListNode(digit);
    tail = tail.next;
  }
  return dummy.next;
}

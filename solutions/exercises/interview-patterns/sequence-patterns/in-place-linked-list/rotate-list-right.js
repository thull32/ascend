function rotate_right(head, k) {
  if (head === null) return null;

  let n = 1;
  let tail = head;
  while (tail.next) {
    tail = tail.next;
    n += 1;
  }

  k %= n;
  if (k === 0) return head;

  const stepsToNewTail = n - k - 1;
  let newTail = head;
  for (let i = 0; i < stepsToNewTail; i++) newTail = newTail.next;

  const newHead = newTail.next;
  newTail.next = null;
  tail.next = head;
  return newHead;
}

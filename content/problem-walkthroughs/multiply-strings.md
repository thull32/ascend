---
problem: multiply-strings
args: ["12", "34"]
frames: 33
source: e6672c8423b07046
---
@0
We multiply 12 by 34, given as strings, without converting them to integers. The insight is about columns. In long multiplication, digit i of the first number times digit j of the second always lands in the same column of the answer. Keep one array of digit slots, as long as both numbers together, and the product of those two digits belongs in slot i plus j plus one, with any carry going one slot to the left, slot i plus j. No partial-product strings, and no separate adder.

@1-3
Neither number is zero. Both have two digits, so the answer has at most four, and the slots start as four zeros.

@4-10
We walk from the least significant digits, so carries flow leftwards. The last digit of 12 is 2, and the last digit of 34 is 4. Their slot is 1 plus 1 plus 1, slot 3. Two times four is 8, plus the zero already there: 8. The slot keeps the 8, and the carry is zero. Slots: 0, 0, 0, 8.

@11-16
Same 2, now times the 3. That lands in slot 2: six, no carry. Slots: 0, 0, 6, 8.

@17-23
Now the first digit of 12, which is 1. Times the 4, it lands in slot 2, which already holds 6. Here is the step that makes it work: the total is 4 plus 6, which is 10. Slot 2 keeps the 0, and the carry of 1 goes into slot 1. Slots: 0, 1, 0, 8.

@24-29
Finally 1 times 3 lands in slot 1, which holds the carry of 1. The total is 4, so slot 1 becomes 4, with no carry. Slots: 0, 4, 0, 8.

@30-32
Join the slots, 0, 4, 0, 8, and strip the leading zero: 408. And 12 times 34 is 408. A slot can briefly hold more than 9, but it is always tidied when the loop later treats it as the landing slot of a product. The time is m times n digit products, and the space is m plus n slots. Two mistakes to watch for: returning a string of zeros when one input is 0, which is why the first line checks; and carrying into the landing slot instead of the slot to its left.

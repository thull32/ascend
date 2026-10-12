---
problem: decode-string
args: ["2[a3[b]c]"]
frames: 51
source: 2d856ba5be2ca680
---
@0-3
The encoded string is: 2, open bracket, a, 3, open bracket, b, close bracket, c, close bracket. Read it as: twice, the text a, then three b's, then c. When we reach a closing bracket we need two things: the text built since the matching opening bracket, and the count written just before it. Everything outside the group has to be set aside until the group is done, and set-aside contexts come back in reverse order of nesting. That is a stack. Each opening bracket pushes the outer context, the text so far and the pending count, and starts fresh. Each closing bracket pops it, repeats the inner text, and glues it onto the outer text. We start with an empty stack, empty current text, and a count of zero.

@4-6
The 2 is a digit, so it goes into the count. The count is built as count times ten plus the digit, so a count like 10 works too. Treating each digit as a whole count is the classic bug.

@7-12
An opening bracket. We push the pair: the outer text, which is empty, and the count, 2. Then we start a fresh current text and reset the count to zero. The stack holds one context: empty text, repeat twice.

@13-17
The letter a is plain text, so it is appended to the current text.

@18-26
Then a 3, so the count becomes 3. Then another opening bracket: we push the text so far, a, together with the count 3, and start fresh again. The stack now holds two contexts. Pushing that a is essential. Push only the count and the a is lost.

@27-31
The letter b goes into the fresh current text.

@32-37
The first closing bracket. We pop the most recent context: outer text a, count 3. The inner text, b, is repeated three times and glued after the outer text. The current text becomes a b b b. The stack is back to one context.

@38-42
The letter c is appended: a b b b, then c.

@43-48
The last closing bracket pops the first context: outer text empty, count 2. The current text, a b b b c, is repeated twice. The result is a b b b c a b b b c, and the stack is empty.

@49-50
We return a b b b c a b b b c. Each output character is written a small number of times per level of nesting it sits in, so the cost is about the length of the output, and the stack is as deep as the nesting. Building the text in a list and joining it, rather than adding to a string over and over, avoids quadratic copying in languages where strings cannot change.

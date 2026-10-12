---
problem: palindrome-partitioning
args: ["aab"]
frames: 79
source: 114dc06ba45dd81c
---
@0
The string is A, A, B. We want every way to cut it into pieces that are all palindromes. Decide the pieces left to right. The first piece runs from the start to some position; if it is not a palindrome, no answer starts that way, so we skip it without exploring further. If it is, the rest of the string is the same problem again. That is backtracking, with the palindrome test as the pruning rule. And since the same substrings get tested on many branches, we precompute a table that says whether each one is a palindrome.

@1-5
The table is three by three: one entry for every start and end, all false to begin.

@6-9
We fill it from the last start backwards, because each entry reads the one diagonally inside it, which must already be filled. Start 2, end 2: a single B, a palindrome.

@10-15
Start 1. The single A is a palindrome. A then B is not: the ends differ.

@16-23
Start 0. The single A is. A, A is, because the ends match and nothing lies between them. A, A, B is not: A and B differ. So the palindromes are the three single letters and the pair A, A.

@24-33
Now the search. From position 0, the first candidate piece is the single A. It is a palindrome, so it goes on the path, and we recurse from position 1.

@34-42
From position 1, the single A is a palindrome too: the path is A, A. From position 2, the single B: the path is A, A, B.

@43-47
Position 3 is the end of the string, so the path is a complete answer. We store a copy of it, A, A, B, and return.

@48-56
Now we undo. Each level pops its piece off the path. Back at position 1, the next candidate is A, B, which the table says is not a palindrome, so that whole branch is skipped in one lookup. Back at position 0, the path is empty again.

@57-64
The next first piece is A, A, a palindrome. Recurse from position 2, and the B completes the path: A A, then B.

@65-73
Another complete answer, stored. Undo again. Back at position 0, the last candidate is the whole string, A, A, B, which is not a palindrome.

@74-78
We return two partitions: A, A, B as three pieces, and A A with B. Building the table costs n squared. The search is bounded by the output, up to n times two to the n when every cut works. Two classic mistakes: filling the table with the start increasing, which reads entries before they are written, and recording the path one position too early, which drops the last piece.

---
lesson: string-dp
source: 0321348010cdd916
---
## 1

In longest common subsequence, when the last characters of the two prefixes match, the cell takes one plus the diagonal cell. Why is that safe without also considering the cell above and the cell to the left?

A, because any longest common subsequence can be rewritten to end with this matching pair. B, because the cells above and to the left are always strictly smaller. C, it is not safe; the recurrence must take the maximum of all three. D, because this matched pair must appear in every longest common subsequence of the prefixes.

[think]

The answer is A: any longest common subsequence can be rewritten to end with this matching pair.

It is an exchange argument: take any optimal subsequence; if it does not use this final pair, swap its last match for this pair, or append it, and it is at least as long. The pair need not be in every optimal answer, only in some. The other two cells are at most the diagonal plus one, and they can equal it, so they are not strictly smaller; the justification is the exchange.

## 2

You compute edit distance, and you initialise the whole border to zero, as you would for longest common subsequence. What happens?

A, only the first row and column are wrong; the interior is right. B, it returns the insert-and-delete-only distance: the two lengths added, minus twice the common subsequence. C, nothing; the interior recurrence corrects the bad border. D, the interior underestimates, because deleting a prefix now looks free.

[think]

The answer is D: the interior underestimates, because deleting a prefix now looks free.

The border encodes the cost of deleting or inserting a whole prefix: i deletions down the side, j insertions along the top. With a zero border, turning a, b, c into the empty string claims zero edits instead of three, and every interior cell that routes through the border inherits the error. The border is the base case, and a wrong base case poisons the table rather than being corrected by it.

## 3

In the regular-expression table, when a starred pattern element consumes a character, the transition moves back one in the string but stays at the same pattern position. Why not also move back past the starred element in the pattern?

A, because that cell is already covered by the zero-copies case. B, they are equivalent; both let the star consume one or more characters. C, because the pattern index could go negative when the star is the second character. D, because the same starred element may go on to consume more characters.

[think]

The answer is D: the same starred element may go on to consume more characters.

After the star consumes one character, the same starred element may consume more, so the pattern position must not advance. The pattern a-star matching three a's consumes them one at a time while staying on the same element; advancing after one would allow exactly one copy. The zero-copies case skips the pattern element without moving in the string.

## 4

For the longest palindromic substring, which statement is accurate?

A, expand-around-centre is linear, since each centre is expanded only once. B, expand-around-centre is also n squared time, but needs only constant space. C, the table is n log n, since each length reads only one shorter length. D, the n squared table beats expand-around-centre, since it reuses subresults.

[think]

The answer is B: expand-around-centre is also n squared time, but needs only constant space.

Both are n squared in the worst case, as on a string of all a's, since a single centre can expand a linear number of times. Expand-around-centre avoids the n squared table and is usually faster, since it allocates nothing. The table pays off when many overlapping palindrome checks are needed, as in palindrome partitioning. Manacher's algorithm is the linear option, and it is rarely expected.

## 5

An interviewer asks how you would fuzzy-match a query against a million dictionary words, with an edit distance of at most 2. What is the strongest first answer?

A, sort the dictionary, then binary search for the closest word. B, compute only a band of width 2k plus 1 around the diagonal for each word. C, use longest common subsequence instead, since it is cheaper than edit distance. D, run the full table against every word, since a million is small.

[think]

The answer is B: compute only a band of width 2k plus 1 around the diagonal.

Cells far from the diagonal cannot have a distance of at most k, so the band is enough, costing k times n per word, and it is a direct optimisation of the table you wrote. The next level avoids the linear scan altogether, with a Levenshtein automaton over a trie, or a BK-tree. Binary search does not apply to edit distance, and longest common subsequence costs the same.

## 6

The regular-expression table takes time proportional to the string length times the pattern length, for every input. Yet Python's regex engine can take seconds on a pattern with a nested repetition, a plus inside a group that is itself repeated, against thirty a's. What explains the difference?

A, a backtracker must allocate a new table for every alternative it tries. B, Python's regex engine is written in pure Python, so each step is slower. C, the table memoises each pair of positions once, while a backtracker revisits them. D, the table supports only dot and star, so it has fewer cases to check.

[think]

The answer is C: the table memoises each pair of positions once, while a backtracker revisits them.

Each row of the table is the set of pattern positions still alive after consuming a prefix, which is a simulation of a nondeterministic automaton. A backtracking engine explores alternatives one at a time and recomputes the same pairs of positions without a memo, which on nested repetition is exponential. Python's engine is C code, and features are not the issue; the missing memo is.

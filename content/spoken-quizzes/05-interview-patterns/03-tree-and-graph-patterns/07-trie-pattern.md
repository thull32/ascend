---
lesson: trie-pattern
source: 1ab20b04bf5eea33
---
## 1

After inserting only the word apple, a trie's search for app returns true. What is the bug?

A, the trie compares letters case-sensitively by default. B, search walks one letter too few before checking. C, search checks that the node exists, not its end-of-word flag. D, insert skipped creating the node for the second p.

[think]

The answer is C: search checks that the node exists, not its end flag.

Every prefix of a stored word has a node, so app is reachable even though it is not a stored word. Only the last node of each inserted word carries the end flag, and search must test it. Starts-with is the operation that ignores the flag.

## 2

In Design Add and Search Words, after adding bad, dad and mad, what does a search for the two-character pattern, a wildcard dot followed by a, return?

A, true, only if the words were inserted in sorted order. B, an error, because the dot may only appear as the last character. C, true, because three words match the first two letters. D, false, since it ends on nodes whose end flag is unset.

[think]

The answer is D: false, since it ends on nodes that are not word ends.

The wildcard branches to b, d and m, and each has an a child, but the pattern is exhausted there, and those nodes are not word ends. The end-of-pattern base case must return the node's end flag, not true.

## 3

A trie uses 26-slot arrays for its children, indexed by the character's code minus the code of lowercase a. In Python, after inserting n e a, what does a search for capital T, e, a return?

A, false, since uppercase letters are lowercased first. B, true, because the index minus 13 silently reads the slot for n. C, false, because capital T has no slot, and the walk stops. D, an IndexError, since minus 13 is outside the list.

[think]

The answer is B: true, because index minus 13 reads the slot for n.

Capital T's code minus lowercase a's is minus 13, and Python lists accept negative indices from minus 26 to minus 1, so slot minus 13 is slot 13, the child for n. The walk follows n, e, a, and finds the end flag. The fix is to ask about the alphabet and use dictionary or Map children, or to normalise the input.

## 4

Word Search Two, on an 8 by 8 board of all a's, with ten words: a, then a a, and so on up to ten a's. What most reduces the search work?

A, deleting childless trie nodes once their words are found. B, marking visited cells with a set instead of on the board. C, starting the search only from cells on the board's edge. D, storing each word at its end node to avoid rebuilding strings.

[think]

The answer is A: deleting childless trie nodes once their words are found.

Once all ten words are found and cleared, deleting childless nodes on the way back empties the trie, so every later start cell stops at the root. The lesson measured 83 calls with the deletion, against 1.2 million without it. Storing the word at its node avoids building strings but does not shrink the search, and a visited set changes nothing asymptotically.

## 5

On 19,162 words in CPython, a set of every prefix measured 3.7 megabytes, and a dictionary-based trie 10 megabytes. When is the trie still the right choice?

A, for wildcard search, or for walking a board letter by letter. B, never; the prefix set is smaller and faster in every case. C, only when the words are longer than about 20 characters. D, only when the alphabet has more than 26 characters.

[think]

The answer is A: for wildcard search, or walking a board letter by letter.

A prefix set answers starts-with in one hash lookup and wins on memory. But it cannot branch on a wildcard, cannot carry a position through a search across a board, and needs one lookup per length to find the shortest stored prefix of a word. Those are the operations that justify the trie's cost per node.

## 6

A candidate is asked whether a pattern occurs anywhere inside a long text, and proposes a trie of the text's prefixes. What is wrong?

A, nothing, since a trie of prefixes indexes every substring. B, the text is too long to fit in a trie's hash maps. C, tries index prefixes, and substrings need suffixes, or KMP. D, tries only work when the text is lowercase letters.

[think]

The answer is C: tries index prefixes, and substrings need suffixes or KMP.

Prefix structures answer starts-with questions. A substring is a prefix of some suffix, so substring search needs every suffix indexed, in a suffix array or suffix tree, or a linear-time matcher such as KMP or a rolling hash.

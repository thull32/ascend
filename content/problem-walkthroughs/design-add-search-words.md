---
problem: design-add-search-words
args: [["add_word", "bat"], ["add_word", "dad"], ["search", ".ad"], ["search", "d."]]
frames: 81
source: 6f0e44b4e46ff79d
---
@0-1
We add two words, bat and dad, then run two searches with the wildcard dot, which matches exactly one letter. The structure is a trie: nested maps, one level per letter, with a dollar-sign key marking where a stored word ends. Literal letters follow one branch. The dot is the only new idea, and what it asks for is: try every branch here. So search becomes a depth-first search over the trie, carrying a position in the pattern. The dictionary starts as one empty map, the root.

@2-11
Adding bat walks from the root, creating a child for each letter that is missing: b, then a, then t. At the t, it sets the end marker. The trie now holds the path b, a, t.

@12-21
Adding dad does the same: a new branch d under the root, then a, then d, and the end marker. Two branches now hang off the root, b and d.

@22-28
The first search is dot, a, d. At position zero the pattern has a dot, so we try every child of the root in turn, skipping the end marker, which is not a letter. The first child is b.

@29-40
Inside the b branch, position 1 wants a literal a, and the b node has an a child, so we follow it. Position 2 wants a d, but the only child here is t. There is no d child, so this path fails. False comes back up, all the way to the dot.

@41-47
This is the backtracking. The dot's loop moves on to the next child of the root, d. Inside it, position 1 wants an a, and there is one.

@48-60
Position 2 wants a d, and there is one. Now the position equals the pattern's length, and the node we reached carries the end marker, so a stored word ends exactly here. True. It returns up through each level, and the dot's loop stops at the first success. The search for dot, a, d returns true, matching dad.

@61-72
The second search is d, dot: two characters. The literal d follows the root's d branch. Then the dot tries every child of that node. There is only one, a.

@73-80
Now the pattern is used up: the position equals its length of two. But the node for d, a has no end marker: it is only a prefix of dad, not a stored word. So the answer is false, the loop has no more children to try, and the search returns false. A dot matches exactly one letter, never zero and never two, and running out of pattern on a prefix is not a match. Both are classic bugs.

Adding a word costs its length. A search without dots costs its length too. Each dot multiplies the work by the number of branches at that depth, so the worst case is exponential in the number of dots, though most branches die within a letter or two. That is the follow-up question, and the honest answer is to bound the number of wildcards.

---
problem: word-break
args: ["abcd", ["a", "abc", "b", "cd"]]
frames: 42
source: e81bfc16d706cd73
---
@0
Can a, b, c, d be split into words from a, abc, b and cd? Yes: a, b, cd. But a greedy split that grabs the longest word first takes abc, and then the lone d is not a word: a dead end. The insight: whether the rest of the string can be split does not depend on how you split the part before it. All that matters is the position reached. So we mark each position from zero to four as reachable or not, left to right. A position is reachable when some earlier reachable position is followed by a dictionary word that ends exactly here.

@1-12
The words go into a set for fast lookup, and the longest word has three letters, so we never need to look back further than three.

@13-15
The table has five entries, one per position. Position zero is reachable: the empty prefix splits into zero words. Forgetting that seed makes every entry false.

@16-20
Position 1. Starting at zero, the slice is a, which is a word, and zero is reachable. So position 1 is reachable, and we stop looking.

@21-27
Position 2. From zero, the slice a, b is not a word. From 1, the slice b is a word, and 1 is reachable. So position 2 is reachable.

@28-32
Position 3. From zero, the slice a, b, c is a word. So 3 is reachable, by abc. Notice that nothing will continue from position 3, since d alone is not a word. The table simply records it and moves on. There is no backtracking to undo.

@33-39
Position 4, the end. Looking back at most three letters, we start at 1: b, c, d is not a word. From 2: c, d is a word, and 2 is reachable. So the end is reachable, through a, then b, then cd.

@40-41
We return true.

Each end position looks back at most the longest word length, and each slice costs up to that length to hash, so time is n times L squared, and the table is linear. A trie of the words removes the repeated slicing. The mistakes are greedy matching, longest first or shortest first, which this kind of example defeats; looking words up in a list instead of a set; and leaving out the seed at position zero. Plain recursion without remembering positions is exponential on strings like many a's followed by a b.

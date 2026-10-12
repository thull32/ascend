---
problem: word-search-ii
args: [[["a", "b"], ["c", "d"]], ["abd", "ad"]]
frames: 121
source: f8257b18fa4d1039
---
@0
A two by two board: a, b on top, c, d below. We look for the words abd and ad, moving only up, down, left or right, never reusing a cell. abd is there: a, right to b, down to d. ad is not, because a and d only touch diagonally. Searching for each word separately repeats the same board walks. The insight is to invert the loops: walk the board once, carrying a trie of all the words, and at every step ask the trie which words are still possible. The moment the trie has no child for the current letter, no word continues along this path, and the search stops.

@1-25
First, the trie. abd becomes a, then b, then d, and the d node stores the whole word. ad shares the a node and adds its own d child, which stores ad. Then the search starts from the top left cell.

@26-34
Cell a. The root has an a child, so the path is alive. The a node stores no word. We mark the cell as used with a hash sign and try the neighbours. Above is off the board, so we try below.

@35-39
Below is c. The a node has no c child, so this path dies at once. That single lookup is the pruning that makes the trie worthwhile.

@40-51
To the left is off the board, so we try the right: b. The a node has a b child. No word stops here. Mark b as used and look around: up is off the board, so try down.

@52-60
Down is d, and the b node has a d child, which stores abd. We record it, and pop it out of the node, so the same word can never be reported twice.

@61-75
From d, every neighbour is a dead end: up is b, now marked used, and the left is c, which the trie does not want.

@76-78
We restore d on the board. Now the second kind of pruning: the d node is empty, its word taken and no children left, so it is deleted from its parent.

@79-90
Back at b, the left neighbour is a, marked used, so nothing there. Restore b. The b node is now empty too, so it is deleted.

@91-95
Back at a, restore it. The a node still has its d child, for ad, so it stays. The trie has shrunk to a, then d: only ad remains to be found.

@96-118
The remaining starting cells, b, c and d, each fail the very first lookup, because the root now has only an a child.

@119-120
We return abd. ad was never found: from a, the only way to d is diagonal.

Building the trie costs the total letters in the words. The search is exponential in word length in the worst case, but the trie lookup stops dead paths immediately, and deleting empty nodes shrinks the trie as words are found, which is what keeps boards full of one repeated letter fast. The mistakes are forgetting to restore a cell after exploring from it, reporting a word every time its node is reached, and skipping the leaf deletion, which is still correct but can blow up on repetitive boards.

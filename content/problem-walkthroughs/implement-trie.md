---
problem: implement-trie
args: [["insert", "car"], ["insert", "cat"], ["search", "ca"], ["starts_with", "ca"], ["search", "cat"]]
frames: 88
source: 2f80ddd2a5d5a654
---
@0-4
We will insert two words, car and cat, then ask three questions: is ca a word, does any word start with ca, and is cat a word. The idea is that words sharing a prefix share storage. Each node has a dictionary of children, one per next letter, and a flag saying whether a word ends here. A prefix is then a single path from the root, and walking it costs one step per letter, however many words are stored. The trie starts as one empty root node.

@5-13
Insert car. We start at the root and take the letters one at a time. The root has no child for c, so we create one and step down into it.

@14-27
The c node has no child for a, so we create one and step down. Then the same for r. Three letters, three new nodes, one chain.

@28-29
At the end of the word we set the end flag on the r node. That flag is what says car is a word, rather than just a path that other words pass through.

@30-37
Insert cat. From the root, c already exists, so we step down without creating anything. A also exists. The first two letters cost no new memory: car and cat share them.

@38-46
T does not exist under ca, so we create it and step down, then set its end flag. The tree now branches after ca: one child for r, one for t.

@47-57
Search for ca. Search and starts with share a helper, walk, which follows the string from the root and returns the node it reaches, or none if it falls off the tree. C is there, a is there, so walk returns the a node.

@58-59
Here is the difference that the problem is about. Search requires the end flag on that node, and the a node's flag is false: we only ever set it on r and t. So ca is not a word, and search returns false.

@60-71
Starts with ca runs the same walk and reaches the same node. Starts with only asks whether the walk stayed on the tree, so it returns true. Two words begin with ca.

@72-87
Finally, search for cat. The walk goes c, a, t and returns the t node, whose end flag we set when we inserted cat. Search returns true.

Every operation costs one step per character of its argument, independent of how many words the trie holds. Space is at most the total characters inserted, and less when words overlap, as car and cat did. The classic mistake is letting search return true for any path that exists, which makes it identical to starts with; the end flag is the whole difference. Inserting the same word twice must also be harmless: the walk finds every node and just sets the flag again.

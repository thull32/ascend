---
problem: alien-dictionary
args: [["xz", "yx", "yz", "zy"]]
frames: 75
source: 8cb8fa0f247b1137
---
@0-16
Four words, sorted in an alphabet we do not know: x z, y x, y z, and z y. A sorted dictionary leaks the alphabet one fact at a time, and only between neighbours. Compare two adjacent words, find the first position where they differ, and the letter in the first word comes before the letter in the second. That is all the pair tells you. Each fact is an edge in a graph of letters, and the alphabet is a topological order of that graph. These first lines put every letter that appears into the graph, x, z and y, each with no successors and an in-degree of zero. Seeding every letter matters, because a letter with no constraints must still appear in the answer.

@17-23
First pair: x z and y x. They differ straight away, at position zero: x against y. So x comes before y. We add the edge from x to y and raise y's in-degree to one. Then the break. This is the line the problem is about. The second letters, z and x, look like a fact that z comes before x, but they are not: the comparison was already decided by the first letter. Use them and you invent an edge from z to x, which makes a cycle, and the answer wrongly comes out empty.

@24-32
Second pair: y x and y z. The first letters match, so we move on. The second letters differ: x against z. So x comes before z. Edge from x to z, and z's in-degree becomes one.

@33-39
Third pair: y z and z y. They differ at position zero: y comes before z. Edge from y to z, and z's in-degree rises to two. Now the facts are complete: x has no letters before it, y has one, and z has two.

@40-48
No pair had a word followed by its own prefix, the one invalid case with no differing letter, so we move on to Kahn's algorithm. The queue starts with every letter whose in-degree is zero. That is only x.

@49-59
We take x and append it to the output. Every successor of x loses one from its in-degree. y drops to zero, so it joins the queue. z drops to one, so it still waits for a letter that must come before it.

@60-67
We take y and append it. Its only successor is z, which drops to zero and joins the queue.

@68-72
We take z and append it. It has no successors, and the queue is empty. The output is x, y, z.

@73-74
The last check is the cycle test. If the facts contradicted each other, some letter would never reach zero and the output would be shorter than the letter count. Here all three letters came out, so we return x y z. The cost is one scan over all the characters to build the graph, plus a topological sort over at most 26 letters. Three traps to remember: using more than the first difference in a pair, forgetting the prefix case, where a longer word sits before its own prefix, and dropping letters that no fact mentions.

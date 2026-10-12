---
problem: word-ladder
args: ["lead", "gold", ["load", "goad", "gold", "lend"]]
frames: 152
source: b3671a79bf1034a1
---
@0
From lead to gold, changing one letter at a time, where every step must be a word from the list: load, goad, gold, lend. The shortest ladder is lead, load, goad, gold: four words. Words are nodes, one letter changes are edges, and every step costs the same, so breadth first search finds the shortest ladder. The real problem is finding neighbours quickly. The trick is wildcard patterns: replace each letter in turn with a star, so lead gives star e a d, l star a d, and so on. Two words differ in exactly one letter when they share a pattern. First, the target must be in the list. It is.

@1-45
We index the list once: every word is filed under each of its four patterns. The pattern star o a d, for instance, collects both load and goad.

@46-49
The search starts with lead, marked seen, in the queue, at ladder length one.

@50-60
Expand lead, one pattern at a time. Star e a d has no bucket. l star a d holds load, which is not the target and not seen, so it is marked seen and queued. Each bucket is removed from the index as it is used: every word in it gets visited the first time, so a second look would be wasted work.

@61-74
l e star d holds lend, which joins the queue too. l e a star has nothing. The first level is done: load and lend are one step away, and the length becomes two.

@75-88
Expand load. Its bucket star o a d holds load itself, already seen, and goad, which is new, so goad joins the queue.

@89-105
load's other patterns: l star a d was already used up by lead, so it is gone. l o star d and l o a star hold only load itself.

@106-130
Expand lend. Every one of its buckets holds only lend, or has already been used. A dead end. The second level is done, and the length becomes three.

@131-145
Expand goad, the only word in the third level. star o a d was used up by load, so it is skipped without any work. g star a d holds only goad itself.

@146-151
g o star d holds goad and gold. gold is the target. So the answer is the current length, three, plus one for gold: four words.

Indexing costs the number of words times the word length squared, and each bucket is scanned once, so the search costs the same. The mistakes are returning the number of steps instead of the number of words, forgetting to check that the target is in the list, marking words seen when they are dequeued instead of when they are queued, which lets the same word pile up in the queue, and using a depth first search, which finds a ladder but not the shortest one. Searching from both ends at once, always expanding the smaller frontier, is the standard speed up.

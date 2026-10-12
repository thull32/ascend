---
problem: merge-k-sorted-lists
args: [[{"$list": [1, 4]}, {"$list": [1, 3]}, {"$list": [2]}]]
frames: 44
source: 10b120c29a342eba
---
@0
Three sorted lists: one, four; one, three; and a single two. At any moment, the next node of the answer is the smallest of the current heads, so only three values ever matter. A min-heap holding exactly those heads hands you the smallest in log k time, and every node goes in and out of it once.

@1-10
First we seed the heap with each non-empty head, as a triple: the value, the list's index, and the node. The heap now holds value 1 from list 0, value 1 from list 1, and value 2 from list 2. Notice the two ones. That is why the index is there: when values tie, Python compares the next item in the triple, and the index breaks the tie before it ever tries to compare two nodes, which would crash.

@11-14
Heapify puts the smallest on top. Then a dummy head, and a tail pointer to append to.

@15-20
Pop the smallest: value 1, from list 0, the tie broken by the lower index. We link that node onto the answer and move the tail onto it. It has a successor, the 4, so we push 4 from list 0. The heap is now 1 from list 1, 2, and 4.

@21-26
Pop the other 1, from list 1, and append it. Its successor, the 3, goes into the heap. The answer reads one, one.

@27-31
Pop the 2 from list 2 and append it. List 2 has nothing after it, so nothing is pushed. The heap shrinks to two entries, 3 and 4.

@32-36
Pop the 3 and append it. Its list is finished too.

@37-41
Pop the 4, the last entry, and append it. The heap is empty, so the loop ends.

@42-43
We return the node after the dummy: one, one, two, three, four. The nodes were relinked, not copied. Each of the N nodes costs one push and one pop on a heap of at most k entries, so the time is N log k, with only k entries of extra space. The trap the problem is known for is merging the lists one after another, which revisits the early nodes again and again and costs k times N. And if you push only the value and the node, the first tie, like our two ones, raises a type error.

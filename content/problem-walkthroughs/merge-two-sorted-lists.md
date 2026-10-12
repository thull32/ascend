---
problem: merge-two-sorted-lists
args: [{"$list": [1, 4, 7, 9]}, {"$list": [1, 3]}]
frames: 21
source: 9b7528f3085d3eeb
---
@0
Two sorted lists: one, four, seven, nine; and one, three. The smallest node left anywhere is always one of the two heads, because everything behind a head is at least as large. So one comparison per node decides what comes next. This is the merge step of merge sort, done with pointers. A dummy node gives the answer a place to start, and a tail pointer marks where the next node goes.

@1-2
The tail starts on the dummy. Both lists have nodes, so the loop runs.

@3-7
Both heads are 1. Less than or equal takes from the first list on a tie, which keeps the merge stable: equal values stay in their input order. The tail links to that node, the first list moves on to 4, and the tail steps forward.

@8-12
Now 4 against 1. The second list's 1 is smaller, so it is linked in, and the second list moves on to 3. The answer reads one, one, three for the moment, because that node still points at its old successor.

@13-17
4 against 3: the 3 is smaller and goes next, and the second list is now empty. The loop needs both lists, so it stops.

@18-19
Here is the line that shows you understood the problem. Whatever survives is already sorted, and every value in it is at least as large as everything we have placed. So one assignment attaches the whole remainder, four, seven, nine, without walking it node by node.

@20
We return the node after the dummy: one, one, three, four, seven, nine. Each loop step consumes one node, so time is linear in the total length, and no new nodes are allocated. The common mistake is a separate case for choosing the first node of the answer, which is exactly what the dummy exists to avoid.

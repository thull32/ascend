---
problem: kth-largest-stream
args: [["__init__", 3, [4, 5, 8, 2]], ["add", 3], ["add", 5], ["add", 10], ["add", 9], ["add", 4]]
frames: 54
source: ee72dc4ea5334b2d
---
@0-2
Numbers arrive one at a time, and after each one we report the third largest so far. We start with four, five, eight and two. Here is the insight. Only the three largest values can ever be the answer, and of those three we only need the smallest. That is a min heap of size k: its root is the smallest of the k largest, which is the k-th largest overall. The constructor stores k, three, starts an empty heap, and feeds the starting numbers through add, so there is only one code path.

@3-19
Four, five and eight go in one by one. Each time the heap is not over size three, so nothing is evicted. After eight, the heap holds four, five and eight, and the root is four.

@20-28
Then two. Push first: the heap holds four values with two at the root. That is one too many, so we pop the root. Two is gone, and the root is four again. The order matters. We push first and trim second, so the new value always gets a fair comparison with the current top three.

@29-33
Now the stream proper. Add three. It goes in, it is the smallest of four values, and it is popped straight out. The third largest is still four, and add returns four.

@34-38
Add five. The heap briefly holds four, five, eight and five. The root, four, is popped, and the new root is five. Duplicates count separately: the top three are five, five and eight, so we return five.

@39-43
Add ten. It goes in, and the smallest, five, is evicted. The top three are now five, eight and ten, and the root is five. Return five.

@44-48
Add nine. Push, then pop the other five. The heap is eight, nine and ten, and we return eight.

@49-53
Add four. It is smaller than everything we hold, so it enters at the root and leaves immediately. Still eight.

Each add is one push and at most one pop on a heap of size k plus one, so it costs log k. Space is k, no matter how long the stream runs, which is what makes this a streaming algorithm. The common mistakes: a max heap of everything, which needs k pops per query; and popping before pushing when the heap is full, which can throw away a value that belonged in the top k.

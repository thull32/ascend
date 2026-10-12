---
problem: design-circular-queue
args: [["__init__", 3], ["enqueue", 1], ["enqueue", 2], ["enqueue", 3], ["enqueue", 4], ["rear"], ["is_full"], ["dequeue"], ["enqueue", 4], ["rear"], ["front"]]
frames: 41
source: 098062644dca80c3
---
@0-4
A queue with room for three. A queue grows at one end and shrinks at the other, so its live elements sit in a run of slots that drifts forward through the buffer. The trick is to let that run wrap around: after the last slot comes slot zero again. Then nothing ever has to move. We keep two numbers: head, the slot of the front element, and count, how many elements there are. The buffer is three zeros, head is zero and count is zero.

@5-9
Enqueue 1. The queue is not full. The next free slot is head plus count, wrapped around by the capacity: zero plus zero, so slot zero. We write the 1 there, and the count becomes one.

@10-19
Enqueue 2 goes to slot 1, and enqueue 3 to slot 2. The buffer reads 1, 2, 3, and the count is 3.

@20-22
Enqueue 4. The count equals the capacity, so the queue is full, and we refuse. False. Storing the count makes full and empty easy to tell apart. With only a head and a tail index, a full queue and an empty one look identical.

@23-26
Rear: the last element is at head plus count minus one, wrapped: slot 2, which holds 3. And is full returns true.

@27-31
Dequeue. We do not move anything or even clear the slot. Head simply advances to slot 1, and the count drops to 2. The 1 still sits in slot zero, but it is no longer part of the queue.

@32-36
Now enqueue 4 again, and this is the wrap. The next free slot is head plus count, 1 plus 2, which is 3, and 3 wrapped by a capacity of 3 is slot zero. The 4 overwrites the dead 1. The buffer reads 4, 2, 3, but the queue, starting at head, is 2, 3, 4.

@37-40
Rear is head plus count minus one: 1 plus 3 minus 1 is 3, wrapped to slot zero, which holds 4. Front is the slot at head, slot 1, which holds 2. Every operation is a few arithmetic steps: constant time, with the space fixed when the queue is built.

The bugs to watch: computing the rear without the wrap, which in this state would read past the end of the buffer; forgetting the wrap when writing; and using a list where dequeue removes the first element, which shifts every other element and is linear, not constant.

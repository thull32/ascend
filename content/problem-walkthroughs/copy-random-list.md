---
problem: copy-random-list
args: [[[3, null], [8, 0], [5, 2]]]
prelude: 3
frames: 45
source: 84af23afe196a824
---
@0
Our list is three, then eight, then five. Each node also has a random pointer: three's is null, eight's points back to three, and five's points to itself. We need a deep copy, with every pointer in the copy landing on a copy. The whole problem is one question: given an original node, where is its copy? This solution answers it without a hash map, by parking each copy directly after its original. Then the copy of any node is simply that node's next. On screen, a node shown with only its value has a random pointer set; a node shown with None has a null random.

@1-4
Pass one is the weave. We start at the head, three, and insert a new node holding three between it and eight. The list now reads three, three, eight, five. The new copy's random is still None. Then we jump two steps, past the copy we just made, to the next original.

@5-11
The same for eight and for five. After eight comes a copy of eight, and after five a copy of five, so the list reads three, three, eight, eight, five, five: each original followed by its twin. Jumping two past the last copy finds nothing, and the weave ends.

@12-15
Pass two links the randoms, again stepping over originals only. Three's random is null, so its copy keeps a null random, and we move on.

@16-19
Eight's random is three. Where is the copy of three? Right after three. So the copy of eight gets three's next as its random, and you can see it change: the copy of eight no longer shows None. That one line, the copy's random is the original's random's next, is the reason for the weave.

@20-24
Five's random is five itself. Five's next is its own copy, so the copy of five points to itself, as it should. The copy of five loses its None too, and the pass ends.

@25-31
Pass three unweaves. The copy's head is the node after the original head: the copy of three. Now, for each original, we take its copy, point the original past it, to the next original, and point the copy past that, to the next copy. After the first pair, the original reads three, eight, eight, five, five, and the copy list reads three, eight, five, five. Both are still half woven, and that is fine.

@32-36
Eight and its copy get the same treatment. The original three, eight now leads to the original five, and the copy list reads three, eight, five.

@37-41
The last pair. The copy of five has no next, so the conditional sets its next to None rather than reaching past the end. The original list is back to three, eight, five, exactly as the caller gave it, and the copy is a separate three, eight, five.

@42-44
The loop ends and we return the copy's head. The harness reads it back as three with no random, eight pointing to index zero, and five pointing to index two: the same list, built entirely from new nodes. Three linear passes make it linear time, and apart from the copies themselves, which are the answer, it uses constant extra space. The price is that it temporarily rewires the input. Two mistakes to avoid: setting a copy's random to the original's random, which looks right but points back into the original list; and unweaving before the random pass is finished, because then an original's next is no longer its copy.

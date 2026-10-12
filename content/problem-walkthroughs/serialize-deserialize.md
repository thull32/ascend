---
problem: serialize-deserialize
args: [{"$tree": [1, null, 2]}]
frames: 57
source: 0f50fb0218a31a97
---
@0
The tree is a root, 1, with no left child and a right child, 2. We turn it into a string and back, and must get exactly this shape. Listing the values alone fails: 1, 2 could just as well be 2 on the left. Shape is lost because a missing child leaves no trace. So we write a marker, a hash sign, wherever a child is missing. Then the decoder always knows whether the next token is a node or a gap. The round trip calls the encoder first, then feeds its string to the decoder.

@1-4
Encoding is a breadth first walk whose queue also holds the empty children. The tree is not empty, so we start with an empty output and the root in the queue.

@5-10
Pop 1. It is a real node, so its value goes out, and both children are queued, even the missing left one. The queue now holds an empty slot, then node 2.

@11-15
Pop the empty slot. We write a hash for it, and skip the rest of the loop body: a gap has no children to queue. The output reads 1, hash.

@16-21
Pop 2. Its value goes out, and its two missing children are queued as two empty slots. The output reads 1, hash, 2.

@22-31
The two empty slots each write a hash and queue nothing. The queue is now empty.

@32-33
The tokens are joined with commas: 1, hash, 2, hash, hash. Five tokens for two nodes: every missing child is accounted for.

@34-39
Now the decoder, the mirror of the encoder. It splits the string into tokens and builds the root from the first one, 1. A queue holds nodes waiting for their children, starting with the root, and i points at the next unread token, position 1.

@40-42
Pop parent 1. Every parent consumes exactly two tokens, left then right. Its left token is a hash, so no left child is created. i moves to 2.

@43-47
Its right token is 2, so we create node 2 as the right child and queue it, since it will need children of its own. i moves to 3.

@48-52
Pop parent 2. Its left token is a hash and its right token is a hash, so it gets no children. i moves to 5, the end of the tokens.

@53-56
The queue is empty, and we return the root: 1, with 2 on its right. The same shape we started with.

Both directions touch each node once, so time is linear, and the queue holds at most one level. The string has at most about three tokens per node. The mistakes are leaving out the markers, running numbers together without a separator, which breaks on negatives and multi digit values, and letting the encoder and decoder disagree about whether a gap gets children. The empty tree must round trip to nothing, not to a node holding zero.

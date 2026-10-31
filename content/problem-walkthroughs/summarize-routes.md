---
problem: summarize-routes
args: [["10.0.0.200/26", "10.0.0.0/25", "10.0.0.128/26"]]
frames: 106
source: 7bf44618445aa516
---
@0
Three prefixes, given out of order: 10 dot 0 dot 0 dot 200 slash 26, 10 dot 0 dot 0 dot 0 slash 25, and 10 dot 0 dot 0 dot 128 slash 26. Together they cover one whole slash 24. The insight that makes this easy is that two prefixes never partly overlap: they are either nested or disjoint. So once the blocks are sorted by address, a stack sweep, like merging intervals, can drop covered blocks and join siblings in one pass. Siblings are the two halves of one parent.

@1-5
First, parsing. The first prefix splits into an address and a length of 26. A slash 26 leaves six host bits free, so the block holds 2 to the 6, which is 64 addresses.

@6-18
The helper turns the dotted address into one 32-bit number: it reads the four bytes and shifts each into place, the first byte highest. The numbers on screen are around 168 million, so from here on I will read them as offsets from 10 dot 0 dot 0 dot 0. This address is offset 200.

@19
Back in the loop, the start is divided by the block size, 64, and multiplied back. That clears the host bits: 200 becomes 192. The block it names runs from dot 192 to dot 255.

@20-55
The other two prefixes parse the same way. Dot 0 slash 25 is a block of 128 addresses starting at offset 0, already aligned. Dot 128 slash 26 is 64 addresses at offset 128, also aligned.

@56-57
Now the sort. By address, shorter first on a tie, so a covering block comes before anything inside it. The order is now 0 slash 25, 128 slash 26, 192 slash 26.

@58-61
The sweep starts with an empty stack. The first block, 0 slash 25, has nothing to compare against, so it is pushed.

@62-71
Next, 128 slash 26. The top of the stack, 0 slash 25, covers offsets 0 to 127. 128 is not below 128, so the new block is not covered, and it is pushed. Now the merge loop has two entries, but their lengths differ, 25 and 26, so they cannot be halves of one parent. The loop breaks.

@72-77
Then 192 slash 26. The top is 128 slash 26, which covers 128 to 191. 192 is outside, so it is pushed.

@78-82
Here is the interesting step. The top two are 128 slash 26 and 192 slash 26. Same length. The size is 64, so the left one must start on a multiple of 128, and it does. The right one must start at 128 plus 64, which is 192, and it does. They are siblings. The right one is popped and the left one becomes its parent, 128 slash 25: same start, one bit shorter.

@83-88
And the loop runs again, because that merge created a new pair. The top two are now 0 slash 25 and 128 slash 25. Same length, size 128. The left one starts at 0, a multiple of 256, and the right one starts at 0 plus 128. Siblings again, so they merge into 0 slash 24. A single if instead of a while would have stopped one level short and returned two routes.

@89-90
One entry is left, so the merge loop stops, and there are no more blocks to sweep.

@91-105
Last, formatting. The helper shifts each byte back out and masks it to eight bits, giving 10 dot 0 dot 0 dot 0, and the length is appended. The answer is one route: 10 dot 0 dot 0 dot 0 slash 24, the same 256 addresses as the inputs.

Parsing is linear, the sort is n log n, and the sweep is linear overall, because every block is pushed once and every merge removes an entry. The classic mistake is merging blocks that are merely adjacent: 10 dot 254 dot 1 dot 0 slash 24 and 10 dot 254 dot 2 dot 0 slash 24 touch, but the first does not start on a multiple of two blocks, so they are not siblings and no single prefix covers just them. Check alignment, not contiguity. The others: no cascade, unmasked host bits, and sorting strings instead of numbers.

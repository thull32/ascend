---
problem: ip-in-subnet
args: ["10.254.19.9/20", ["10.254.31.255", "10.254.32.0"]]
frames: 47
source: bc5d76ef02c3ccdb
---
@0
The block is 10 dot 254 dot 19 dot 9 slash 20, and we test two addresses against it: 10 dot 254 dot 31 dot 255, and 10 dot 254 dot 32 dot 0. The block is written with host bits set, and a slash 20 ends four bits into the third octet, so no string prefix can answer it. The insight is to stop thinking in octets. An address is one 32 bit number, and membership in a slash L block depends only on its top L bits. Keep those bits with one AND against a mask, and compare. The first line splits the text at the slash.

@1-2
The block's address is the text before the slash, and the length, still the string 20, becomes the number 20. Now the mask: all ones, shifted left by 32 minus 20, which is 12, then cut back to 32 bits. That leaves 20 ones followed by 12 zeros.

@3
The variables panel shows the mask in decimal, about 4.29 billion. Written as a dotted quad it is 255 dot 255 dot 240 dot 0. That 240 is the interesting byte: one, one, one, one, then four zeros. The boundary falls inside the third octet. Next we compute the block's network.

@4-14
The helper splits the block's address at the dots and turns each piece into a number: 10, 254, 19 and 9.

@15-16
Then it shifts each byte into place. The first goes up 24 bits, the second 16, the third 8, and the last stays put, and OR glues them into one number, about 184 million.

@17
Back in the main function, that number has been ANDed with the mask, and the network is 10 dot 254 dot 16 dot 0. Look at what happened to the 19. In binary it is zero, zero, zero, one, then zero, zero, one, one. The mask keeps its top four bits, zero, zero, zero, one, which is 16, and erases the rest, along with the 9 in the last byte. This is the step people forget. Without it, the network would still carry host bits, and no address would ever match it, not even 10 dot 254 dot 19 dot 9 itself. Now the comprehension starts on the addresses.

@18-30
The first address, 10 dot 254 dot 31 dot 255, goes through the same helper: four pieces, four shifts, one number.

@31
We AND it with the mask. The third octet is 31, which is zero, zero, zero, one, then four ones. The mask keeps zero, zero, zero, one: 16 again. The last byte, 255, is erased entirely. So it masks to 10 dot 254 dot 16 dot 0, which equals the network. True. This is the last address in the block, its broadcast address, and it is a member.

@32-44
The second address, 10 dot 254 dot 32 dot 0. The helper turns it into a number exactly one larger than the address before it.

@45
Yet the mask treats them differently. 32 is zero, zero, one, then five zeros. Its top four bits are zero, zero, one, zero, which is 32, not 16. So it masks to 10 dot 254 dot 32 dot 0, the start of the next slash 20, and the comparison is false. One step on the number line crossed the block's edge.

@46
The function returns true, then false. That matches the arithmetic by hand: a slash 20 holds 4,096 addresses, so the block starting at 10 dot 254 dot 16 dot 0 runs to 10 dot 254 dot 31 dot 255, and 32 dot 0 is the first address past it.

The cost: building the mask and the network is constant work, and each address is a fixed length parse, one AND and one compare, so the whole call is linear in the number of addresses, with nothing extra beyond the output list. The mistakes this problem is known for are the ones this trace avoided: comparing string prefixes, which cannot express a boundary inside an octet; forgetting to mask the block's own address; and, in JavaScript or C, building the slash zero mask with a 32 bit shift, which does not give zero.

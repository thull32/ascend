---
lesson: amortized-analysis
source: b300221c2339fa47
---
## 1

A dynamic array grows by adding a fixed 64 slots whenever it is full. What is the amortised cost of an append?

A, order 64, because 64 appends share each copy. B, order log n, because resizes get rarer as n grows. C, order n, since the copies add up to order n squared overall. D, constant, because each resize adds a constant 64 slots.

[think]

The answer is C: order n, since the copies add up to order n squared overall.

With additive growth, a resize happens every 64 pushes and copies everything so far: 64, plus 128, plus 192, and so on, about n squared over 128 in total, so order n per push. A constant increment is not what makes appends cheap. Only multiplicative growth turns the copies into a geometric series bounded by a constant times n, and only then do resizes get rarer.

## 2

Which statement correctly distinguishes amortised analysis from average-case analysis?

A, amortised assumes uniformly random inputs; average case assumes worst-case ones. B, average case bounds the total cost; amortised bounds each single operation. C, amortised holds for every sequence; average case assumes a distribution of inputs. D, they are the same idea: the typical cost per operation over a long run.

[think]

The answer is C: amortised holds for every sequence; average case assumes a distribution of inputs.

Amortised analysis says that for every possible sequence of m operations, the total is at most m times some constant. There is no randomness in it, so it is not about typical inputs. Average case needs a probability distribution, and adversarial inputs can break it. Amortised bounds cannot be broken that way.

## 3

A Python service inserts events into a dict on the request path. Its 99th percentile latency shows pauses at roughly 2,730, 5,461, 10,922 and 21,845 inserts, each about twice as long as the last. What is happening, and what is the cheapest fix?

A, the dict resizes at two thirds full: move growth off the request path, or shard. B, hash collisions are piling up: switch to a stronger hash function. C, garbage collection generations are promoting: raise the youngest generation's threshold. D, the key objects are growing in size: intern the keys before inserting.

[think]

The answer is A: the dict resizes at two thirds full, so move growth off the request path, or shard.

CPython resizes a dict when it reaches two thirds of its slot count, so the pauses land at two thirds of 4,096, two thirds of 8,192, and so on, and each rehash touches twice as many entries as the last. Collisions would slow every insert, not specific ones, and garbage collection pauses would not track powers of two. Pre-warming the dict, sharding it, or using a store that rehashes incrementally removes the spikes.

## 4

You implement shrink-on-pop by halving the capacity whenever the size drops to half the capacity. Why is this wrong?

A, it frees memory too slowly, so peak usage stays doubled. B, halving the capacity can drop elements that are still stored. C, alternating push and pop at half full copies the whole array every time. D, it is fine: it mirrors the doubling rule exactly.

[think]

The answer is C: alternating push and pop at half full copies the whole array every time.

At exactly half full, a push doubles the array, copying everything, and the next pop halves it, copying everything again, so the amortised cost degrades to order n. Mirroring the growth rule is exactly the trap. Shrinking at one quarter full instead guarantees a linear number of cheap operations between resizes.

## 5

Java's array list and V8's arrays grow by about one and a half times when full, while Rust's vector doubles. What is the standard argument for the smaller factor?

A, one and a half keeps the amortised cost constant, while doubling makes it log n. B, one and a half is the largest factor that keeps the amortised copies under one per element. C, doubling is required for SIMD alignment, which Java and V8 do not use. D, below the golden ratio, freed blocks can be reused for the next allocation; doubling trades that for fewer copies.

[think]

The answer is D: below the golden ratio, freed blocks can be reused for the next allocation; doubling trades that for fewer copies.

Both factors give amortised constant-time appends. With doubling, the blocks freed so far always add up to one less than the next request, so they can never be reused for it. With a factor below about 1.618, the freed blocks eventually add up to more than the next request. Doubling copies each element at most twice; one and a half, at most three times. Alignment has nothing to do with it.

## 6

A queue is implemented with two stacks. A single pop can move n elements from the input stack to the output stack. What is the amortised cost of a pop, and why?

A, order n, because one pop may move all n elements. B, constant, since each element crosses over at most once. C, order log n, because the input stack halves on each move. D, constant, but only when pushes and pops strictly alternate.

[think]

The answer is B: constant, since each element crosses over at most once.

Charge the future move to the push: each element is pushed once, moved once, and popped once. Any sequence of m operations does at most 3 m stack operations, so the occasional expensive pop is paid for in advance. The bound holds for every sequence, not only alternating ones.

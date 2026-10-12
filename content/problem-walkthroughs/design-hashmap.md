---
problem: design-hashmap
args: [["put", 1, 10], ["put", 17, 20], ["get", 17], ["remove", 1], ["get", 1]]
frames: 63
source: 60e40f796adb4d56
---
@0-19
A hash map is an array of buckets plus a function that turns a key into a bucket number. Here the function is the key modulo the number of buckets. Two keys can land in the same bucket, a collision, so each bucket is a short list of key and value pairs, called a chain. We start with 16 empty buckets. This example is chosen to collide: keys 1 and 17 both leave a remainder of 1 when divided by 16.

@20-27
Put key 1 with value 10. One modulo 16 is 1, so we look in bucket 1. It is empty, so no existing pair has this key, and we append the pair 1, 10. The size becomes one. Then the resize check: we double the buckets once the size passes three quarters of the capacity, which would be 12 here. One is far below, so nothing happens. That load factor is what keeps chains short.

@28-37
Put key 17 with value 20. Seventeen modulo 16 is also 1: a collision. We walk bucket 1's chain looking for key 17, so we can overwrite it if it is already there. The only pair has key 1, not 17, so we append. Bucket 1 now holds two pairs, 1 then 17, and the size is 2.

@38-45
Get key 17. Bucket 1 again. The first pair has key 1, not a match. The second has key 17, so we return its value, 20. This is why a chain stores keys, not just values: the bucket alone cannot tell you which key you are looking at.

@46-55
Remove key 1. In bucket 1, the first pair matches. Rather than deleting from the middle of the list and shifting everything after it, we copy the last pair into the hole, then drop the last slot. For a moment the bucket holds 17, 20 twice; then the pop leaves just one. Order inside a bucket does not matter, so this swap is free. The size drops to one.

@56-62
Get key 1. Bucket 1 holds only the pair for 17, so the loop finds no match and we return minus 1, meaning absent.

With the load factor below three quarters, the average chain is shorter than one pair, so put, get and remove are constant time on average. A resize copies everything, which is linear, but it only happens after the size has doubled, so it averages out to constant per put.

The mistakes: never resizing, so a large map degrades into long chains and linear lookups; using a value like zero to mean empty, when zero is a legal value; and forgetting to check for an existing key on put, which stores two entries for one key.

---
problem: time-based-kv
args: [["set", "q", "alpha", 5], ["set", "q", "beta", 10], ["get", "q", 9], ["get", "q", 10], ["get", "q", 4], ["get", "z", 7]]
frames: 27
source: 3839c5530b2b72c9
---
@0
A key value store that remembers history. We write alpha to key q at time 5 and beta at time 10, then ask for q at times 9, 10 and 4, and for a key that was never written. A read at time t wants the value from the latest write at or before t. The problem hands us a gift: timestamps for a key only ever increase. So appending keeps each key's history sorted for free, and every read is one binary search for the rightmost timestamp at or before t. Each key gets two parallel lists, one of timestamps and one of values.

@1-2
The constructor creates the two maps, both empty.

@3-8
The first write appends 5 to q's timestamps and alpha to its values. The second appends 10 and beta. q's timestamps now read 5, 10. Both writes cost constant time.

@9-13
Read q at time 9. The key exists. bisect right counts how many timestamps are at most 9: just one, the 5. So i is 1, and the answer sits one before it, at position zero: alpha. The write at 10 is in the future from time 9, so it is invisible.

@14-18
Read q at exactly time 10. This is the case that decides which bisect you use. bisect right counts timestamps at most 10, which includes the 10 itself, so i is 2, and we return position 1: beta. bisect left would stop before the equal timestamp, return 1, and hand back alpha, the previous version. Wrong.

@19-23
Read q at time 4. No write is that early, so the count is zero, and we return the empty string.

@24-26
Read key z, which was never written. The first check catches it, and we return the empty string straight away.

Writes are amortised constant time, and reads are log of the number of versions for that key, with space for every write. The mistakes are using bisect left, which misses an exact match; bisecting a list of pairs, which works only by accident of how values compare; and returning nothing instead of the empty string. If timestamps could arrive out of order, appending would break the sort, and you would need a sorted container or a tree. This is a tiny version of multi version concurrency control in a database.

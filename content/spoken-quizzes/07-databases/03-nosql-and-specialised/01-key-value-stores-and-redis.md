---
lesson: key-value-stores-and-redis
source: d9b14600460b9aaa
---
## 1

A service's 99th percentile latency to Redis jumps from 0.3 milliseconds to 40 milliseconds every night at two in the morning. CPU on the Redis host is low. What is the most likely cause?

A, a scheduled job running one command whose cost grows with the data, such as keys or set members. B, the client connection pool being exhausted by nightly batch traffic. C, a snapshot filling the disk, so each write waits for space. D, the backup job saturating the network between the clients and Redis.

[think]

The answer is A: a scheduled job running one command whose cost grows with the data.

Redis executes commands one at a time on a single thread, so one slow command blocks the event loop and delays everyone behind it. And one busy core barely registers as host CPU. The slow log names the command. Pool exhaustion would show up as client-side timeouts, not a server-side stall that lines up with a job.

## 2

Redis runs with the append-only file on, and fsync every second. The out-of-memory killer terminates the process, while the host and its disk are fine. After the restart, what has been lost?

A, only the keys that carried a TTL at the moment the process was killed. B, roughly the last second of acknowledged writes, since fsync runs once a second. C, nothing acknowledged, since replies are sent after the append-only file write. D, every write made since the last completed snapshot.

[think]

The answer is C: nothing acknowledged, since replies are sent after the write to the file.

Redis writes the AOF buffer to the file before sending replies, so every acknowledged write is at least in the kernel's page cache, which survives a process crash. Fsync only matters when the kernel or the power fails, and then the every-second setting loses about a second. The snapshot is irrelevant when the append-only file is newer.

## 3

A nightly report reads every product key once. The next morning, the hit rate for hot product pages has collapsed. Which change fixes this with the least effort?

A, switch the eviction policy from all-keys LRU to all-keys LFU. B, point the report at Postgres directly, so it bypasses the cache. C, switch the eviction policy from all-keys LRU to volatile TTL. D, increase the memory limit, so the report's keys fit alongside the hot ones.

[think]

The answer is A: switch from LRU to LFU.

Under LRU, every key the scan touched becomes more recent than the hot keys, so the hot keys are evicted. LFU's logarithmic counter moves a cold key from 5 to 6 on one touch, while hot keys sit at 18 or more, so they survive. Moving the report also works, but it is a bigger change. More memory only delays the effect, and volatile TTL evicts by expiry, not by use.

## 4

In Redis Cluster, a MULTI block that touches order 1 and order 2 for customer 42 fails with a cross-slot error. Which key design fixes it without creating a hot spot?

A, retry the MULTI block on each node until one of them accepts it. B, put the word orders in braces at the front of both keys, so all orders share a slot. C, put customer 42 in braces at the front of both keys, followed by order 1 and order 2. D, wrap the two commands in a Lua script, which runs atomically.

[think]

The answer is C: put the customer in braces, so the tag is per customer.

Only the text inside the first pair of braces is hashed, so tagging by customer puts one customer's keys in one slot, while different customers still spread across the cluster. Tagging by type puts every order in the system in one slot, slot 105, on one node. A Lua script has the same single-slot rule, and no node accepts keys it does not own.

## 5

A Redis hash grows from 512 to 513 short fields, and its reported memory usage jumps about fivefold. Deleting 120 fields later does not bring it back down. Why?

A, deleted fields become tombstones until the next snapshot is taken. B, the field names became raw strings once the hash passed 512 entries. C, jemalloc keeps the freed pages reserved for this key until a restart. D, it crossed the listpack entry limit and became a hashtable, a one-way conversion.

[think]

The answer is D: it crossed the listpack limit and became a hashtable, one way.

At 513 fields, the listpack, one contiguous block at about 13 bytes per short field, converts to a hashtable, with an entry and two strings per field, roughly 70 bytes. Hashes do not convert back while the server runs; a restart re-encodes values that fit when the snapshot is loaded. Redis has no tombstones for hash fields.

## 6

A 30 gibibyte Redis on a host with 48 gibibytes is killed for running out of memory during a background save, under steady random writes. Transparent huge pages are enabled. What is happening?

A, copy-on-write copies 2 mebibyte pages, so nearly all 30 gibibytes is duplicated. B, fork copies all memory up front, so a snapshot always needs twice the RAM. C, snapshot compression buffers the entire snapshot in memory before writing it. D, the child process loads a second full copy of the dataset before writing.

[think]

The answer is A: copy-on-write copies 2 mebibyte pages, so nearly everything is duplicated.

Fork copies page tables, not data, and a page is copied only when the parent writes to it. With 4 kibibyte pages, 2 million random writes touch about 1.8 million of 7.9 million pages, roughly 7 gibibytes. With 2 mebibyte huge pages there are only 15,360 pages, and the same writes touch all of them, so the copy approaches the whole dataset. Disable transparent huge pages, and keep headroom.

---
problem: mac-learning-switch
args: [["__init__", [[1, [1]], [2, [1]], [3, [1]]], 10], ["receive", 0, 1, 1, "00:00:5e:00:53:0a", "00:00:5e:00:53:0b"], ["receive", 4, 2, 1, "00:00:5e:00:53:0b", "00:00:5e:00:53:0a"], ["table_size", 12]]
frames: 81
source: e3b0ef7607b00e47
---
@0-23
A switch with three ports, all in VLAN 1, and an aging time of ten seconds. It learns which port each sender is behind, forwards to known destinations, floods unknown ones, and forgets any host it has not heard from in more than ten seconds. The insight that makes forgetting cheap: time never goes backwards, and every learn stamps an entry with the current second. So if the table keeps its entries in the order they were last touched, it is also sorted by age, oldest first, and the expired entries are always at the front. That is the LRU cache structure, evicting by age instead of by size. The constructor records which VLANs each port carries, and for each VLAN its member ports in ascending order: VLAN 1 has ports one, two and three. The table starts as an empty ordered dictionary, keyed by the pair of VLAN and address.

@24-27
At second zero, host A, on port one, sends a frame to host B. First the drop checks. Port one carries VLAN 1, so the frame is valid there. Then the source: the lowest bit of the first byte marks a group address, and A's first byte is zero, so A is an ordinary single host.

@28-31
Expire anything old. The table is empty, so the loop does nothing.

@32-34
Learn. The key is VLAN 1 and host A, and the value is port one, last seen at second zero. Moving the key to the end keeps the order by last seen; for a brand new key it is already there.

@35-39
Now the destination. B is not a group address, so we look it up in VLAN 1. There is no entry: B has never spoken.

@40-46
Unknown unicast is flooded: every port in VLAN 1 except the one it came in on. The filter skips port one and keeps two and three. Receive returns ports two and three.

@47-50
At second four, host B, on port two, replies to A. Port two carries VLAN 1, and B's address is not a group address, so the frame is valid.

@51-57
Expire. The front of the table is A, last seen at zero, so it is four seconds old. Four is within ten, so we stop. This is the whole point: we looked at one entry, the oldest, and because it is live, everything behind it must be live too.

@58-60
Learn B on port two at second four. It goes at the end, so the table now reads A at zero, then B at four: oldest first, exactly as promised.

@61-67
A is not a group address, and the table has it on port one. That is not the port the frame came in on, so there is nothing to filter. Receive forwards to port one alone. One reply has taught the switch where both hosts are.

@68-73
At second twelve, someone asks how many entries are live. Expire first. The front is A, last seen at zero: twelve seconds old, more than ten. A is expired, so we pop it from the front.

@74-78
The new front is B, last seen at four: eight seconds old, within ten. We stop. Had there been a thousand entries behind B, we would never have touched them.

@79-80
The table holds one live entry, so table size returns one.

Each entry is pushed once per learn and popped at most once, so the expiry work over all calls adds up to the number of learns: every call is constant time on average, plus the flood list, which is the size of the answer. The classic mistakes: keying the table by address alone, which leaks traffic between VLANs; writing a new timestamp onto an existing key without moving it to the end, so a refreshed entry sits at the front and blocks the dead ones behind it; flooding back out of the ingress port; and expiring an entry at exactly ten seconds old, when it is still live until it is older than ten.

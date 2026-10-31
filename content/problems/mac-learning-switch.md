---
slug: mac-learning-switch
title: MAC Learning Switch
difficulty: medium
patterns: [design]
lists: [network-practice, ascend-150]
companies: [cisco, arista, juniper, nvidia]
order: 9
lesson: fabric-networking/from-zero/switches-vlans-and-loops
hints:
  - "Write the rules down before choosing a data structure: drop invalid frames, learn the source, then decide by the destination (flood, forward or filter). Key the table by the pair (VLAN, MAC), not by the MAC alone: each VLAN is a separate switch with its own table."
  - "Expiry can be lazy: an entry older than `aging` is treated as absent. That makes `receive` and `lookup` easy, but `table_size` must count only live entries, and scanning the whole table on every call is O(n) per call."
  - "Time never goes backwards, so a learn or refresh always gives an entry the newest timestamp in the table. Keep the entries in last-seen order (an ordered dict where a refresh moves the key to the end, exactly as in an LRU cache) and pop from the front while the oldest entry is expired."
signatures:
  python:
    name: LearningSwitch
    starter: |
      class LearningSwitch:
          def __init__(self, ports: list, aging: int):
              pass

          def receive(self, time: int, port: int, vlan: int, src: str, dst: str) -> list[int]:
              pass

          def lookup(self, time: int, vlan: int, mac: str) -> int:
              pass

          def table_size(self, time: int) -> int:
              pass
  javascript:
    name: LearningSwitch
    starter: |
      class LearningSwitch {
        constructor(ports, aging) {
        }
        receive(time, port, vlan, src, dst) {
        }
        lookup(time, vlan, mac) {
        }
        table_size(time) {
        }
      }
tests:
  - args: [["__init__", [[1, [100]], [2, [100]], [3, [100]], [4, [100]]], 300], ["receive", 0, 1, 100, "00:00:5e:00:53:0a", "00:00:5e:00:53:0e"], ["receive", 0, 3, 100, "00:00:5e:00:53:0e", "00:00:5e:00:53:0a"], ["receive", 1, 1, 100, "00:00:5e:00:53:0a", "00:00:5e:00:53:0e"], ["receive", 5, 4, 100, "00:00:5e:00:53:10", "ff:ff:ff:ff:ff:ff"], ["lookup", 5, 100, "00:00:5e:00:53:10"], ["receive", 290, 3, 100, "00:00:5e:00:53:0e", "00:00:5e:00:53:0a"], ["table_size", 290], ["table_size", 306], ["receive", 340, 1, 100, "00:00:5e:00:53:0a", "00:00:5e:00:53:10"], ["lookup", 340, 100, "00:00:5e:00:53:0d"]]
    expected: [null, [2, 3, 4], [1], [3], [1, 2, 3], 4, [1], 3, 1, [2, 3, 4], -1]
    label: "the leaf1.ams trace: flood, learn, forward, age out"
  - args: [["__init__", [[1, [100]], [2, [100]], [5, [200]], [6, [200]], [49, [100, 200]]], 300], ["receive", 0, 1, 100, "00:00:5e:00:53:0a", "ff:ff:ff:ff:ff:ff"], ["receive", 0, 5, 200, "00:00:5e:00:53:14", "ff:ff:ff:ff:ff:ff"], ["receive", 1, 49, 200, "00:00:5e:00:53:15", "00:00:5e:00:53:14"], ["receive", 2, 6, 200, "00:00:5e:00:53:16", "00:00:5e:00:53:15"], ["receive", 3, 2, 100, "00:00:5e:00:53:0b", "00:00:5e:00:53:14"], ["lookup", 3, 200, "00:00:5e:00:53:0a"], ["table_size", 3]]
    expected: [null, [2, 49], [6, 49], [5], [49], [1, 49], -1, 5]
    label: "two VLANs and a trunk port: separate tables, separate floods"
  - args: [["__init__", [[1, [10]], [2, [10]], [3, [10]]], 300], ["receive", 0, 1, 10, "00:00:5e:00:53:01", "00:00:5e:00:53:02"], ["receive", 0, 1, 10, "00:00:5e:00:53:02", "00:00:5e:00:53:01"], ["receive", 1, 2, 10, "00:00:5e:00:53:03", "00:00:5e:00:53:02"], ["lookup", 1, 10, "00:00:5e:00:53:02"]]
    expected: [null, [2, 3], [], [1], 1]
    label: "destination behind the ingress port is filtered"
  - args: [["__init__", [[1, [1]], [2, [1]], [3, [1]]], 10], ["receive", 0, 1, 1, "00:00:5e:00:53:01", "ff:ff:ff:ff:ff:ff"], ["receive", 10, 2, 1, "00:00:5e:00:53:02", "00:00:5e:00:53:01"], ["table_size", 10], ["lookup", 11, 1, "00:00:5e:00:53:01"], ["receive", 21, 3, 1, "00:00:5e:00:53:03", "00:00:5e:00:53:01"], ["table_size", 21], ["table_size", 32]]
    expected: [null, [2, 3], [1], 2, -1, [1, 2], 1, 0]
    label: "aging boundary: exactly aging seconds old is still valid"
  - args: [["__init__", [[1, [1]], [2, [1]], [3, [1]]], 300], ["receive", 0, 1, 1, "00:00:5e:00:53:01", "ff:ff:ff:ff:ff:ff"], ["receive", 5, 2, 1, "00:00:5e:00:53:02", "00:00:5e:00:53:01"], ["receive", 6, 3, 1, "00:00:5e:00:53:01", "00:00:5e:00:53:02"], ["lookup", 6, 1, "00:00:5e:00:53:01"], ["receive", 7, 2, 1, "00:00:5e:00:53:02", "00:00:5e:00:53:01"], ["table_size", 7]]
    expected: [null, [2, 3], [1], [2], 3, [3], 2]
    hidden: true
    label: "a host moves to another port"
  - args: [["__init__", [[1, [100]], [2, [100]], [3, [200]], [49, [100, 200]]], 300], ["receive", 0, 3, 100, "00:00:5e:00:53:31", "ff:ff:ff:ff:ff:ff"], ["receive", 0, 7, 100, "00:00:5e:00:53:32", "ff:ff:ff:ff:ff:ff"], ["lookup", 0, 100, "00:00:5e:00:53:31"], ["table_size", 0], ["receive", 1, 49, 300, "00:00:5e:00:53:33", "ff:ff:ff:ff:ff:ff"], ["receive", 2, 3, 200, "00:00:5e:00:53:34", "00:00:5e:00:53:31"], ["table_size", 2]]
    expected: [null, [], [], -1, 0, [], [49], 1]
    hidden: true
    label: "frames on a port outside their VLAN, or an unknown port, are dropped unlearned"
  - args: [["__init__", [[1, [1]], [2, [1]], [3, [1]]], 300], ["receive", 0, 1, 1, "00:00:5e:00:53:01", "01:00:5e:00:00:fb"], ["receive", 1, 2, 1, "00:00:5e:00:53:02", "33:33:00:00:00:01"], ["receive", 2, 3, 1, "01:00:5e:00:00:fb", "00:00:5e:00:53:01"], ["receive", 3, 3, 1, "ff:ff:ff:ff:ff:ff", "00:00:5e:00:53:02"], ["table_size", 3], ["receive", 4, 3, 1, "00:00:5e:00:53:03", "00:00:5e:00:53:01"], ["lookup", 4, 1, "01:00:5e:00:00:fb"]]
    expected: [null, [2, 3], [1, 3], [], [], 2, [1], -1]
    hidden: true
    label: "multicast is flooded; a group source address is invalid"
  - args: [["__init__", [[1, [100]], [2, [200]], [3, [100]], [4, [200]], [49, [100, 200]]], 50], ["receive", 0, 1, 100, "00:00:5e:00:53:0a", "ff:ff:ff:ff:ff:ff"], ["receive", 30, 2, 200, "00:00:5e:00:53:0a", "ff:ff:ff:ff:ff:ff"], ["table_size", 30], ["receive", 31, 3, 100, "00:00:5e:00:53:0c", "00:00:5e:00:53:0a"], ["receive", 32, 4, 200, "00:00:5e:00:53:0d", "00:00:5e:00:53:0a"], ["lookup", 60, 100, "00:00:5e:00:53:0a"], ["lookup", 60, 200, "00:00:5e:00:53:0a"], ["receive", 80, 49, 200, "00:00:5e:00:53:0e", "00:00:5e:00:53:0a"], ["receive", 81, 49, 100, "00:00:5e:00:53:0e", "00:00:5e:00:53:0a"], ["table_size", 81]]
    expected: [null, [3, 49], [4, 49], 2, [1], [2], -1, 2, [2], [1, 3], 4]
    hidden: true
    label: "the same MAC in two VLANs is two independent entries"
  - args: [["__init__", [[1, [100]], [2, [100]], [9, [999]]], 100], ["table_size", 0], ["receive", 0, 1, 100, "00:00:5e:00:53:01", "00:00:5e:00:53:02"], ["receive", 1, 2, 100, "00:00:5e:00:53:02", "00:00:5e:00:53:01"], ["receive", 90, 1, 100, "00:00:5e:00:53:01", "00:00:5e:00:53:02"], ["receive", 150, 2, 100, "00:00:5e:00:53:03", "00:00:5e:00:53:01"], ["table_size", 150], ["receive", 150, 1, 100, "00:00:5e:00:53:04", "00:00:5e:00:53:02"], ["receive", 151, 9, 999, "00:00:5e:00:53:05", "ff:ff:ff:ff:ff:ff"], ["receive", 151, 9, 999, "00:00:5e:00:53:06", "00:00:5e:00:53:05"], ["table_size", 10000], ["lookup", 10000, 100, "00:00:5e:00:53:01"]]
    expected: [null, 0, [2], [1], [2], [1], 2, [2], [], [], 0, -1]
    hidden: true
    label: "refresh extends life; a one-port VLAN floods nowhere; a long gap empties the table"
  - args: [["__init__", [[1, [100]], [2, [100]], [3, [100]], [4, [200]], [5, [200]], [6, [100, 200]], [7, [300]], [8, [100, 200, 300]]], 20], ["receive", 0, 4, 200, "00:00:5e:00:53:48", "00:00:5e:00:53:49"], ["receive", 0, 3, 100, "00:00:5e:00:53:43", "00:00:5e:00:53:49"], ["receive", 3, 8, 200, "00:00:5e:00:53:44", "00:00:5e:00:53:43"], ["receive", 11, 1, 100, "00:00:5e:00:53:47", "00:00:5e:00:53:46"], ["receive", 12, 7, 300, "00:00:5e:00:53:47", "00:00:5e:00:53:4b"], ["receive", 12, 2, 100, "00:00:5e:00:53:4b", "00:00:5e:00:53:40"], ["table_size", 13], ["receive", 26, 7, 300, "00:00:5e:00:53:48", "00:00:5e:00:53:47"], ["receive", 28, 5, 200, "00:00:5e:00:53:49", "00:00:5e:00:53:49"], ["table_size", 30], ["table_size", 38], ["receive", 51, 1, 100, "00:00:5e:00:53:48", "00:00:5e:00:53:4b"], ["receive", 64, 5, 200, "01:00:5e:00:00:01", "ff:ff:ff:ff:ff:ff"], ["receive", 69, 5, 200, "00:00:5e:00:53:46", "00:00:5e:00:53:4a"], ["lookup", 72, 200, "00:00:5e:00:53:45"], ["lookup", 80, 100, "00:00:5e:00:53:47"], ["receive", 88, 3, 100, "00:00:5e:00:53:42", "00:00:5e:00:53:42"], ["receive", 89, 3, 100, "00:00:5e:00:53:47", "00:00:5e:00:53:46"], ["receive", 91, 4, 200, "00:00:5e:00:53:43", "00:00:5e:00:53:42"], ["receive", 94, 7, 300, "00:00:5e:00:53:41", "00:00:5e:00:53:4b"], ["receive", 96, 1, 100, "00:00:5e:00:53:44", "00:00:5e:00:53:48"], ["receive", 109, 6, 100, "00:00:5e:00:53:48", "00:00:5e:00:53:44"], ["receive", 109, 1, 100, "00:00:5e:00:53:4a", "00:00:5e:00:53:43"], ["receive", 117, 5, 200, "00:00:5e:00:53:43", "ff:ff:ff:ff:ff:ff"], ["receive", 125, 5, 200, "00:00:5e:00:53:4a", "00:00:5e:00:53:4a"], ["receive", 133, 6, 200, "00:00:5e:00:53:42", "01:00:5e:00:00:01"], ["table_size", 141], ["receive", 142, 7, 300, "00:00:5e:00:53:46", "00:00:5e:00:53:46"], ["receive", 142, 3, 100, "00:00:5e:00:53:46", "01:00:5e:00:00:01"], ["lookup", 142, 100, "00:00:5e:00:53:40"], ["lookup", 155, 200, "00:00:5e:00:53:43"], ["table_size", 158], ["receive", 161, 3, 100, "00:00:5e:00:53:45", "00:00:5e:00:53:42"], ["receive", 169, 3, 100, "00:00:5e:00:53:48", "00:00:5e:00:53:43"], ["table_size", 182], ["receive", 190, 5, 100, "00:00:5e:00:53:48", "00:00:5e:00:53:40"], ["receive", 193, 5, 200, "00:00:5e:00:53:42", "00:00:5e:00:53:40"], ["receive", 193, 7, 300, "00:00:5e:00:53:46", "01:00:5e:00:00:01"], ["receive", 195, 7, 300, "00:00:5e:00:53:42", "00:00:5e:00:53:4b"], ["receive", 200, 3, 100, "00:00:5e:00:53:46", "00:00:5e:00:53:4a"], ["lookup", 200, 200, "00:00:5e:00:53:49"], ["receive", 202, 4, 200, "00:00:5e:00:53:4a", "00:00:5e:00:53:40"], ["receive", 202, 4, 200, "00:00:5e:00:53:40", "ff:ff:ff:ff:ff:ff"], ["lookup", 215, 100, "00:00:5e:00:53:46"], ["receive", 220, 6, 200, "01:00:5e:00:00:01", "00:00:5e:00:53:44"], ["receive", 220, 1, 100, "00:00:5e:00:53:44", "00:00:5e:00:53:42"], ["receive", 220, 6, 200, "00:00:5e:00:53:40", "00:00:5e:00:53:4a"], ["receive", 233, 6, 100, "00:00:5e:00:53:47", "01:00:5e:00:00:01"], ["receive", 235, 2, 100, "00:00:5e:00:53:41", "01:00:5e:00:00:01"], ["receive", 243, 3, 100, "00:00:5e:00:53:4b", "00:00:5e:00:53:41"], ["receive", 245, 3, 100, "00:00:5e:00:53:4b", "00:00:5e:00:53:49"], ["receive", 246, 7, 300, "00:00:5e:00:53:40", "00:00:5e:00:53:46"], ["receive", 248, 3, 100, "00:00:5e:00:53:4a", "ff:ff:ff:ff:ff:ff"], ["receive", 256, 7, 300, "00:00:5e:00:53:41", "00:00:5e:00:53:41"], ["lookup", 259, 200, "00:00:5e:00:53:44"], ["receive", 261, 12, 200, "00:00:5e:00:53:43", "00:00:5e:00:53:47"], ["lookup", 263, 200, "00:00:5e:00:53:4a"], ["receive", 263, 3, 100, "00:00:5e:00:53:45", "00:00:5e:00:53:4b"], ["receive", 265, 8, 300, "00:00:5e:00:53:40", "00:00:5e:00:53:49"], ["receive", 266, 3, 100, "00:00:5e:00:53:48", "00:00:5e:00:53:42"], ["receive", 266, 3, 100, "00:00:5e:00:53:4b", "01:00:5e:00:00:01"], ["receive", 267, 7, 300, "00:00:5e:00:53:4b", "01:00:5e:00:00:01"], ["lookup", 280, 200, "00:00:5e:00:53:40"], ["receive", 280, 6, 100, "00:00:5e:00:53:47", "00:00:5e:00:53:49"], ["receive", 280, 3, 100, "00:00:5e:00:53:4b", "00:00:5e:00:53:41"], ["receive", 281, 8, 200, "00:00:5e:00:53:4b", "01:00:5e:00:00:01"], ["table_size", 284], ["lookup", 292, 200, "00:00:5e:00:53:45"], ["receive", 294, 6, 100, "00:00:5e:00:53:47", "00:00:5e:00:53:47"], ["receive", 295, 4, 200, "00:00:5e:00:53:47", "00:00:5e:00:53:4a"], ["receive", 295, 7, 300, "00:00:5e:00:53:47", "00:00:5e:00:53:45"], ["table_size", 303], ["lookup", 303, 100, "00:00:5e:00:53:45"], ["lookup", 311, 100, "00:00:5e:00:53:42"], ["receive", 324, 3, 100, "00:00:5e:00:53:4b", "00:00:5e:00:53:44"], ["receive", 324, 5, 200, "00:00:5e:00:53:48", "00:00:5e:00:53:48"], ["table_size", 329], ["table_size", 334], ["table_size", 342], ["receive", 342, 8, 200, "00:00:5e:00:53:43", "00:00:5e:00:53:47"], ["receive", 350, 12, 100, "00:00:5e:00:53:49", "ff:ff:ff:ff:ff:ff"], ["receive", 355, 7, 300, "00:00:5e:00:53:4b", "00:00:5e:00:53:47"], ["receive", 355, 2, 200, "00:00:5e:00:53:49", "00:00:5e:00:53:4b"], ["receive", 356, 1, 100, "00:00:5e:00:53:41", "00:00:5e:00:53:42"], ["receive", 359, 3, 100, "00:00:5e:00:53:48", "00:00:5e:00:53:4a"], ["receive", 359, 2, 100, "00:00:5e:00:53:41", "00:00:5e:00:53:4a"], ["receive", 359, 3, 100, "00:00:5e:00:53:41", "00:00:5e:00:53:40"], ["receive", 359, 1, 100, "00:00:5e:00:53:45", "00:00:5e:00:53:40"], ["receive", 361, 3, 100, "00:00:5e:00:53:4b", "00:00:5e:00:53:4a"], ["receive", 366, 4, 200, "00:00:5e:00:53:45", "00:00:5e:00:53:47"]]
    expected: [null, [5, 6, 8], [1, 2, 6, 8], [4, 5, 6], [2, 3, 6, 8], [8], [1, 3, 6, 8], 6, [], [], 5, 2, [2, 3, 6, 8], [], [4, 6, 8], -1, -1, [], [1, 2, 6, 8], [5, 6, 8], [8], [2, 3, 6, 8], [1], [2, 3, 6, 8], [4, 6, 8], [], [4, 5, 8], 2, [], [1, 2, 6, 8], -1, -1, 2, [1, 2, 6, 8], [1, 2, 6, 8], 1, [], [4, 6, 8], [8], [8], [1, 2, 6, 8], -1, [5, 6, 8], [5, 6, 8], 3, [], [2, 3, 6, 8], [4], [1, 2, 3, 8], [1, 3, 6, 8], [2], [1, 2, 6, 8], [8], [1, 2, 6, 8], [], -1, [], -1, [], [7], [1, 2, 6, 8], [1, 2, 6, 8], [8], -1, [1, 2, 3, 8], [1, 2, 6, 8], [4, 5, 6], 6, -1, [], [5, 6, 8], [8], 3, -1, -1, [1, 2, 6, 8], [], 2, 2, 2, [4, 5, 6], [], [8], [], [2, 3, 6, 8], [1, 2, 6, 8], [1, 3, 6, 8], [1, 2, 6, 8], [2, 3, 6, 8], [1, 2, 6, 8], [5, 6, 8]]
    hidden: true
    label: "90 random calls on eight ports and three VLANs"
  - args: [["__init__", [[1, [5]], [2, [5]], [3, [5, 6]]], 0], ["receive", 999999998, 1, 5, "00:00:5e:00:53:21", "00:00:5e:00:53:22"], ["receive", 999999998, 2, 5, "00:00:5e:00:53:22", "00:00:5e:00:53:21"], ["receive", 999999998, 3, 5, "00:00:5e:00:53:23", "00:00:5e:00:53:23"], ["table_size", 999999998], ["lookup", 999999999, 5, "00:00:5e:00:53:21"], ["table_size", 999999999], ["receive", 1000000000, 3, 5, "00:00:5e:00:53:21", "00:00:5e:00:53:22"], ["receive", 1000000000, 1, 5, "00:00:5e:00:53:22", "00:00:5e:00:53:21"], ["lookup", 1000000000, 6, "00:00:5e:00:53:21"], ["lookup", 1000000000, 7, "00:00:5e:00:53:21"], ["table_size", 1000000000]]
    expected: [null, [2, 3], [1], [], 3, -1, 0, [1, 2], [3], -1, -1, 2]
    hidden: true
    label: "aging 0: live only in the second it was learned; a frame to its own sender is filtered; equal timestamps expire together"
time_limit_ms: 4000
---
An Ethernet switch delivers frames between its ports with no configuration beyond which ports belong to which VLAN. It works out where every host is by watching the traffic go past. This problem asks you to build that logic as a class: a **learning switch** with per-VLAN tables and aging.

### The networking idea in one minute

Every Ethernet frame carries a 48-bit **destination MAC address** and a **source MAC address**, written as six hex bytes: `00:00:5e:00:53:0a`. If the lowest bit of the first byte is set, the address is a **group address**: `ff:ff:ff:ff:ff:ff` is **broadcast** (every host), and others such as `01:00:5e:00:00:fb` are **multicast**. Everything else is **unicast**: one interface.

A switch keeps a **MAC address table** mapping each MAC it has heard from to the port it came in on. It follows three rules, the same ones described in [switches, VLANs and loops](/learn/fabric-networking/from-zero/switches-vlans-and-loops):

1. **Learn from the source.** A frame arriving on port `p` proves its *sender* is behind `p`, so the switch records "source MAC on port `p`, last seen now". A sender heard on a new port overwrites the old entry: the host moved.
2. **Decide by the destination.** A known unicast destination is **forwarded** out of its one port. An unknown, broadcast or multicast destination is **flooded**: one copy out of every other port. A destination that the table places on the port the frame arrived on is **filtered** (dropped): it has already heard the frame.
3. **Age out the silent.** An entry that is not refreshed for the **aging time** is deleted, because the switch cannot otherwise tell that a host has left. IEEE 802.1D's default is 300 seconds.

A **VLAN** (virtual LAN) splits one physical switch into several logical ones. Each port is a member of one or more VLANs: an **access port** carries one, a **trunk port** (an uplink to another switch) carries several, with each frame marked by a 4-byte 802.1Q tag that holds its VLAN number. Every VLAN has its own table and its own flood domain: a broadcast in VLAN 100 never leaves through a port that is only in VLAN 200, and the same MAC can sit on different ports in different VLANs. A switch also drops a frame that arrives tagged for a VLAN its port does not carry (**ingress filtering**), and drops a frame whose *source* is a group address, since no single interface can send as a group. It learns nothing from either.

The examples use Meridian's Amsterdam leaf `leaf1.ams` acting as a classic learning switch (Meridian's real leaves learn remote MACs through EVPN instead) and MACs from the documentation range `00:00:5e:00:53:xx` (RFC 7042).

### The task

Implement a class `LearningSwitch`:

- `LearningSwitch(ports, aging)`: `ports` is a list of `[port, vlans]` pairs, where `port` is an integer port number and `vlans` is the list of VLANs that port carries. `aging` is the aging time in seconds. The table starts empty.
- `receive(time, port, vlan, src, dst)`: a frame for VLAN `vlan` arrives on `port` at second `time`. Apply, in order:
  1. If `port` is not a configured port, or does not carry `vlan`, drop the frame: return `[]` and learn nothing.
  2. If `src` is a group address, drop the frame: return `[]` and learn nothing.
  3. Learn: record `src` in `vlan` on `port`, last seen at `time`, replacing any earlier entry for `src` in that VLAN.
  4. If `dst` is a group address, flood. Otherwise, if `dst` has a live entry in `vlan`, return `[that port]`, or `[]` if that port is `port`. Otherwise (unknown unicast), flood.

  Flooding returns every port that carries `vlan` except `port`. Return the ports in ascending order.
- `lookup(time, vlan, mac)`: return the port of `mac`'s live entry in `vlan`, or `-1`. A lookup is a management query and does not refresh anything.
- `table_size(time)`: return the number of live entries across all VLANs.

An entry last seen at `seen` is **live** at time `t` while `t - seen <= aging`; once `t - seen > aging` it is expired and behaves as if it had never been learned. Times never decrease from one call to the next.

Tests are a sequence of calls beginning with `__init__`; the expected output lists each call's return value in order, with `null` for the constructor.

### Examples

**Example 1: learn, flood, forward, age out.** Four Acme servers in VLAN 100 on ports 1 to 4: `acme-web1` (`…53:0a`, port 1), `acme-app2` (`…53:0e`, port 3), `acme-app3` (`…53:10`, port 4), and `acme-app1` (`…53:0d`, port 2), which never sends. `LearningSwitch([[1, [100]], [2, [100]], [3, [100]], [4, [100]]], 300)`.

| Call | Returns | Why |
|---|---|---|
| `receive(0, 1, 100, web1, app2)` | `[2, 3, 4]` | web1 learned on 1; app2 unknown, so flood |
| `receive(0, 3, 100, app2, web1)` | `[1]` | app2 learned on 3; web1 known |
| `receive(1, 1, 100, web1, app2)` | `[3]` | known now; web1 refreshed at 1 |
| `receive(5, 4, 100, app3, ff:ff:ff:ff:ff:ff)` | `[1, 2, 3]` | broadcast floods; app3 learned on 4 |
| `lookup(5, 100, app3)` | `4` | |
| `receive(290, 3, 100, app2, web1)` | `[1]` | app2 refreshed at 290 |
| `table_size(290)` | `3` | web1 (1), app2 (290), app3 (5): all within 300 s |
| `table_size(306)` | `1` | web1 is 305 s old and app3 301 s: both expired |
| `receive(340, 1, 100, web1, app3)` | `[2, 3, 4]` | app3 aged out, so unknown again |
| `lookup(340, 100, app1)` | `-1` | app1 never sent, so it was never learned |

**Example 2: two VLANs and a trunk.** Ports 1 and 2 in VLAN 100, ports 5 and 6 in VLAN 200, port 49 a trunk carrying both. `acme-db2` (`…53:14`) is on port 5; `acme-db3` (`…53:15`) is behind the trunk. `LearningSwitch([[1, [100]], [2, [100]], [5, [200]], [6, [200]], [49, [100, 200]]], 300)`.

| Call | Returns | Why |
|---|---|---|
| `receive(0, 1, 100, web1, ff:ff:ff:ff:ff:ff)` | `[2, 49]` | flood stays inside VLAN 100 |
| `receive(0, 5, 200, db2, ff:ff:ff:ff:ff:ff)` | `[6, 49]` | flood stays inside VLAN 200 |
| `receive(1, 49, 200, db3, db2)` | `[5]` | db3 learned on the trunk in VLAN 200 |
| `receive(2, 6, 200, …53:16, db3)` | `[49]` | |
| `receive(3, 2, 100, …53:0b, db2)` | `[1, 49]` | db2 is known in VLAN 200 only, so in VLAN 100 it is unknown |
| `lookup(3, 200, web1)` | `-1` | web1 lives in VLAN 100's table |
| `table_size(3)` | `5` | |

**Example 3: the aging boundary.** Three ports in VLAN 1, `aging = 10`.

| Call | Returns | Why |
|---|---|---|
| `receive(0, 1, 1, …53:01, ff:ff:ff:ff:ff:ff)` | `[2, 3]` | `…53:01` learned at 0 |
| `receive(10, 2, 1, …53:02, …53:01)` | `[1]` | exactly 10 s old: still live |
| `table_size(10)` | `2` | |
| `lookup(11, 1, …53:01)` | `-1` | 11 s old: expired |
| `receive(21, 3, 1, …53:03, …53:01)` | `[1, 2]` | unknown again, so flood |
| `table_size(21)` | `1` | `…53:02` (seen at 10) is 11 s old; only `…53:03` remains |
| `table_size(32)` | `0` | |

### Constraints

- `1 ≤ len(ports) ≤ 64`; port numbers are distinct integers in `1..1024`; each port carries `1` to `16` distinct VLANs in `1..4094`.
- `0 ≤ aging ≤ 10⁶` and `0 ≤ time ≤ 10⁹`; `time` is non-decreasing across all calls.
- MACs are lowercase strings of the form `xx:xx:xx:xx:xx:xx`.
- At most `2 × 10⁵` calls in total. `receive` and `lookup` may name ports and VLANs that are not configured.

### Follow-up

The interviewer asks: "A real switch ASIC has a fixed-size, hashed table, say 32,000 entries. What does your switch do when a new MAC arrives and the table is full, and how would you add a per-port limit on learned MACs?" Then: "The same MAC is now being learned on port 3, then port 7, then port 3 again, ten times a second. What is happening in the network, and what would you surface to the operator?"

## Solution

### The naive approach

Keep a dictionary from `(vlan, mac)` to `(port, last_seen)`. At the start of every call, scan the whole dictionary and delete each entry with `time - last_seen > aging`; then apply the rules. It is correct and short, but every call costs `O(n)` for `n` entries. With `2 × 10⁵` calls and a table that grows into the tens of thousands, that is billions of steps.

A half-fix is lazy expiry: never sweep, and treat a stale entry as absent when `receive` or `lookup` happens to touch it. That makes both `O(1)`, but `table_size` still has to scan to count only the live entries, and the dictionary keeps every MAC that ever spoke, so memory grows without bound. A real switch cannot afford that either; its table is a fixed-size piece of on-chip memory.

### The insight

Time never goes backwards, and every learn or refresh stamps an entry with the *current* time. So the entry just touched always has the newest timestamp in the table. If you keep the entries in the order they were last touched, they are automatically sorted by `last_seen`, oldest first, and the expired ones are always a prefix of that order. Expiry becomes "pop from the front while the front is expired".

That is the structure from [LRU Cache](/practice/lru-cache): a hash map for `O(1)` lookup by key, threaded through a recency list, with "touch" meaning "move to the end". There it is evicted by capacity; here by age. Each entry is appended once per learn and popped at most once, so the expiry work, summed over all calls, is bounded by the number of learns.

### The optimal approach

Precompute, for each VLAN, its member ports in ascending order, so a flood is one filter over a short list. Keep the table in an ordered dictionary keyed by `(vlan, mac)`. In Python, `OrderedDict` gives `move_to_end` and `popitem(last=False)` in `O(1)`; it is a hash map plus a doubly linked list underneath.

```python
from collections import OrderedDict


def _is_group(mac: str) -> bool:
    # The group bit is the lowest bit of the first byte.
    return int(mac[:2], 16) & 1 == 1


class LearningSwitch:
    def __init__(self, ports: list, aging: int):
        self.aging = aging
        self.members: dict[int, set[int]] = {}      # port -> VLANs it carries
        self.vlan_ports: dict[int, list[int]] = {}  # VLAN -> member ports, ascending
        for port, vlans in ports:
            self.members[port] = set(vlans)
            for vlan in vlans:
                self.vlan_ports.setdefault(vlan, []).append(port)
        for plist in self.vlan_ports.values():
            plist.sort()
        # (vlan, mac) -> (port, last_seen), kept in last_seen order: oldest first.
        self.table: OrderedDict[tuple[int, str], tuple[int, int]] = OrderedDict()

    def _expire(self, now: int) -> None:
        table = self.table
        while table:
            _, (_, seen) = next(iter(table.items()))
            if now - seen <= self.aging:
                break
            table.popitem(last=False)

    def _flood(self, vlan: int, in_port: int) -> list[int]:
        return [p for p in self.vlan_ports[vlan] if p != in_port]

    def receive(self, time: int, port: int, vlan: int, src: str, dst: str) -> list[int]:
        if vlan not in self.members.get(port, ()):
            return []                       # ingress filtering: not this port's VLAN
        if _is_group(src):
            return []                       # a group address cannot be a sender
        self._expire(time)
        key = (vlan, src)
        self.table[key] = (port, time)      # learn, or move and refresh
        self.table.move_to_end(key)         # newest last keeps the order by last_seen
        if _is_group(dst):
            return self._flood(vlan, port)
        entry = self.table.get((vlan, dst))
        if entry is None:
            return self._flood(vlan, port)  # unknown unicast
        return [] if entry[0] == port else [entry[0]]

    def lookup(self, time: int, vlan: int, mac: str) -> int:
        self._expire(time)
        entry = self.table.get((vlan, mac))
        return -1 if entry is None else entry[0]

    def table_size(self, time: int) -> int:
        self._expire(time)
        return len(self.table)
```

The order inside `receive` matters. The two drop checks come first, so an invalid frame teaches the switch nothing. Expiry runs before the destination lookup, so a stale entry is never used to forward. Learning runs before the lookup too, as the statement requires; it only changes the answer for a frame addressed to its own sender, which is then filtered rather than flooded. (A hardware pipeline looks up the source and the destination in the same pass, so a real switch may flood that one frame before the new entry is installed; the fixed order here keeps the answer deterministic.)

**Complexity.** Let `P` be the number of ports in the frame's VLAN. `receive` is amortised `O(1)` for the table work plus `O(P)` to build a flood list, which is the size of the answer and cannot be avoided; forwarding to a known port is `O(1)`. `lookup` and `table_size` are amortised `O(1)`: every `_expire` loop iteration removes an entry that some earlier learn inserted, so the total expiry work over all calls is at most the number of learns. The constructor is `O(M log M)` for `M` port-VLAN memberships. Space is `O(M + E)`, where `E` is the number of entries live at the most recent call: expired entries are actually removed, not just ignored.

A min-heap of `(last_seen, key)` also works, with lazy deletion: when you pop an entry, discard it if the key's current `last_seen` in the map is newer. It costs `O(log n)` per refresh instead of `O(1)` and leaves stale heap items behind, so the ordered list is the better fit because the timestamps arrive already sorted.

### Common mistakes

- **Keying the table by MAC alone.** A frame in VLAN 100 is then forwarded using an entry learned in VLAN 200, leaking traffic between VLANs; Example 2's last `receive` catches it.
- **Assigning to an existing `OrderedDict` key and expecting it to move.** `table[key] = value` on a key that is already present keeps its old position. Without `move_to_end`, a refreshed entry stays near the front with a new timestamp, the expiry loop stops at it, and older dead entries behind it are never removed, so `table_size` overcounts.
- **Flooding to every port instead of the VLAN's members**, or forgetting to exclude the ingress port.
- **Forwarding a frame back out of the port it arrived on** instead of filtering it.
- **An off-by-one at the boundary.** The entry is live at exactly `aging` seconds old; `>=` instead of `>` expires it a second early.
- **Learning from frames that are dropped**: a group source address, or a port that does not carry the frame's VLAN.
- **Refreshing on `lookup`.** A management query is not traffic; only a received frame proves a host is still there.

### How to discuss it

Start with the rules in networking terms and in order: drop the invalid, learn the source, then flood, forward or filter by the destination. Say early that the table is keyed by `(VLAN, MAC)` because each VLAN is its own broadcast domain. Then name the cost problem: lazy expiry handles lookups, but anything that must count or bound live entries needs ordered expiry. The sentence to say is "time is monotonic, so last-touched order is last-seen order, and expiry is popping from the front: the LRU structure, evicting by age instead of capacity." Trace Example 3 to show the `<=` boundary, and mention that a heap works but pays a log factor for an order you get for free.

### The networking follow-ups

An interviewer from a network team will push past the data structure into how this behaves in a real fabric:

- **The table is full.** In an ASIC the MAC table is a hashed exact-match table in on-chip SRAM, a few entries per bucket. A learn fails when the new MAC's buckets are full, sometimes well before the table is, and that MAC's traffic is then flooded to every port in the VLAN. In code: a capacity check before learning a *new* key (a refresh of an existing one still succeeds), and a counter of failed learns, because "flooding while the table reports free space" is a signal operators need. A per-port MAC limit (port security) is a second map from port to learned count, decremented on expiry and on moves; it is the defence against a MAC flooding attack, where one port sends from thousands of random source MACs to fill the table and turn the switch into a hub.
- **MAC flapping.** The same MAC learned alternately on two ports, many times a second, almost always means a layer-2 loop: frames from one host are coming back in through a second path. Ethernet frames have no TTL (time to live, the hop counter that IP packets carry), so a loop multiplies broadcasts until links saturate. Spanning tree exists to block redundant links for exactly this reason. The software answer is to count moves per `(VLAN, MAC)` in a sliding window and raise "MAC move storm on ports 3 and 7, VLAN 100" before anyone reads the CPU graph.
- **Topology change and aging.** When spanning tree reconfigures, entries can point at the wrong port. Classic 802.1D shortens the aging time to the forward delay (15 seconds by default) for a while; rapid spanning tree flushes the affected ports' entries outright. Your class would need a `flush(port)` or `flush(vlan)`, which the ordered table supports by key deletion.
- **ARP outlives the MAC entry.** Routers commonly keep ARP entries (IP-to-MAC mappings) for hours; switches age MACs after five minutes. With asymmetric routing, the return router keeps sending to a MAC the switch has forgotten, and every one of those frames is flooded as unknown unicast. The fix is MAC aging at least as long as the ARP timeout, and the signal is a per-VLAN unknown-unicast flood counter.
- **Hardware versus CPU learning.** Some ASICs learn in the forwarding pipeline at line rate; others punt each new MAC to the control-plane CPU, which installs thousands per second. A burst of new MACs (a rack of VMs migrating) then floods until the CPU catches up.
- **Fabrics replace flood-and-learn.** In a VXLAN fabric (layer 2 carried inside UDP across a routed fabric) like Meridian's, leaves still learn local MACs this way, but they advertise them to every other leaf in BGP EVPN type-2 routes, so remote MACs are known before the first frame and unknown-unicast flooding mostly disappears. That is the subject of [EVPN, the control plane](/learn/fabric-networking/overlays-vxlan-evpn/evpn-the-control-plane). It is fine to say, "I'd defer to the network team on the vendor's exact flush behaviour, but I would expose the table size per VLAN, learn failures, MAC moves and flood counters."

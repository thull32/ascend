---
slug: flow-table-ttl
title: Flow Table with TTL
difficulty: medium
patterns: [design]
lists: [network-practice, ascend-150]
companies: [cisco, cloudflare, arista]
order: 10
lesson: fabric-networking/operating-fabrics/telemetry-and-observability
hints:
  - "A flow's expiry time is its last-seen time plus the TTL, and every packet pushes it later. You need a fast lookup by flow key for `add` and `get`, and a fast way to find the earliest expiry for `expire`. One structure will not do both."
  - "Keep a hash map from flow key to its record and a min-heap of `(expiry, flow_key, ...)`. Do not try to find and update an entry inside the heap when a flow is refreshed: push a new entry and leave the old one where it is."
  - "When `expire` pops an entry, it may be stale: the flow was refreshed after the push, or the record is already gone. An entry is real only if the record still exists and its `last_seen + ttl` equals the entry's expiry. Skip anything else."
  - "A packet that arrives after its flow has timed out but before anyone called `expire` must not revive the old record. Give each record its own id, start a new record for the key, and let the heap report the old one on its own expiry."
signatures:
  python:
    name: FlowTable
    starter: |
      class FlowTable:
          def __init__(self, ttl: int):
              pass

          def add(self, flow_key: str, num_bytes: int, now: int) -> None:
              pass

          def get(self, flow_key: str, now: int) -> int:
              pass

          def expire(self, now: int) -> list[list]:
              pass
  javascript:
    name: FlowTable
    starter: |
      class FlowTable {
        constructor(ttl) {
        }
        add(flow_key, num_bytes, now) {
        }
        get(flow_key, now) {
        }
        expire(now) {
        }
      }
tests:
  - args: [["__init__", 30], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 1500, 0], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 80, 5], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 1500, 20], ["get", "10.1.1.10:51514>10.1.2.20:5432/tcp", 25], ["expire", 34], ["get", "10.1.1.10:53001>10.1.1.1:53/udp", 35], ["expire", 60]]
    expected: [null, null, null, null, 3000, [], -1, [["10.1.1.10:53001>10.1.1.1:53/udp", 80, 5, 5], ["10.1.1.10:51514>10.1.2.20:5432/tcp", 3000, 0, 20]]]
    label: "refresh keeps a flow alive; expire reports in expiry order"
  - args: [["__init__", 10], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 1200, 100], ["get", "203.0.113.25:443>198.51.100.7:61000/tcp", 109], ["expire", 109], ["get", "203.0.113.25:443>198.51.100.7:61000/tcp", 110], ["expire", 110], ["expire", 200]]
    expected: [null, null, 1200, [], -1, [["203.0.113.25:443>198.51.100.7:61000/tcp", 1200, 100, 100]], []]
    label: "a record expires exactly at last_seen + ttl"
  - args: [["__init__", 15], ["get", "10.1.1.10:51514>10.1.2.20:5432/tcp", 0], ["expire", 0], ["expire", 1000], ["get", "10.1.1.10:51514>10.1.2.20:5432/tcp", 1000]]
    expected: [null, -1, [], [], -1]
    label: "empty table"
  - args: [["__init__", 15], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 900, 3], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 900, 3], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 3], ["expire", 18]]
    expected: [null, null, null, null, [["10.1.1.10:51514>10.1.2.20:5432/tcp", 900, 3, 3], ["10.1.1.11:40112>10.1.2.20:5432/tcp", 900, 3, 3], ["10.255.1.11:179>10.255.1.101:40021/tcp", 19, 3, 3]]]
    label: "equal expiry times are ordered by flow key"
  - args: [["__init__", 15], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 80, 0], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 120, 10], ["get", "10.1.1.10:53001>10.1.1.1:53/udp", 24], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 90, 25], ["get", "10.1.1.10:53001>10.1.1.1:53/udp", 26], ["expire", 50]]
    expected: [null, null, null, 200, null, 90, [["10.1.1.10:53001>10.1.1.1:53/udp", 200, 0, 10], ["10.1.1.10:53001>10.1.1.1:53/udp", 90, 25, 25]]]
    label: "a packet after the timeout starts a new record; both are reported"
  - args: [["__init__", 5], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 0], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 64, 1], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 2], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 4], ["expire", 6], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 6], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 8], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 10], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 12], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 14], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 16], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 18], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 20], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 22], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 24], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 26], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 28], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 30], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 32], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 34], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 36], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 19, 38], ["expire", 42], ["get", "10.255.1.11:179>10.255.1.101:40021/tcp", 42], ["expire", 43], ["expire", 43]]
    expected: [null, null, null, null, null, [["192.0.2.80:33000>203.0.113.25:443/tcp", 64, 1, 1]], null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, [], 380, [["10.255.1.11:179>10.255.1.101:40021/tcp", 380, 0, 38]], []]
    hidden: true
    label: "stale heap entries from refreshes are skipped"
  - args: [["__init__", 1], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 100, 7], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 100, 7], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 100, 7], ["get", "203.0.113.25:443>198.51.100.7:61000/tcp", 7], ["get", "203.0.113.25:443>198.51.100.7:61000/tcp", 8], ["expire", 8], ["expire", 9]]
    expected: [null, null, null, null, 300, -1, [["203.0.113.25:443>198.51.100.7:61000/tcp", 300, 7, 7]], []]
    hidden: true
    label: "ttl 1 and repeated adds at the same instant"
  - args: [["__init__", 20], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 1500, 0], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 1500, 10], ["expire", 20], ["get", "10.1.1.10:51514>10.1.2.20:5432/tcp", 20], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 400, 20], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 100, 29], ["expire", 39], ["get", "10.1.1.11:40112>10.1.2.20:5432/tcp", 40], ["expire", 49]]
    expected: [null, null, null, [["10.1.1.10:51514>10.1.2.20:5432/tcp", 1500, 0, 0]], -1, null, null, [], 1600, [["10.1.1.10:51514>10.1.2.20:5432/tcp", 400, 20, 20], ["10.1.1.11:40112>10.1.2.20:5432/tcp", 1600, 10, 29]]]
    hidden: true
    label: "a key evicted by expire can start again"
  - args: [["__init__", 12], ["add", "10.1.2.20:5432>10.1.1.10:51514/tcp", 5614, 2], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 3713, 2], ["expire", 3], ["expire", 6], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 8123, 6], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 6082, 8], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 7381, 22], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 338, 25], ["add", "10.1.2.20:5432>10.1.1.10:51514/tcp", 7997, 26], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 4770, 29], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 6816, 30], ["expire", 31], ["expire", 32], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 6338, 35], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 506, 36], ["get", "10.1.2.20:5432>10.1.1.10:51514/tcp", 38], ["get", "10.1.1.11:40112>10.1.2.20:5432/tcp", 38], ["get", "10.1.2.20:5432>10.1.1.10:51514/tcp", 47], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 8382, 48], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 4432, 57], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 3662, 58], ["get", "10.1.2.20:5432>10.1.1.10:51514/tcp", 67], ["add", "10.1.1.10:123>10.255.1.11:123/udp", 8128, 70], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 7096, 72], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 4092, 73], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 201, 78], ["get", "10.1.1.11:40112>10.1.2.20:5432/tcp", 78], ["add", "10.1.2.20:5432>10.1.1.10:51514/tcp", 7256, 87], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 7050, 88], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 8956, 93], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 2227, 93], ["expire", 96], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 7723, 97], ["get", "10.1.1.10:123>10.255.1.11:123/udp", 111], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 469, 114], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 7055, 117], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 3202, 122], ["expire", 122], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 1031, 136], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 8273, 136], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 3812, 145], ["add", "10.1.1.10:123>10.255.1.11:123/udp", 4356, 150], ["expire", 164], ["add", "10.1.1.10:123>10.255.1.11:123/udp", 5942, 169], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 7480, 170], ["get", "10.1.1.10:123>10.255.1.11:123/udp", 170], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 2668, 171], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 8957, 180], ["get", "10.1.2.20:5432>10.1.1.10:51514/tcp", 189], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 925, 192], ["get", "10.255.1.11:179>10.255.1.101:40021/tcp", 195], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 136, 209], ["get", "10.1.2.20:5432>10.1.1.10:51514/tcp", 218], ["expire", 227], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 2956, 228], ["add", "10.1.2.20:5432>10.1.1.10:51514/tcp", 3076, 231], ["get", "10.1.1.11:40112>10.1.2.20:5432/tcp", 232], ["add", "10.1.2.20:5432>10.1.1.10:51514/tcp", 7889, 235], ["add", "10.1.2.20:5432>10.1.1.10:51514/tcp", 2432, 235], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 4283, 238], ["get", "10.1.1.10:53001>10.1.1.1:53/udp", 238], ["get", "10.1.1.10:51514>10.1.2.20:5432/tcp", 247], ["get", "203.0.113.25:443>198.51.100.7:61000/tcp", 250], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 3385, 251], ["get", "203.0.113.25:443>198.51.100.7:61000/tcp", 254], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 8399, 263], ["get", "203.0.113.25:443>198.51.100.7:61000/tcp", 264], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 2542, 264], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 7072, 269], ["expire", 278], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 6526, 278], ["expire", 281], ["get", "10.1.1.10:53001>10.1.1.1:53/udp", 282], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 6321, 296], ["add", "10.1.1.10:123>10.255.1.11:123/udp", 3504, 298], ["add", "10.1.2.20:5432>10.1.1.10:51514/tcp", 2200, 299], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 5007, 299], ["get", "192.0.2.80:33000>203.0.113.25:443/tcp", 301], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 6578, 301], ["expire", 302], ["get", "10.1.1.10:53001>10.1.1.1:53/udp", 316], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 5552, 317], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 1239, 319], ["add", "10.1.1.10:123>10.255.1.11:123/udp", 2287, 319], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 4883, 328], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 3009, 330], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 2139, 330], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 6840, 332], ["get", "203.0.113.25:443>198.51.100.7:61000/tcp", 334], ["expire", 335], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 5683, 338], ["expire", 338], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 1520, 343], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 146, 357], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 1390, 358], ["get", "203.0.113.25:443>198.51.100.7:61000/tcp", 358], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 4826, 359], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 8896, 364], ["expire", 366], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 5988, 367], ["get", "10.1.1.10:51514>10.1.2.20:5432/tcp", 367], ["expire", 369], ["get", "192.0.2.80:33000>203.0.113.25:443/tcp", 374], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 600, 376], ["add", "10.1.2.20:5432>10.1.1.10:51514/tcp", 3845, 376], ["add", "10.1.2.20:5432>10.1.1.10:51514/tcp", 5579, 378], ["add", "10.1.2.20:5432>10.1.1.10:51514/tcp", 756, 379], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 8655, 388], ["get", "10.255.1.11:179>10.255.1.101:40021/tcp", 393], ["expire", 394], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 7575, 403], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 8324, 404], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 574, 404], ["get", "10.1.1.11:40112>10.1.2.20:5432/tcp", 418], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 1824, 432], ["expire", 433], ["expire", 442], ["expire", 443], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 8197, 443], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 3636, 452], ["get", "10.1.1.11:40112>10.1.2.20:5432/tcp", 455], ["add", "10.255.1.11:179>10.255.1.101:40021/tcp", 854, 460], ["get", "203.0.113.25:443>198.51.100.7:61000/tcp", 463], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 6772, 464], ["get", "10.1.1.10:53001>10.1.1.1:53/udp", 464], ["expire", 465], ["get", "10.1.1.11:40112>10.1.2.20:5432/tcp", 467], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 6577, 467], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 2703, 468], ["add", "10.1.1.10:123>10.255.1.11:123/udp", 1833, 477], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 3960, 477], ["get", "10.1.1.10:51514>10.1.2.20:5432/tcp", 478], ["get", "10.1.2.20:5432>10.1.1.10:51514/tcp", 479], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 4968, 488], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 6388, 497], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 4111, 498], ["add", "10.1.1.10:123>10.255.1.11:123/udp", 1668, 498], ["add", "192.0.2.80:33000>203.0.113.25:443/tcp", 1297, 499], ["get", "192.0.2.80:33000>203.0.113.25:443/tcp", 504], ["add", "10.1.1.10:123>10.255.1.11:123/udp", 546, 509], ["get", "203.0.113.25:443>198.51.100.7:61000/tcp", 514], ["expire", 519], ["add", "10.1.1.10:123>10.255.1.11:123/udp", 4714, 521], ["get", "203.0.113.25:443>198.51.100.7:61000/tcp", 521], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 7230, 522], ["add", "10.1.1.10:53001>10.1.1.1:53/udp", 3126, 525], ["add", "10.1.1.11:40112>10.1.2.20:5432/tcp", 5683, 525], ["add", "10.1.1.10:51514>10.1.2.20:5432/tcp", 4850, 526], ["expire", 528], ["add", "203.0.113.25:443>198.51.100.7:61000/tcp", 8205, 529], ["expire", 629]]
    expected: [null, null, null, [], [], null, null, null, null, null, null, null, [["10.1.2.20:5432>10.1.1.10:51514/tcp", 5614, 2, 2], ["192.0.2.80:33000>203.0.113.25:443/tcp", 3713, 2, 2], ["10.1.1.11:40112>10.1.2.20:5432/tcp", 8123, 6, 6], ["10.1.1.10:53001>10.1.1.1:53/udp", 6082, 8, 8]], [], null, null, -1, 11108, -1, null, null, null, -1, null, null, null, null, -1, null, null, null, null, [["203.0.113.25:443>198.51.100.7:61000/tcp", 7381, 22, 22], ["192.0.2.80:33000>203.0.113.25:443/tcp", 338, 25, 25], ["10.1.2.20:5432>10.1.1.10:51514/tcp", 7997, 26, 26], ["10.1.1.10:51514>10.1.2.20:5432/tcp", 6816, 30, 30], ["10.1.1.11:40112>10.1.2.20:5432/tcp", 11108, 29, 35], ["10.255.1.11:179>10.255.1.101:40021/tcp", 506, 36, 36], ["10.255.1.11:179>10.255.1.101:40021/tcp", 8382, 48, 48], ["203.0.113.25:443>198.51.100.7:61000/tcp", 4432, 57, 57], ["192.0.2.80:33000>203.0.113.25:443/tcp", 3662, 58, 58], ["10.1.1.10:123>10.255.1.11:123/udp", 8128, 70, 70], ["192.0.2.80:33000>203.0.113.25:443/tcp", 7096, 72, 72], ["10.255.1.11:179>10.255.1.101:40021/tcp", 4092, 73, 73], ["10.1.1.10:51514>10.1.2.20:5432/tcp", 201, 78, 78]], null, -1, null, null, null, [["10.1.2.20:5432>10.1.1.10:51514/tcp", 7256, 87, 87], ["10.1.1.10:51514>10.1.2.20:5432/tcp", 2227, 93, 93], ["203.0.113.25:443>198.51.100.7:61000/tcp", 8956, 93, 93], ["10.255.1.11:179>10.255.1.101:40021/tcp", 14773, 88, 97]], null, null, null, null, [["203.0.113.25:443>198.51.100.7:61000/tcp", 469, 114, 114], ["10.1.1.10:53001>10.1.1.1:53/udp", 7055, 117, 117], ["10.255.1.11:179>10.255.1.101:40021/tcp", 3202, 122, 122], ["203.0.113.25:443>198.51.100.7:61000/tcp", 1031, 136, 136], ["10.255.1.11:179>10.255.1.101:40021/tcp", 12085, 136, 145], ["10.1.1.10:123>10.255.1.11:123/udp", 4356, 150, 150]], null, null, 5942, null, null, -1, null, -1, null, -1, [["10.1.1.10:123>10.255.1.11:123/udp", 5942, 169, 169], ["203.0.113.25:443>198.51.100.7:61000/tcp", 7480, 170, 170], ["10.1.1.11:40112>10.1.2.20:5432/tcp", 2668, 171, 171], ["10.1.1.10:53001>10.1.1.1:53/udp", 8957, 180, 180], ["10.1.1.11:40112>10.1.2.20:5432/tcp", 925, 192, 192], ["10.1.1.10:51514>10.1.2.20:5432/tcp", 136, 209, 209]], null, null, -1, null, null, null, 2956, 4283, -1, null, -1, null, -1, null, null, [["10.1.1.10:53001>10.1.1.1:53/udp", 2956, 228, 228], ["10.1.2.20:5432>10.1.1.10:51514/tcp", 13397, 231, 235], ["10.1.1.10:51514>10.1.2.20:5432/tcp", 4283, 238, 238], ["192.0.2.80:33000>203.0.113.25:443/tcp", 3385, 251, 251], ["192.0.2.80:33000>203.0.113.25:443/tcp", 8399, 263, 263], ["10.1.1.10:53001>10.1.1.1:53/udp", 2542, 264, 264]], null, [["10.1.1.10:51514>10.1.2.20:5432/tcp", 7072, 269, 269]], -1, null, null, null, null, -1, null, [["203.0.113.25:443>198.51.100.7:61000/tcp", 6526, 278, 278]], -1, null, null, null, null, null, null, null, -1, [["10.1.1.11:40112>10.1.2.20:5432/tcp", 6321, 296, 296], ["10.1.1.10:123>10.255.1.11:123/udp", 3504, 298, 298], ["10.1.2.20:5432>10.1.1.10:51514/tcp", 2200, 299, 299], ["203.0.113.25:443>198.51.100.7:61000/tcp", 5007, 299, 299], ["10.1.1.10:51514>10.1.2.20:5432/tcp", 6578, 301, 301], ["10.1.1.10:123>10.255.1.11:123/udp", 2287, 319, 319], ["203.0.113.25:443>198.51.100.7:61000/tcp", 6791, 317, 319]], null, [], null, null, null, 1390, null, null, [["10.1.1.10:51514>10.1.2.20:5432/tcp", 7892, 328, 330], ["10.1.1.10:53001>10.1.1.1:53/udp", 2139, 330, 330], ["192.0.2.80:33000>203.0.113.25:443/tcp", 12523, 332, 338], ["203.0.113.25:443>198.51.100.7:61000/tcp", 1520, 343, 343]], null, -1, [["192.0.2.80:33000>203.0.113.25:443/tcp", 146, 357, 357]], -1, null, null, null, null, null, -1, [["203.0.113.25:443>198.51.100.7:61000/tcp", 1390, 358, 358], ["10.1.1.10:53001>10.1.1.1:53/udp", 13722, 359, 364], ["10.255.1.11:179>10.255.1.101:40021/tcp", 5988, 367, 367], ["192.0.2.80:33000>203.0.113.25:443/tcp", 600, 376, 376], ["10.1.2.20:5432>10.1.1.10:51514/tcp", 10180, 376, 379]], null, null, null, -1, null, [["10.1.1.11:40112>10.1.2.20:5432/tcp", 8655, 388, 388], ["10.1.1.11:40112>10.1.2.20:5432/tcp", 7575, 403, 403], ["10.1.1.10:51514>10.1.2.20:5432/tcp", 8898, 404, 404]], [], [], null, null, -1, null, 11833, null, -1, [["10.1.1.10:51514>10.1.2.20:5432/tcp", 1824, 432, 432], ["203.0.113.25:443>198.51.100.7:61000/tcp", 11833, 443, 452]], -1, null, null, null, null, -1, -1, null, null, null, null, null, 1297, null, -1, [["10.255.1.11:179>10.255.1.101:40021/tcp", 854, 460, 460], ["203.0.113.25:443>198.51.100.7:61000/tcp", 2703, 468, 468], ["10.1.1.10:123>10.255.1.11:123/udp", 1833, 477, 477], ["192.0.2.80:33000>203.0.113.25:443/tcp", 17309, 464, 477], ["10.1.1.10:51514>10.1.2.20:5432/tcp", 4968, 488, 488], ["10.1.1.10:53001>10.1.1.1:53/udp", 6388, 497, 497], ["10.1.1.11:40112>10.1.2.20:5432/tcp", 4111, 498, 498], ["192.0.2.80:33000>203.0.113.25:443/tcp", 1297, 499, 499]], null, -1, null, null, null, null, [["10.1.1.10:123>10.255.1.11:123/udp", 2214, 498, 509]], null, [["10.1.1.10:123>10.255.1.11:123/udp", 4714, 521, 521], ["10.1.1.10:53001>10.1.1.1:53/udp", 3126, 525, 525], ["10.1.1.11:40112>10.1.2.20:5432/tcp", 5683, 525, 525], ["10.1.1.10:51514>10.1.2.20:5432/tcp", 4850, 526, 526], ["203.0.113.25:443>198.51.100.7:61000/tcp", 15435, 522, 529]]]
    hidden: true
    label: "150 random calls"
  - args: [["__init__", 1000000000], ["add", "10.1.1.9:40000>10.1.2.20:5432/tcp", 9216, 0], ["add", "10.1.1.10:40000>10.1.2.20:5432/tcp", 64, 0], ["get", "10.1.1.9:40000>10.1.2.20:5432/tcp", 999999999], ["expire", 999999999], ["get", "10.1.1.10:40000>10.1.2.20:5432/tcp", 1000000000], ["add", "10.1.1.9:40000>10.1.2.20:5432/tcp", 1, 1000000000], ["expire", 1000000000], ["get", "10.1.1.9:40000>10.1.2.20:5432/tcp", 1000000000]]
    expected: [null, null, null, 9216, [], -1, null, [["10.1.1.10:40000>10.1.2.20:5432/tcp", 64, 0, 0], ["10.1.1.9:40000>10.1.2.20:5432/tcp", 9216, 0, 0]], 1]
    hidden: true
    label: "string order, not numeric order, at the largest times"
time_limit_ms: 4000
---
A router exporting flow records, or a Linux host doing connection tracking, keeps a table of every conversation it has seen recently and forgets each one when it goes quiet. This problem asks you to build that table, with the aging done the way real implementations do it: lazily.

### The networking idea in one minute

A **flow** is one conversation, identified by its **5-tuple**: source address, source port, destination address, destination port and protocol. Every packet of Meridian's `acme-web1` (10.1.1.10) talking to the Postgres server on `acme-db1` (10.1.2.20) carries the same 5-tuple, so a device can add each packet to one entry in a **flow cache** keyed on it. Here a flow key is a string such as `"10.1.1.10:51514>10.1.2.20:5432/tcp"`.

The cache cannot keep entries forever: an edge router like `gw1.ams` sees millions of distinct flows an hour, most of them a few packets long. So every entry has an **inactive timeout** (a TTL): if no packet for that flow arrives for `ttl` seconds, the flow is over. With IPFIX or NetFlow, the router then **exports** the finished entry to a collector as a flow record (the key, the byte count, the first and last time a packet was seen) and frees it. Linux's connection tracking (conntrack, the table behind stateful firewalls and NAT) ages entries the same way, with a timeout per protocol and state. Every packet for a flow refreshes its timer, so a busy flow lives on and a quiet one ages out.

Real implementations do not run a timer per entry; with a million entries that is a million timers to reset on every packet. They let entries expire *lazily*: an expired entry is ignored when a lookup finds it, and a periodic sweep collects everything whose time has passed.

The examples use Meridian's Acme tenant (`acme-web1` 10.1.1.10, `acme-web2` 10.1.1.11, `acme-db1` 10.1.2.20, gateway 10.1.1.1), a BGP session from `leaf1.ams` (10.255.1.11) to `rr1.ams` (10.255.1.101), and internet flows in the documentation ranges `192.0.2.0/24`, `198.51.100.0/24` and `203.0.113.0/24` (RFC 5737).

### The task

Implement a class `FlowTable`:

- `FlowTable(ttl)`: an empty table with inactive timeout `ttl` (`ttl ≥ 1`).
- `add(flow_key, num_bytes, now)`: a packet of `num_bytes` bytes for `flow_key` arrived at time `now`.
  - If the key has a **live** record, add the bytes to it and set its last-seen time to `now`. This refreshes its TTL.
  - Otherwise start a new record with this packet's bytes, first-seen and last-seen both `now`.
- `get(flow_key, now)`: the byte count of the key's live record at time `now`, or `-1` if there is none. Reading does not refresh the TTL.
- `expire(now)`: remove every record that has expired by `now` and return them as `[flow_key, bytes, first_seen, last_seen]` lists, ordered by expiry time and, for equal expiry times, by `flow_key` (plain string comparison).

A record **expires at** `last_seen + ttl`. It is live at time `t` while `t < last_seen + ttl`, so at exactly `last_seen + ttl` it is already expired.

A record that has expired stays finished even if `expire` has not been called yet. A packet for the same key arriving after the timeout starts a **new** record; the old one is still returned, once, by the first `expire(now)` call with `now` at or after its expiry time. One `expire` call can therefore return two records for the same key.

Times passed to `add`, `get` and `expire` never decrease from one call to the next. `add` and `get` should run in `O(log n)` time or better, and `expire` in time proportional to what it removes plus a logarithmic factor (amortised), where `n` is the number of calls so far.

Tests are a sequence of method calls beginning with `__init__`; the expected output is the list of return values, with `null` for calls that return nothing.

### Examples

**Example 1.** `ttl = 30`. A database connection is refreshed, a DNS query is not.

| Call | Returns | Why |
|---|---|---|
| `FlowTable(30)` | `null` | |
| `add("10.1.1.10:51514>10.1.2.20:5432/tcp", 1500, 0)` | `null` | new record, expires at 30 |
| `add("10.1.1.10:53001>10.1.1.1:53/udp", 80, 5)` | `null` | DNS query to the gateway, expires at 35 |
| `add("10.1.1.10:51514>10.1.2.20:5432/tcp", 1500, 20)` | `null` | refresh: 3000 bytes, now expires at 50 |
| `get("10.1.1.10:51514>10.1.2.20:5432/tcp", 25)` | `3000` | live |
| `expire(34)` | `[]` | nothing has expired yet; the database flow's old expiry of 30 no longer applies |
| `get("10.1.1.10:53001>10.1.1.1:53/udp", 35)` | `-1` | expired at exactly 35, even though nothing has removed it |
| `expire(60)` | `[["10.1.1.10:53001>10.1.1.1:53/udp", 80, 5, 5], ["10.1.1.10:51514>10.1.2.20:5432/tcp", 3000, 0, 20]]` | DNS (expiry 35) before Postgres (expiry 50) |

**Example 2.** `ttl = 15`. A packet arrives after its flow timed out, before anyone called `expire`.

| Call | Returns | Why |
|---|---|---|
| `add("10.1.1.10:53001>10.1.1.1:53/udp", 80, 0)` | `null` | expires at 15 |
| `add("10.1.1.10:53001>10.1.1.1:53/udp", 120, 10)` | `null` | 200 bytes, expires at 25 |
| `get("10.1.1.10:53001>10.1.1.1:53/udp", 24)` | `200` | |
| `add("10.1.1.10:53001>10.1.1.1:53/udp", 90, 25)` | `null` | the record expired at 25, so this starts a new one |
| `get("10.1.1.10:53001>10.1.1.1:53/udp", 26)` | `90` | the new record only |
| `expire(50)` | `[["10.1.1.10:53001>10.1.1.1:53/udp", 200, 0, 10], ["10.1.1.10:53001>10.1.1.1:53/udp", 90, 25, 25]]` | two records, one key |

**Example 3.** `ttl = 15`. Three flows seen at time 3 all expire at 18, so `expire(18)` orders them by key:

```
expire(18) -> [["10.1.1.10:51514>10.1.2.20:5432/tcp", 900, 3, 3],
               ["10.1.1.11:40112>10.1.2.20:5432/tcp", 900, 3, 3],
               ["10.255.1.11:179>10.255.1.101:40021/tcp", 19, 3, 3]]
```

### Constraints

- `1 ≤ ttl ≤ 10⁹`, `0 ≤ now ≤ 10⁹`, and `now` never decreases across calls.
- `1 ≤ num_bytes ≤ 9216` (one packet, up to a jumbo frame).
- Flow keys are non-empty ASCII strings.
- At most `2 × 10⁵` calls in total.

### Follow-up

"IPFIX also has an **active timeout**: a flow that never goes quiet, such as a three-hour backup, must still be exported periodically (every 60 seconds, say) so the collector is not blind to it until the end. Add that. Then the cache is capped at a million entries and a SYN flood arrives with a new 5-tuple in every packet: what do you evict, what do you count, and what does the operator see on the collector?"

## Solution

### The naive approach

Keep a dictionary from flow key to record. `add` and `get` are `O(1)`: look up the record and compare `now` with `last_seen + ttl`. `expire` scans every record, collects those with `last_seen + ttl ≤ now`, deletes them and sorts them: `O(n log n)` per call, or `O(n)` plus sorting what it removes. A router that sweeps a million-entry cache once a second this way spends most of its time looking at flows that are nowhere near expiring.

The opposite naive idea keeps the records in a list sorted by expiry, so `expire` takes a prefix. Now every refresh has to move a record to its new position, `O(n)` in a list, on the packet path. That is the wrong side to make slow: packets arrive far more often than sweeps.

### The insight

The two jobs want two structures. A hash map answers "where is this flow?" for each packet. A **min-heap** ordered by `(expiry, flow_key)` answers "which flow expires next?" for the sweep. The difficulty is the refresh: a packet changes a flow's expiry, and a binary heap cannot find an arbitrary element to update it without an index.

Do not update it. Push a **new** heap entry with the new expiry and leave the old one in place. The old entry is now **stale**, and the sweep detects it when it pops it: the entry says "expires at 30", the record says `last_seen + ttl = 50`, so the entry is ignored. This is lazy deletion, the same trick Dijkstra's algorithm uses with a heap that has no decrease-key. A stale entry never has a *later* expiry than the record's real one, so it reaches the top first and is discarded harmlessly; the real entry comes later, in its correct place. (Two packets at the same instant push two identical entries: the first reports the record, and the second finds it already gone.)

The second subtlety is the late packet in example 2. If records were keyed only by flow key, that packet would find the timed-out record and either revive it (wrong bytes, wrong first-seen) or overwrite it (the old record is never exported). Give every record its own **id**. The map points a key at its *current* record id; the heap entries carry the id; a timed-out record stays in the record store, still owned by its own valid heap entry, until the sweep reports it.

### The optimal approach

State:

- `records`: record id → `[flow_key, bytes, first_seen, last_seen]`.
- `current`: flow key → id of the newest record for that key.
- `heap`: entries `(expiry, flow_key, id)`. Python compares tuples left to right, so the heap pops in expiry order with ties broken by key, which is exactly the order `expire` must return. The id never decides a comparison between two valid entries, because two live records never share a key and an expiry.

Operations:

- `add`: if `current[key]` exists and that record is live (`last_seen + ttl > now`), add the bytes and set `last_seen = now`. Otherwise create a record with a fresh id and point `current[key]` at it. In both cases push `(now + ttl, key, id)`.
- `get`: follow `current[key]`; return the bytes if the record is live, `-1` otherwise. An expired record is treated as absent without removing it.
- `expire`: while the heap's top expiry is `≤ now`, pop it. If the record is gone, or its `last_seen + ttl` differs from the entry's expiry, the entry is stale: skip it. Otherwise append the record, delete it, and delete `current[key]` if it still points at this id (it may already point at a newer record, as in example 2).

```python
import heapq


class FlowTable:
    def __init__(self, ttl: int):
        self.ttl = ttl
        self.records: dict[int, list] = {}   # id -> [flow_key, bytes, first_seen, last_seen]
        self.current: dict[str, int] = {}    # flow_key -> id of its newest record
        self.heap: list[tuple[int, str, int]] = []   # (expiry, flow_key, id)
        self.next_id = 0

    def add(self, flow_key: str, num_bytes: int, now: int) -> None:
        rid = self.current.get(flow_key)
        if rid is not None and self.records[rid][3] + self.ttl > now:
            rec = self.records[rid]          # live: refresh it
            rec[1] += num_bytes
            rec[3] = now
        else:                                # absent or timed out: a new record
            rid = self.next_id
            self.next_id += 1
            self.records[rid] = [flow_key, num_bytes, now, now]
            self.current[flow_key] = rid
        heapq.heappush(self.heap, (now + self.ttl, flow_key, rid))

    def get(self, flow_key: str, now: int) -> int:
        rid = self.current.get(flow_key)
        if rid is None:
            return -1
        rec = self.records[rid]
        if rec[3] + self.ttl <= now:         # expired, not yet swept
            return -1
        return rec[1]

    def expire(self, now: int) -> list[list]:
        out = []
        while self.heap and self.heap[0][0] <= now:
            expiry, flow_key, rid = heapq.heappop(self.heap)
            rec = self.records.get(rid)
            if rec is None or rec[3] + self.ttl != expiry:
                continue                     # stale: refreshed later, or already reported
            out.append(list(rec))
            del self.records[rid]
            if self.current.get(flow_key) == rid:
                del self.current[flow_key]
        return out
```

Trace example 1. After the three adds the heap holds `(30, pg, 0)`, `(35, dns, 1)` and `(50, pg, 0)`, where record 0 has `last_seen = 20`. `expire(34)` pops `(30, pg, 0)`: record 0 exists but `20 + 30 = 50 ≠ 30`, so it is stale and skipped. The top is now 35, above 34, so the call returns `[]`. `expire(60)` pops `(35, dns, 1)`: `5 + 30 = 35`, valid, reported. Then `(50, pg, 0)`: `20 + 30 = 50`, valid, reported.

In example 2, the add at 25 finds record 0 timed out (`10 + 15 = 25`, not above 25), so it creates record 1 and points the key at it. Record 0 keeps its valid entry `(25, dns, 0)`. `expire(50)` pops entry `(15, dns, 0)` (stale, since `10 + 15 ≠ 15`), then `(25, dns, 0)` (valid: record 0 reported, but `current` points at record 1 and is left alone), then `(40, dns, 1)` (valid: record 1 reported, `current` cleared).

**Complexity.** Each `add` pushes one entry: `O(log h)`, where `h ≤ n` is the heap size. `get` is `O(1)`. Each heap entry is popped at most once over the table's lifetime, so across all calls `expire` costs `O((n + k) log h)` in total, where `k` is the number of records returned: amortised `O(log n)` per call. Space is `O(n)`, because stale entries stay in the heap until their old expiry time passes.

The stale entries are the price of lazy deletion. A flow refreshed by every packet leaves one entry per packet in the heap, although each is gone within `ttl` of being pushed. A variant avoids that: push only when a record is created, and when the sweep pops an entry whose record has a later real expiry, push it again with the real expiry instead of discarding it. The heap then holds one entry per record, a refresh becomes `O(1)` on the packet path, and the output order is unchanged, because an entry's expiry is never later than its record's real one.

### Common mistakes

- **Trusting the heap entry.** Popping `(30, pg, 0)` and reporting it without comparing against the record exports a live, refreshed flow early, and exports it again later.
- **Reviving a timed-out record.** Checking only "does the key exist?" in `add` folds the late packet in example 2 into the old record: 290 bytes and a first-seen of 0, for what were two separate conversations.
- **Losing the old record.** Overwriting the timed-out record in place gets `get` right but never exports the 200 bytes. A flow collector that loses records under-counts traffic without any visible error.
- **Off-by-one at the boundary.** The record is dead at exactly `last_seen + ttl`. Use `>` for live in `add` and `get`, and `≤` for due in `expire`, and make all three agree.
- **Letting `get` refresh the TTL.** Reading the cache is not traffic; an exporter that polls its own cache would otherwise keep every flow alive.
- **Deleting `current[key]` unconditionally.** When the sweep reports an old record, the key may already point at a newer one. Clear the pointer only if it still names the record being removed.
- **Pushing records into the heap.** `(expiry, key, record_list)` crashes on a tie in Python, because two lists may need comparing. Push an id.

### How to discuss it

Start from the access pattern: "every packet does a lookup and a refresh, a sweep runs occasionally, so the packet path must be cheap and the sweep must not touch flows that are far from expiring." That gives the hash map plus min-heap, and the refresh problem leads straight to lazy deletion. Say out loud how a stale entry is recognised (the record's real expiry disagrees with the entry's) and why it is harmless (it is always earlier than the real one). Then raise the late-packet case yourself before the interviewer does; it is the part that separates a cache from a flow table, because a flow table's output is the export, and a lost or merged record is a wrong number on someone's capacity graph. Finish with the space cost of stale entries and the push-on-pop variant.

### Networking follow-ups

- **"Add an active timeout."** Each record gets a second deadline, `first_seen + active_timeout`, for long-lived flows. When it passes, export the record so far and start a fresh one for the same key. In the heap, a record's due time becomes `min(last_seen + ttl, first_seen + active)`; the stale check compares against that. With a 60-second active timeout the collector receives a three-hour transfer as 180 one-minute deltas. It must spread each record's bytes over that record's own start and end: a collector that books all of them at export time draws a steady transfer as a spike per export, which is glaring with the 30-minute active timeout some exporters default to.
- **"The cache is full."** Hardware and software caches have a fixed size. Options are to refuse new flows and count them (the exporter's cache-full or "flows not added" counter, which is the signal to alarm on), or to evict early, oldest last-seen first, which is an LRU over last-seen and is cheap with this structure. Under a SYN flood, every packet is a new one-packet flow, so the cache fills with garbage and evicts real flows; that is why exporters use aggressive timeouts for flows that never complete a handshake, and why Linux conntrack has a separate, shorter timeout for half-open TCP and drops new entries when `nf_conntrack_max` is reached (the kernel logs "table full, dropping packet").
- **"End a TCP flow early."** A FIN or RST means the conversation is over; real exporters export within seconds instead of waiting for the inactive timeout. That is a third way into the export path and a reason the per-record due time is computed, not fixed.
- **"Why not a timer per flow, or a timer wheel?"** A heap costs `O(log n)` per push. A **hashed timing wheel** (Varghese and Lauck) is an array of buckets, one per tick; a flow is placed in the bucket for its expiry tick and the sweep empties one bucket per tick, so insert and expire are `O(1)` with a resolution of one tick. Kernels use wheels for this reason. Linux conntrack today has no per-entry timer at all: an expired entry is treated as dead when a lookup finds it, and a garbage-collection worker walks the hash table in slices, which is lazy expiry with a scan instead of a heap.
- **"Whose clock is `now`?"** It must be monotonic. An exporter that takes `now` from the wall clock and has NTP step it forward by an hour expires its whole cache in one sweep: a burst of records at the collector, then a gap. A stepped-back clock leaves entries that never expire. The same class of bug, a clock jump aging out every entry at once, has emptied routing-protocol databases.
- **"Sampling."** At hundreds of gigabits per second a switch cannot touch every packet, so it samples 1 in N and the collector multiplies by N. Small flows are then missed entirely and byte counts carry an error bar. The [telemetry lesson](/learn/fabric-networking/operating-fabrics/telemetry-and-observability) works through sFlow and IPFIX with their error bars, and [top-k flows](/practice/top-k-flows) is the natural next question on the collector side.
- **"Scale it across cores."** Shard the table by a hash of the flow key, one shard per core, the same way NICs spread flows over receive queues; each shard has its own map and heap and no lock on the packet path. The cost is that a global "top talkers" or a global size cap now needs a merge across shards.

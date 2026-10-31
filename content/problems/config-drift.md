---
slug: config-drift
title: Config Drift
difficulty: medium
patterns: [hash-map]
lists: [network-practice, ascend-150]
companies: [arista, cisco, cloudflare, google]
order: 12
lesson: fabric-networking/operating-fabrics/network-automation-and-source-of-truth
hints:
  - "Walk both documents together. At each level take the union of the two objects' keys: a key only in running is added, a key only in intended is removed, and a key in both is either a recursion or a comparison."
  - "Recurse only when both values are objects. If a key exists on one side only, or one side is an object and the other is not, report that path once and do not descend: a whole missing subtree is one difference, not one per leaf."
  - "Compare leaves strictly. In Python `True == 1` and `[True] == [1]` are both true, but here they differ, so check the types (bool before int) or compare `json.dumps(v, sort_keys=True)` of both sides (without `sort_keys`, two equal objects inside a list can serialise differently). Sort each of the three lists at the end."
signatures:
  python:
    name: config_drift
    starter: |
      def config_drift(intended: dict, running: dict) -> dict[str, list[str]]:
          pass
  javascript:
    name: config_drift
    starter: |
      function config_drift(intended, running) {
      }
tests:
  - args: [{"hostname": "leaf1.ams", "interface": {"lo": {"address": ["10.255.1.11/32"]}, "swp51": {"description": "to spine1.ams", "mtu": 9216, "address": ["10.254.1.1/31"], "isis": {"metric": 10, "network-type": "point-to-point"}}, "swp52": {"description": "to spine2.ams", "mtu": 9216, "address": ["10.254.2.1/31"], "isis": {"metric": 10, "network-type": "point-to-point"}}, "swp1": {"bridge": {"access": 100}}}, "vlan": {"100": {"vni": 10100}}, "ntp": {"servers": ["172.16.0.5", "172.16.0.6"]}}, {"hostname": "leaf1.ams", "interface": {"lo": {"address": ["10.255.1.11/32"]}, "swp51": {"mtu": 9216, "address": ["10.254.1.1/31"], "isis": {"metric": 10, "network-type": "point-to-point"}}, "swp52": {"description": "to spine2.ams", "mtu": 9216, "address": ["10.254.2.1/31"], "isis": {"metric": 1000, "network-type": "point-to-point"}}, "swp1": {"bridge": {"access": 100}}, "swp5": {"bridge": {"access": 300}}}, "vlan": {"100": {"vni": 10100}, "300": {"vni": 10102}}, "ntp": {"servers": ["172.16.0.5"]}}]
    expected: {"added": ["interface.swp5", "vlan.300"], "removed": ["interface.swp51.description"], "changed": ["interface.swp52.isis.metric", "ntp.servers"]}
    label: "leaf1.ams: a manual metric, a leftover segment, a lost NTP server"
  - args: [{"vrf": {"ACME": {"l3vni": 50001}, "GLOBEX": {"l3vni": 50002}}, "evpn": {"enable": true}}, {"vrf": {"ACME": {"l3vni": 50001, "rd": "10.255.1.11:50001"}}, "evpn": true}]
    expected: {"added": ["vrf.ACME.rd"], "removed": ["vrf.GLOBEX"], "changed": ["evpn"]}
    label: "a missing subtree is one path; an object replaced by a scalar is a change"
  - args: [{"interface": {"swp1": {"mtu": 9216, "lldp": true, "vlans": [100, 200], "description": "acme-web1"}}}, {"interface": {"swp1": {"mtu": "9216", "lldp": 1, "vlans": [200, 100], "description": "acme-web1"}}}]
    expected: {"added": [], "removed": [], "changed": ["interface.swp1.lldp", "interface.swp1.mtu", "interface.swp1.vlans"]}
    label: "strict types and ordered lists"
  - args: [{"hostname": "leaf1.ams", "interface": {"lo": {"address": ["10.255.1.11/32"]}, "swp51": {"description": "to spine1.ams", "mtu": 9216, "address": ["10.254.1.1/31"], "isis": {"metric": 10, "network-type": "point-to-point"}}, "swp52": {"description": "to spine2.ams", "mtu": 9216, "address": ["10.254.2.1/31"], "isis": {"metric": 10, "network-type": "point-to-point"}}, "swp1": {"bridge": {"access": 100}}}, "vlan": {"100": {"vni": 10100}}, "ntp": {"servers": ["172.16.0.5", "172.16.0.6"]}}, {"hostname": "leaf1.ams", "interface": {"lo": {"address": ["10.255.1.11/32"]}, "swp51": {"description": "to spine1.ams", "mtu": 9216, "address": ["10.254.1.1/31"], "isis": {"metric": 10, "network-type": "point-to-point"}}, "swp52": {"description": "to spine2.ams", "mtu": 9216, "address": ["10.254.2.1/31"], "isis": {"metric": 10, "network-type": "point-to-point"}}, "swp1": {"bridge": {"access": 100}}}, "vlan": {"100": {"vni": 10100}}, "ntp": {"servers": ["172.16.0.5", "172.16.0.6"]}}]
    expected: {"added": [], "removed": [], "changed": []}
    label: "in sync: three empty lists"
  - args: [{}, {}]
    expected: {"added": [], "removed": [], "changed": []}
    label: "two empty configs"
  - args: [{"hostname": "leaf2.ams", "interface": {"lo": {"address": ["10.255.1.12/32"]}}, "vlan": {"100": {"vni": 10100}}}, {}]
    expected: {"added": [], "removed": ["hostname", "interface", "vlan"], "changed": []}
    label: "a wiped device: every top-level key is removed"
  - args: [{"vlan": {}, "vrf": {}, "interface": {"swp3": {}}, "ntp": {}}, {"vlan": {"100": {"vni": 10100}}, "interface": {"swp3": {}}, "ntp": null}]
    expected: {"added": ["vlan.100"], "removed": ["vrf"], "changed": ["ntp"]}
    hidden: true
    label: "empty objects: recurse into them, and null is a value"
  - args: [{"interface": {"swp1": {"mtu": 9216}, "swp2": {"mtu": 9216}, "swp9": {"mtu": 9216}, "swp10": {"mtu": 9216}, "Vlan100": {"vrf": "ACME"}, "eth0": {"address": ["172.16.1.11/16"]}}}, {"interface": {"swp1": {"mtu": 1500}, "swp2": {"mtu": 1500}, "swp9": {"mtu": 1500}, "swp10": {"mtu": 1500}, "Vlan100": {"vrf": "GLOBEX"}, "eth0": {"address": ["172.16.1.11/16"], "mtu": 1500}}}]
    expected: {"added": ["interface.eth0.mtu"], "removed": [], "changed": ["interface.Vlan100.vrf", "interface.swp1.mtu", "interface.swp10.mtu", "interface.swp2.mtu", "interface.swp9.mtu"]}
    hidden: true
    label: "sorted by code point, not naturally"
  - args: [{"router": {"bgp": {"asn": 65000, "router-id": "10.255.1.11", "neighbors": [{"peer": "10.255.1.101", "remote-as": 65000}, {"peer": "10.255.1.102", "remote-as": 65000}], "address-family": {"l2vpn-evpn": {"enable": true, "advertise-all-vni": true}}}}}, {"router": {"bgp": {"asn": 65000, "router-id": "10.255.1.11", "neighbors": [{"peer": "10.255.1.101", "remote-as": 65000}, {"peer": "10.255.1.102", "remote-as": 65001}], "address-family": {"l2vpn-evpn": {"enable": true, "advertise-all-vni": false}, "ipv4-unicast": {"enable": true}}}}}]
    expected: {"added": ["router.bgp.address-family.ipv4-unicast"], "removed": [], "changed": ["router.bgp.address-family.l2vpn-evpn.advertise-all-vni", "router.bgp.neighbors"]}
    hidden: true
    label: "lists of objects are compared whole, not recursed into"
  - args: [{"a": {"b": {"c": {"d": {"e": {"f": {"g": {"h": 1, "i": [1, {"j": 2}]}}}}}}}}, {"a": {"b": {"c": {"d": {"e": {"f": {"g": {"h": false, "i2": [1, {"j": 2}]}}, "k": 0}}}}}}]
    expected: {"added": ["a.b.c.d.e.f.g.i2", "a.b.c.d.e.k"], "removed": ["a.b.c.d.e.f.g.i"], "changed": ["a.b.c.d.e.f.g.h"]}
    hidden: true
    label: "eight levels deep; false is not 1"
  - args: [{"hostname": "leaf7.sjc", "interface": {"swp1": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp2": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp3": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp4": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp5": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp6": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp7": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp8": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp9": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp10": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp11": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp12": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp13": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp14": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp15": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp16": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp17": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp18": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp19": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp20": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp21": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp22": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp23": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp24": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp25": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp26": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp27": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp28": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp29": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp30": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp31": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp32": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp33": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp34": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp35": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp36": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp37": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp38": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp39": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp40": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp41": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp42": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp43": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp44": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp45": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp46": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp47": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp48": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}}, "vlan": {"100": {"vni": 10100}, "200": {"vni": 10200}, "300": {"vni": 10300}, "400": {"vni": 10400}}}, {"hostname": "leaf7.sjc", "interface": {"swp1": {"mtu": 1500, "bridge": {"access": 200}, "lldp": true}, "swp2": {"mtu": 9216, "bridge": {"access": 300}}, "swp3": {"mtu": 1500, "bridge": {"access": 400}, "lldp": true}, "swp4": {"mtu": 9216, "bridge": {"access": 100}}, "swp5": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp6": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp7": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp8": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp9": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp10": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true, "description": "temp"}, "swp11": {"mtu": 1500, "bridge": {"access": 400}, "lldp": true}, "swp12": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp13": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp14": {"mtu": 1500, "bridge": {"access": 300}, "lldp": true}, "swp15": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp16": {"mtu": 1500, "bridge": {"access": 100}, "lldp": true}, "swp17": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp18": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp19": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp20": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp21": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp22": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp23": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp24": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp25": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp26": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp27": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp28": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp29": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp30": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp31": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp32": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp33": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp34": {"mtu": 1500, "bridge": {"access": 300}, "lldp": true}, "swp35": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp36": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp37": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp38": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp39": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp40": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp41": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true}, "swp42": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp43": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp44": {"mtu": 9216, "bridge": {"access": 100}}, "swp45": {"mtu": 9216, "bridge": {"access": 200}, "lldp": true, "description": "temp"}, "swp46": {"mtu": 9216, "bridge": {"access": 300}, "lldp": true}, "swp47": {"mtu": 9216, "bridge": {"access": 400}, "lldp": true}, "swp48": {"mtu": 9216, "bridge": {"access": 100}, "lldp": true}, "swp49": {"mtu": 9216}}, "vlan": {"100": {"vni": 10100}, "200": {"vni": 10200}, "300": {"vni": 10300}, "999": {"vni": 10999}}}]
    expected: {"added": ["interface.swp10.description", "interface.swp45.description", "interface.swp49", "vlan.999"], "removed": ["interface.swp2.lldp", "interface.swp4.lldp", "interface.swp44.lldp", "vlan.400"], "changed": ["interface.swp1.mtu", "interface.swp11.mtu", "interface.swp14.mtu", "interface.swp16.mtu", "interface.swp3.mtu", "interface.swp34.mtu"]}
    hidden: true
    label: "a 48-port leaf with scattered drift"
  - args: [{"ntp": null, "dns": {"servers": []}, "lldp": false, "snmp": {"communities": []}, "acl": [{"seq": 10, "action": "permit", "dst": "10.1.1.0/24"}], "qos": {"pfc": {"priorities": [false, false, false, true, false, false, false, false]}}, "interface": {"swp1": {"ipv6": {}}}}, {"ntp": null, "dns": {"servers": {}}, "lldp": 0, "snmp": {"communities": []}, "acl": [{"dst": "10.1.1.0/24", "action": "permit", "seq": 10}], "qos": {"pfc": {"priorities": [0, 0, 0, 1, 0, 0, 0, 0]}}, "interface": {"swp1": {"ipv6": {"address": null}}}}]
    expected: {"added": ["interface.swp1.ipv6.address"], "removed": [], "changed": ["dns.servers", "lldp", "qos.pfc.priorities"]}
    hidden: true
    label: "null equals null, a list is not an object, key order inside a list does not matter, false is not 0"
time_limit_ms: 4000
---
An automation system keeps what each switch *should* look like in a database and compares it with what the switch is *actually* running. Every difference is either a change the automation has not pushed yet or **drift**: someone or something changed the device behind the automation's back. This problem asks you to write the comparison.

### The networking idea in one minute

A network operator's **source of truth** is the database that holds intent: which VLANs exist, which IP address each interface has, which routing-protocol cost each link carries. From it the automation renders the **intended configuration** of every device. The **running configuration** is what the device is using right now, read back over a management API. Modern network operating systems (Arista EOS, Juniper Junos, Nokia SR Linux, SONiC, Cumulus/NVUE) and the OpenConfig models used over gNMI and NETCONF expose configuration as a nested tree, so both sides arrive as nested JSON objects.

The two drift apart for ordinary reasons. During an incident an engineer raises a link's IS-IS metric (the cost the routing protocol uses to pick paths) to 1,000 by hand to steer traffic off a failing optic and never reverts it. A tenant segment is deleted from the source of truth, but the push that followed only *merged* new settings and left the old VLAN on the device. A firmware upgrade adds a default. Each of these is invisible until something diffs the two trees, and a diff that is wrong in either direction is worse than none: false differences train operators to ignore the report, and missed ones leave a hand-made change waiting to surprise the next engineer.

The examples use Meridian's Amsterdam leaf `leaf1.ams` (loopback `10.255.1.11`, uplinks `swp51` to `spine1.ams` and `swp52` to `spine2.ams`, management on `172.16.0.0/16`) and its tenants Acme and Globex. The [source of truth lesson](/learn/fabric-networking/operating-fabrics/network-automation-and-source-of-truth) walks the whole intent loop.

### The task

Write `config_drift(intended, running)`. Both arguments are JSON objects (Python `dict`, JavaScript plain object) whose values are strings, integers, booleans, `null`, lists or further objects. Return an object with three keys:

- `"added"`: paths present in `running` but not in `intended` (the device has something the intent does not).
- `"removed"`: paths present in `intended` but not in `running` (the device is missing something).
- `"changed"`: paths present on both sides whose values differ.

A **path** is the chain of keys from the top, joined with `"."`: `interface` → `swp52` → `isis` → `metric` is `"interface.swp52.isis.metric"`. The rules:

1. When a key's value is an object on **both** sides, descend into it and compare its keys; the key itself is never reported. Two empty objects are equal.
2. When a key exists on only one side, report that key's path **once**, whatever its value is. Do not list the keys beneath it.
3. When a key exists on both sides and the values are not both objects, compare them as whole values. One side an object and the other not is a change at that key.
4. **Lists are values.** Compare them element by element, in order, without descending into them for paths: `[100, 200]` and `[200, 100]` differ, and two lists of objects are equal only if every object matches. Object key order never matters.
5. **Types are strict.** `9216` and `"9216"` differ, `true` and `1` differ, `false` and `0` differ. A key whose value is `null` is present; `null` versus a missing key is an addition or a removal.

Sort each of the three lists by plain string comparison (character-code order, which is what Python's `sorted` and JavaScript's default `sort` both do for ASCII keys): `"swp10"` comes before `"swp2"`, and `"Vlan100"` before `"eth0"`. Every list is present even when empty.

### Examples

**Example 1.** `leaf1.ams` after a night in production:

```python
intended = {
  "hostname": "leaf1.ams",
  "interface": {
    "lo":    {"address": ["10.255.1.11/32"]},
    "swp51": {"description": "to spine1.ams", "mtu": 9216, "address": ["10.254.1.1/31"],
              "isis": {"metric": 10, "network-type": "point-to-point"}},
    "swp52": {"description": "to spine2.ams", "mtu": 9216, "address": ["10.254.2.1/31"],
              "isis": {"metric": 10, "network-type": "point-to-point"}},
    "swp1":  {"bridge": {"access": 100}}
  },
  "vlan": {"100": {"vni": 10100}},
  "ntp":  {"servers": ["172.16.0.5", "172.16.0.6"]}
}
```

The running config is the same except that `swp52`'s metric is `1000`, `swp51` has lost its description, a leftover port `"swp5": {"bridge": {"access": 300}}` and VLAN `"300": {"vni": 10102}` are still there, and the NTP list is `["172.16.0.5"]`.

| Output | Why |
|---|---|
| `"added": ["interface.swp5", "vlan.300"]` | Each leftover subtree is reported once at its top, not as `interface.swp5.bridge.access` |
| `"removed": ["interface.swp51.description"]` | Present in intent, missing on the device |
| `"changed": ["interface.swp52.isis.metric", "ntp.servers"]` | `10` became `1000`; the list lost an element, and lists are compared whole |

**Example 2.** A missing tenant and a type change.

| `intended` | `running` | Output |
|---|---|---|
| `{"vrf": {"ACME": {"l3vni": 50001}, "GLOBEX": {"l3vni": 50002}}, "evpn": {"enable": true}}` | `{"vrf": {"ACME": {"l3vni": 50001, "rd": "10.255.1.11:50001"}}, "evpn": true}` | `{"added": ["vrf.ACME.rd"], "removed": ["vrf.GLOBEX"], "changed": ["evpn"]}` |

The whole `GLOBEX` VRF is missing, so it is one removal. `evpn` is an object in intent and a boolean on the device: that is a change at `evpn`, and you do not report `evpn.enable` as removed.

**Example 3.** Strict values.

| `intended` | `running` | Output |
|---|---|---|
| `{"interface": {"swp1": {"mtu": 9216, "lldp": true, "vlans": [100, 200], "description": "acme-web1"}}}` | `{"interface": {"swp1": {"mtu": "9216", "lldp": 1, "vlans": [200, 100], "description": "acme-web1"}}}` | `{"added": [], "removed": [], "changed": ["interface.swp1.lldp", "interface.swp1.mtu", "interface.swp1.vlans"]}` |

A string MTU, a `1` where a boolean belongs and a reordered list are all differences. Deciding that some of them are harmless is a normalisation step that runs *before* the diff, not something the diff should guess.

### Constraints

- Both configs together hold at most `10⁵` keys and list elements; nesting is at most 32 levels deep.
- Keys are non-empty ASCII strings, contain no `"."` and do not start with `"$"`. Numbers are integers.
- Both top-level values are objects (possibly empty).

### Follow-up

"Real models key lists: OpenConfig's interfaces and BGP neighbours are lists keyed by name or address, and neighbour keys are IP addresses that contain dots. How do you diff a keyed list so that adding one neighbour in the middle is one addition, not every later element changing, and how do you write paths that survive keys with dots? Then: you run this against 10,000 devices every five minutes, and almost every subtree is identical. How do you avoid walking all of it?"

## Solution

### The naive approach

Flatten each document into a map from leaf path to value, then compare the two maps: keys only in running are added, keys only in intended are removed, keys in both with different values are changed. That is a correct and common first version, and it costs `O(S)` for documents of total size `S`. It gets the rules wrong in three places, which is where the problem is:

- A missing subtree produces one entry per leaf. Example 1 would report `interface.swp5.bridge.access` instead of `interface.swp5`, and deleting a VRF with 200 settings floods the report with 200 lines that are one fact.
- Empty objects vanish, because they have no leaves: `"vlan": {}` versus no `vlan` key at all looks identical.
- A type change from object to scalar shows up as a removal of every leaf plus an addition of a new one, instead of one change.

You can patch each case onto the flattened maps, but the patches are the tree walk in disguise. Walk the tree.

### The insight

At any one level, the diff is a set comparison of two hash maps: the keys only in one, the keys only in the other, and the keys in both. Hash maps make each of those membership checks `O(1)`. The only question at a shared key is whether to descend, and the answer is "only when both values are objects". Everything else, including lists, is a leaf to compare. That makes the walk visit each key of the two documents once, and every missing subtree stops the walk at its root, which is exactly where it should be reported.

### The optimal approach

1. Keep a stack of `(path prefix, intended object, running object)` triples, starting with `("", intended, running)`. An explicit stack instead of recursion means a deeply nested document cannot hit a recursion limit.
2. Pop a triple. For every key in the union of the two objects' keys, build `path = prefix + key`:
   - key not in running → `removed`;
   - key not in intended → `added`;
   - both values are objects → push `(path + ".", a, b)`;
   - otherwise, if the values are not strictly equal → `changed`.
3. Strict equality: two booleans are equal if they are the same boolean; a boolean never equals a number; lists are equal if they have the same length and equal elements in order; objects are equal if they have the same keys and equal values; everything else compares by type and value.
4. Sort the three lists and return them.

```python
def _same(a, b) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):        # bool is a subclass of int
        return type(a) is type(b) and a == b
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):       # objects inside lists
        return a.keys() == b.keys() and all(_same(a[k], b[k]) for k in a)
    return type(a) is type(b) and a == b                  # 9216 is not "9216"


def config_drift(intended: dict, running: dict) -> dict[str, list[str]]:
    added, removed, changed = [], [], []
    stack = [("", intended, running)]
    while stack:
        prefix, want, have = stack.pop()
        for key in want.keys() | have.keys():
            path = prefix + key
            if key not in have:
                removed.append(path)                      # a missing subtree: once, at its root
            elif key not in want:
                added.append(path)
            else:
                a, b = want[key], have[key]
                if isinstance(a, dict) and isinstance(b, dict):
                    stack.append((path + ".", a, b))      # the only case that descends
                elif not _same(a, b):
                    changed.append(path)                  # includes object vs scalar
    return {"added": sorted(added), "removed": sorted(removed), "changed": sorted(changed)}
```

Trace Example 2. The root holds `vrf` and `evpn` on both sides. `vrf` is an object on both, so it is pushed. `evpn` is an object versus `true`, so `_same` returns `False` and `evpn` is changed without descending. Popping `vrf.`: `ACME` is on both sides and an object on both, so it is pushed; `GLOBEX` is missing from running, so `vrf.GLOBEX` is removed and its `l3vni` is never looked at. Popping `vrf.ACME.`: `l3vni` is `50001` on both sides, equal; `rd` exists only in running, so `vrf.ACME.rd` is added.

In JavaScript, use `Object.prototype.hasOwnProperty.call(obj, key)` (or `Object.hasOwn`) for membership, because `obj[key] === undefined` cannot tell a missing key from one you mistype, and test "is an object" as `v !== null && typeof v === "object" && !Array.isArray(v)`, since `typeof null` and `typeof []` are both `"object"`.

**Complexity.** Let `S` be the total number of keys and list elements in both documents and `D` the number of reported paths. Each key is examined once, with `O(1)` expected hash-map work, and each list element is compared at most once, so the walk is `O(S)`; sorting the output is `O(D log D)`. Building a path string costs its length, `O(depth)`, for every key visited (not only the reported ones), so the honest bound is `O(S · depth)`; with the 32-level limit that is still linear in `S`. Sorting compares strings of up to that length too. Space is `O(S)` in the worst case for the stack and output. A shortcut such as comparing `json.dumps(a, sort_keys=True)` for leaves also works (it writes `true` and `1` differently), at the cost of serialising every compared value.

### Common mistakes

- **Diffing flattened leaves.** Missing subtrees become one line per leaf, empty objects disappear, and an object replaced by a scalar becomes a removal plus an addition.
- **Python's `True == 1`.** `True == 1`, `False == 0` and `[True] == [1]` are all true in Python, so plain `!=` misses a boolean that a device returned as an integer. Check `bool` first, because `bool` is a subclass of `int`.
- **Treating `null` as missing.** `running.get(key) is None` cannot tell `"ntp": null` from no `ntp` key. Test membership with `in`.
- **Descending into lists.** Producing paths like `ntp.servers.1` makes a single inserted element look like every later element changed. The problem says lists are values; the follow-up is about doing better for keyed lists.
- **Natural sort.** `swp10` sorts before `swp2` and `Vlan100` before `eth0` in code-point order. Sorting "naturally" looks nicer and fails the comparison.
- **Reporting both a parent and its children.** If `vrf.GLOBEX` is removed, `vrf.GLOBEX.l3vni` must not appear too.

### How to discuss it

Start with the networking framing: intended versus running, and why a diff is the core of drift detection. Name the flattened-map approach and its three failures before writing anything, because it shows you thought about what the report is *for*: an operator reading it at 3 a.m. Then state the rule ("descend only when both sides are objects; everything else is a value") and the strictness rule, and write the stack walk. Trace the object-versus-scalar case, since it is the one most candidates get wrong. Close with complexity and the one-line note that normalisation belongs in a separate stage.

### Networking follow-ups

A network-org interviewer usually pushes from the algorithm towards what makes a drift tool usable.

- **"Lists of interfaces or neighbours."** In YANG models (the schema language behind OpenConfig and NETCONF), most lists are *keyed*: `interface[name=swp1]`, `neighbor[neighbor-address=10.255.1.101]`. Diff a keyed list by converting it to a map from key to element and recursing, so a new neighbour is one addition. Keep positional comparison only for lists whose order means something: ACL entries and route-map terms are evaluated top to bottom, so a reorder is a real change. NTP or DNS server lists are usually order-insensitive, which is a per-field schema decision, not a diff rule. The common wrong answer is one rule for all lists.
- **"Keys with dots."** A dotted path breaks the moment a key is `10.255.1.101`. Use a structured path (a list of segments) internally and render it in a standard encoding: JSON Pointer (RFC 6901) escapes `/` and `~`, and gNMI paths carry list keys explicitly as `interface[name=swp1]/config/mtu`.
- **"Most differences are noise."** Devices omit defaults (MTU 1500 is often not shown), abbreviate interface names, return numbers as strings and store secrets re-encrypted, so a plaintext password never matches. Normalise both sides into one canonical model before diffing, compare secrets by hash, and treat every noisy line as a tool bug, because a report full of noise is ignored along with the three real lines in it.
- **"Drift or pending change?"** A two-way diff cannot tell an engineer's hand edit from a change merged in the source of truth an hour ago and not yet pushed. A three-way comparison against the last configuration the automation successfully pushed separates them: running differs from last-pushed means drift; intended differs from last-pushed means pending. The platform should show both, in different colours, with the age of each drift.
- **"10,000 devices every five minutes."** Hash every subtree bottom-up (a Merkle tree) on both sides and store the intended hashes. Compare root hashes first and descend only where hashes differ, so an in-sync device costs one comparison. gNMI `ON_CHANGE` subscriptions let the device tell you when config changes instead of being polled, which turns the problem into processing deltas.
- **"Turn the diff into a push."** `added` paths on the device must be deleted, `removed` ones set, `changed` ones overwritten. A merge-mode push applies only sets, which is why the leftover VLAN in Example 1 survives; a replace-mode push (or explicit deletes) removes it. Order matters: delete a VLAN's interface references before the VLAN, and push a large deletion only behind a size limit, since an empty intent from a broken render would otherwise wipe the device. NETCONF's candidate datastore with commit-confirmed, covered in [configuration APIs](/learn/fabric-networking/operating-fabrics/configuration-apis), rolls the change back if the device stops answering.
- **"Who changed it?"** The diff says what, not who. Correlate a new drift with the device's accounting log (TACACS+ records each command and user) and with open incidents, because a drift opened within an hour of an incident is usually a deliberate fix that needs an owner and an expiry, not an automatic revert.

---
problem: config-drift
args: [{"vrf": {"ACME": {"l3vni": 50001, "arp-suppress": true}, "GLOBEX": {"l3vni": 50002}}, "evpn": {"enable": true}}, {"vrf": {"ACME": {"l3vni": 50001, "arp-suppress": 1, "rd": "10.255.1.11:50001"}}, "evpn": true}]
frames: 71
source: 440822a4673bc8bb
---
@0
Two configs for one leaf switch. The intended one has two VRFs, ACME and GLOBEX, each with a layer 3 VNI, and ACME turns ARP suppression on with the boolean true. Its EVPN section is an object holding enable, true. The running one has only ACME, with ARP suppression stored as the number 1 and an extra RD, a route distinguisher, and its EVPN is the bare value true. The insight: at each level, the diff is a set comparison of two hash maps. A key on one side only is reported once, right there. A key on both sides is descended into only when both values are objects; everything else is a value, compared strictly.

@1-4
Three empty result lists, and a stack holding one entry: an empty path prefix, the intended root and the running root. We pop the root and loop over the union of its keys: EVPN and VRF.

@5-10
First, EVPN. The path is just EVPN. It is in running, and it is in intended, so we take both values: an object on the intended side, the boolean true on the device. Are both objects? No. So instead of descending, we ask whether the two values are strictly the same.

@11-14
The strict comparison checks booleans first, because in Python a boolean is a kind of integer. One side is a boolean, so the types must match, and an object is not a boolean. It returns false, and EVPN goes into changed. Notice what does not happen: we never report EVPN dot enable as removed. An object replaced by a plain value is one change, at the key where it happened.

@15-22
Next key: VRF. It is on both sides, and both values are objects, so this is the one case that descends. We push a new entry with the prefix VRF dot and the two VRF maps. Nothing is reported for VRF itself.

@23-25
The loop over the root ends. The stack is not empty, so we pop the VRF entry. Its keys are GLOBEX and ACME.

@26-28
GLOBEX. The path is VRF dot GLOBEX, and running has no such key. That is a removal, recorded once, here, at the root of the missing subtree. The VNI underneath it is never looked at, so the report states one fact, not one line per setting.

@29-36
ACME is on both sides and an object on both, so we push VRF dot ACME dot, with the two ACME maps.

@37-39
Pop it. Its keys are RD, ARP suppress, and the layer 3 VNI.

@40-44
RD. The path is VRF dot ACME dot RD. It is in running but not in intended, so it goes into added: the device has something the intent never asked for.

@45-50
ARP suppress. Both sides have it. Intended says true; running says 1. Neither is an object, so we compare them as values.

@51-55
This is the trap the problem is built around. In Python, true equals 1, so a plain equality check would call these the same and miss the drift. The strict comparison sees a boolean, demands the same type on both sides, and a boolean is not an integer. False, so VRF dot ACME dot ARP suppress joins EVPN in changed.

@56-67
The layer 3 VNI: 50001 on both sides. Not a boolean, not a list, not an object, so the last rule applies: same type and same value. Both are integers, both 50001. They match, and nothing is recorded.

@68-70
The stack is empty, so the walk is over. Each list is sorted and the result comes back. Added: VRF dot ACME dot RD. Removed: VRF dot GLOBEX. Changed: EVPN, and VRF dot ACME dot ARP suppress.

Every key is examined once with constant-time hash lookups, so the walk is linear in the total size of both documents, plus sorting the reported paths; building path strings adds a factor of the depth, which the 32 level limit keeps small. The mistakes this problem is known for: flattening both trees into leaf paths, which turns a missing subtree into a line per leaf; trusting Python's true equals 1; treating a null value as a missing key; and descending into lists.

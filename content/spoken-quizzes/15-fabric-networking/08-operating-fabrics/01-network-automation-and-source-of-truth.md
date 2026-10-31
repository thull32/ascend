---
lesson: network-automation-and-source-of-truth
source: 430a5f4787d83688
---
## 1

The source of truth no longer contains Acme's staging segment, VLAN 300 on VNI 10102. The automation renders leaf1's configuration in Amsterdam and pushes it in merge mode, and the push reports success. What is on the device afterwards?

A, the push is rejected, because VLAN 300 conflicts with the render. B, VLAN 300 is removed, because the render no longer contains it. C, VLAN 300 is disabled but kept, because merge marks absent lines inactive. D, VLAN 300 is still configured, because merge only sets the paths it names.

[think]

The answer is D: VLAN 300 is still configured, because merge only sets the paths it names.

A merge adds or overwrites every setting the payload names and leaves everything else alone, and a render can only name what exists. VLAN 300 is not named, so it stays, and the device keeps advertising its EVPN type-3 route. Removing it needs an explicit delete computed from a diff against running, or a replace of the section. Nothing conflicts and nothing is marked inactive: the push succeeded exactly as designed.

## 2

A tool decides which running paths it may delete by checking whether each path starts with a managed prefix. It manages the prefix interface slash swp5. Which running path would it wrongly treat as its own?

A, interface slash swp5 slash access VLAN, because swp5 is managed. B, interface slash swp51 slash MTU, because swp51 sorts before swp52. C, VLAN slash 300 slash VNI, because swp5 references VLAN 300. D, interface slash swp52 slash MTU, because the string starts with swp5.

[think]

The answer is D: interface slash swp52 slash MTU, because the string starts with swp5.

That path begins with the characters interface slash swp5, so a bare prefix test claims it. Ownership must be checked on segment boundaries: the path equals the prefix, or starts with the prefix followed by a slash. The swp5 access VLAN path is genuinely owned. The VLAN path does not start with the prefix at all, and neither does swp51; sort order is irrelevant.

## 3

The nightly diff shows the IS-IS metric on leaf1's port swp52 at 1000 on the device and 10 in the source of truth. An engineer set it by hand during an incident. What should the platform do?

A, ignore it, because IS-IS metrics are operational state, not configuration. B, revert it automatically, because the source of truth always wins. C, raise it as drift, for the owner to revert or to record as an exception. D, update the source of truth to 1000, because the device reflects reality.

[think]

The answer is C: raise it as drift, for the owner to revert or to record as an exception.

Either side can be right: the override may still be needed, with the optic still failing, or be stale, with the optic replaced. A person decides, and the platform records the decision: a revert, or an exception with an owner and an expiry so the diff stops reporting it until then. Automatic revert can undo an emergency fix mid-incident, and blindly adopting the device's value turns every manual change into intent. The metric is configuration, not operational state.

## 4

A source-of-truth query times out and returns leaf1 with no segments. The automation renders and pushes the VLAN and EVPN sections in replace mode. What happens, and what guard prevents it?

A, only new VLANs are blocked, and the existing ones are kept until a merge. B, every VLAN on the leaf is deleted, and a limit on deletions per push stops it. C, the device rejects the replace, because empty sections are invalid on every network operating system. D, nothing changes, because replace mode skips sections whose payload is empty.

[think]

The answer is B: every VLAN on the leaf is deleted, and a limit on deletions per push stops it.

Replace makes the payload the complete content of the section, so an empty section means delete everything in it, and every tenant on the leaf loses connectivity. The diff is correct given its input. The fix is a circuit breaker in front of the push that refuses deletions above a threshold without a person's approval. Devices do not treat empty payloads specially, and replace does not fall back to merge.

## 5

How do you show that an automation run is idempotent?

A, run it once and check that the push reported no errors. B, run it twice and confirm that the second diff and the second push are both empty. C, compare the rendered configurations of two devices with the same role. D, use only declarative tools, which are idempotent by definition.

[think]

The answer is B: run it twice and confirm that the second diff and the second push are both empty.

Idempotency means a second run with unchanged intent changes nothing, so the test is to run, read back, render again and confirm the diff and the push are empty. A declarative tool can still fail it through unstable renders, such as timestamps or unordered iteration, appends without sequence numbers, or gaps in normalisation. A clean first push says nothing about the second, and comparing two devices tests consistency, not idempotency.

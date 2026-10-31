---
lesson: configuration-apis
source: 1b3b3c0579d53d72
---
## 1

The automation commits a new management access list to leaf1 in Amsterdam with commit confirmed, a 120 second timeout and a persist token. The list has a typo that blocks the automation's own address. What happens if nobody intervenes?

A, the change stays until an engineer removes it from the console, as with a plain commit. B, the device rolls back the instant the automation's NETCONF session times out. C, the commit is refused, because validation rejects an access list that blocks its own client. D, the device rolls back to the previous revision when the 120 second timeout expires.

[think]

The answer is D: the device rolls back to the previous revision when the 120 second timeout expires.

With persist, the pending confirmed commit survives the session, so the rollback comes from the timer, at 120 seconds. Without persist, it would roll back as soon as the session ended. Validation cannot catch the typo: 172.16.0.2 slash 32 is a well-formed prefix, and YANG checks form, not intent. A plain commit, not a confirmed one, is what would leave the change in place.

## 2

A gNMI Set request contains a replace at the path holding all access-list sets, and its value holds only the new MGMT-IN list. The device also had an SNMP-IN list. What is the result?

A, SNMP-IN is kept until a separate delete for its path is sent in another request. B, SNMP-IN is deleted, because replace makes the value the whole content at that path. C, the request is rejected, since a replace may not remove an existing list. D, MGMT-IN is replaced and SNMP-IN is kept, since the value does not mention it.

[think]

The answer is B: SNMP-IN is deleted, because replace makes the value the whole content at that path.

Replace means the value is the complete new content at the path, so every sibling the value omits is deleted. Keeping unmentioned siblings is what update does, because update merges. Nothing in gNMI forbids the deletion. The fix is to replace at the narrowest path that holds the change: the MGMT-IN list itself.

## 3

An orchestrator commits 7 leaves one after another with commit confirmed and a 60 second timeout, runs a 45 second network check, then confirms them in order. Some commits take 6 seconds. Afterwards, three of the first leaves are on the old revision. Why?

A, the network check failed on those leaves, so the orchestrator rolled them back on purpose. B, their confirming commits were rejected because the network check held a lock on them. C, commit confirmed allows only one pending commit per site, so earlier ones were cancelled. D, their timers started at their own commits and expired before the confirms reached them.

[think]

The answer is D: their timers started at their own commits and expired before the confirms reached them.

Each device's timer starts when that device commits. The first leaves committed tens of seconds before the last, so by the end of the check their 60 second windows had closed and they rolled back by themselves. Pending commits are per device, and verification takes no locks. Preparing every candidate first and committing them together starts every timer within one round trip.

## 4

On a SONiC leaf, a tool writes VLAN 300 into CONFIG DB and gets success. Which check best shows the VLAN is actually in force?

A, running config save and confirming that the saved config file contains the VLAN. B, reading the VLAN key back from CONFIG DB and comparing every field. C, reading the VLAN's state in STATE DB, which daemons write after acting. D, confirming the Redis write returned OK and the CONFIG DB key count grew.

[think]

The answer is C: reading the VLAN's state in STATE DB, which daemons write after acting.

CONFIG DB holds what was asked for. The manager daemons, the orchestration agent and syncd act on it asynchronously, and STATE DB records what actually came up. Reading CONFIG DB back, or saving it to disk, only proves the request was stored, which the successful write already told you.

## 5

Two automation jobs each need NETCONF locks on leaf1 and leaf2. Job A locks leaf1, then leaf2. Job B locks leaf2, then leaf1. Each retries a denied lock until it succeeds. Sometimes both wait forever. What is the simplest fix?

A, add a random delay before each retry of a denied lock. B, skip locking and rely on the commit being atomic on each device. C, use commit confirmed so that stuck locks expire with the timer. D, take the locks in one global order, such as sorted device names.

[think]

The answer is D: take the locks in one global order, such as sorted device names.

Each job holds one lock and waits for the other's: a lock-ordering deadlock. If every job locks devices in the same order, the second job waits at its first lock instead of holding half. A random delay does not help, because each job keeps holding its first lock while it waits. The confirm timer governs a pending commit, not a lock, and dropping locks lets someone else's edits mix into your candidate.

## 6

A tool patches its rendered YAML, which no longer contains VLAN 300, into an NVUE revision and applies it. The device still has VLAN 300 afterwards. Why?

A, the revision was applied but not saved, so the old startup VLANs came back. B, the apply is asynchronous, and the deletion takes several minutes to appear. C, NVUE refuses to delete VLANs that still have member ports configured. D, a patch into an NVUE revision merges, so removal needs an explicit unset.

[think]

The answer is D: a patch into an NVUE revision merges, so removal needs an explicit unset.

An NVUE patch adds and overwrites what it names and leaves everything else alone, so absence never deletes. The tool must send an unset for the path, usually as a separate patch into the same revision. Apply is asynchronous but completes in seconds, and saving affects what loads at boot, not the applied revision.

---
lesson: configuration-apis
source: 0bbad51d55853a66
fit: great
desk:
  - "The confirmed-commit visualisation: the MGMT-IN typo on leaf1.ams rolled back at 120 seconds, and the happy path with the confirming commit"
  - "The YANG statements table and the validator code with its output"
  - "The NETCONF datastore and operation tables, and the edit-config example"
  - "The confirmed-commit simulator and its three runs, read row by row"
  - "The gNMI Set code and its four cases"
  - "The NVUE REST flow, the SONiC database table, the read-back output and the change-methods table"
  - "The multi-device orchestrator, its timing output and the sequence diagram"
  - "The interface comparison table and the failure-modes table"
---
## Introduction

The automation server at Meridian has to tighten one access list on 24 devices in Amsterdam. Over SSH, with a script typing CLI lines, that is 24 small gambles. Line 7 of 12 may fail after lines 1 to 6 took effect. The next software release may print the output the script parses differently. An engineer may be editing the same list at the same moment. And if the new list blocks the server's own address, the script loses the device with no way back in.

None of those risks comes from the change. They come from the interface. A configuration API removes them: the change becomes data that follows a schema, applied as a transaction that succeeds or fails whole, with a lock against other editors and, at its best, a timer that undoes the change unless the tool confirms it still has control.

The plan: what a CLI cannot give a program, and YANG, the schema. NETCONF and confirmed commit, told as a lockout. gNMI and OpenConfig. NVUE and SONiC. And what transactional means when no device can commit for another.

## CLI scraping and YANG

CLI scraping is a program pretending to be a person: open SSH, wait for a prompt, send a line, and pull values out of the reply with regular expressions. It works on every device, which is why it never quite goes away. Its costs: no structure, so a regex silently finds nothing when a new release changes the output, and the tool reports no errors because it found none. No transaction, so a push that fails at line 7 leaves lines 1 to 6 live in a state nobody reviewed. No structured errors, and no protection against a concurrent editor. Arista's eAPI, CLI commands as JSON over HTTPS, fixes parsing, not transactions.

The modern APIs grew out of an operators' workshop in 2002 that asked for what the CLI lacked: configuration separated from state, transactions, and formats tools can diff. YANG is the schema half. It describes the tree of configuration and state a device holds, the way a database schema describes rows: keyed lists, typed leaves, references that work like foreign keys, and constraints such as "an interface's access list must contain a permit". Models come from the IETF, from operators as OpenConfig, and from each vendor.

So a device can validate a change before applying it. The intended entry in our access list was 172.16.0.20 slash 32, the automation server's own address. The input had a typo: 172.16.0.2 slash 32. Does validation catch it?

[pause]

No. That is a perfectly typed prefix, so validation passes, and the change would lock the automation out of leaf1 in Amsterdam. Here is the sentence to remember: validation proves a configuration is well formed, never that it is what you meant. Only a check the tool runs itself, "does this list still admit me and the jump hosts?", catches it.

## NETCONF and the lockout

NETCONF runs as an SSH subsystem on TCP port 830, carries XML, and grew out of Juniper's XML API, which is why it matches Junos so closely. Every request gets a reply holding OK, data, or a machine-readable error naming the offending element.

The key idea is datastores, complete copies of the configuration. Running is what is in force. Candidate is a scratch copy where edits accumulate while nothing on the device changes. Startup is what loads at boot. The split between candidate and running is the transaction: a change of any size is built in the candidate, validated, and committed in one step, atomically.

A lock on the candidate gives one session exclusive write access; anyone else gets an error naming the holder's session. A lock dies with its session, so a crashed tool cannot leave a device locked forever. But a hung session whose connection is still alive keeps its lock until someone kills it.

Atomic is not safe, though. The typo commits cleanly and still cuts the tool off. Confirmed commit makes the commit a trial. The device makes the new revision live, keeps the old one as a rollback point, and starts a timer. The tool verifies, then a second, plain commit confirms. If the timer runs out first, the device restores the old configuration by itself. The standard's default is 600 seconds; Junos defaults to 10 minutes.

Now the story. The automation locks leaf1, edits the candidate with the typo, validates, which passes, and at 0.4 seconds commits confirmed with a 120 second timeout and a persist token. Revision 42 is live. At 3.4 seconds the tool tries to verify, and its request is silently dropped, because revision 42 no longer admits its address. Its attempt to close the session is dropped too, so leaf1 decides when the session is dead: at 33.4 seconds, after 30 seconds of unanswered SSH keepalives. The lock is released, but thanks to the persist token, the pending commit survives. A reconnect at 60.4 seconds is dropped as well. At 120.4 seconds the timer fires and leaf1 restores revision 41 on its own. Nobody went to a console.

Without persist, the rollback comes the moment the device notices the dead session, 87 seconds sooner here. But a tool whose session merely dropped would then lose a good change; with the token, any new session can confirm or cancel. Either way, the timer is the backstop.

Two limits. Confirmed commit does not limit damage: revision 42 was in force for 120 seconds, and a change that broke traffic would have broken it that long. And it catches only what verification tests. Size the timeout as commit plus verification plus margin. The signal is the device's log line saying the confirmed commit timed out and rolled back. Alert on it, because the tool may have recorded that change as done.

## gNMI and OpenConfig

gNMI came out of the OpenConfig operator group in the mid-2010s: one protocol for configuration and streaming state. It runs over gRPC, HTTP/2 carrying Protocol Buffers, with TLS. It has four calls: Capabilities, Get, Set and Subscribe, and it addresses everything by a path with keys, like the access list MGMT-IN, entry 10, source address.

A Set request applies all deletes, then all replaces, then all updates, as one transaction: if any part fails, none takes effect. Update merges. Replace makes the value the entire content at that path. So: a device has two access lists, MGMT-IN and SNMP-IN, for the monitoring system. The tool sends a replace at the level holding all access lists, with a value containing only the new MGMT-IN. What happens to SNMP-IN?

[pause]

It is deleted. The value is right and the path is one level too high, so the replace removes every sibling the value does not name. That is the classic gNMI accident. Replace at the narrowest path that holds the change, the MGMT-IN list itself.

Base gNMI has no candidate and no confirmed commit: on most platforms a successful Set goes straight to running. A commit-confirmed extension exists, but support varies, so a tool that needs the safety net must check, or keep an out-of-band path to the device.

Subscribe is why many operators adopted gNMI. An on-change subscription to the configuration tree turns drift detection from a nightly poll into an event: a manual edit on leaf1 reaches the automation within seconds. Streaming telemetry is the next lesson's subject.

OpenConfig's signature is the config and state split. Every configurable node has a config container, what you asked for, and a state container, what the device runs. Set the MTU to 9216 under config, then read it under state: the cheapest verification a tool has. Coverage is partial, and an unsupported leaf may be accepted and silently ignored. Read the vendor's deviations, and read back state.

## NVUE and SONiC

On Cumulus Linux 5, NVIDIA's operating system for its Spectrum switches, configuration goes through NVUE, not NETCONF. The whole configuration is one object tree, in JSON or YAML, through the CLI or a REST API. The unit of change is a revision: create a pending one, patch it, diff it against the applied one, apply, and poll until it reads applied.

Four differences matter. A patch merges, so leaving a block out never deletes it; removal needs an explicit unset in the same revision. Apply is asynchronous, and it reloads the services whose configuration changed, which can drop BGP sessions. There is no lock, so the tool must serialise changes per device itself. And YAML bites: NVUE wants the strings on and off, which unquoted YAML reads as booleans.

SONiC connects its containers through Redis databases. Configuration goes into CONFIG DB. Manager daemons act on it, the orchestration agent turns their requests into calls on the switch abstraction interface, and syncd programs the chip. Daemons then record what actually came up in STATE DB. That pipeline is asynchronous: a write to CONFIG DB returns as soon as Redis stores it, long before the chip is programmed. Config accepted and config in force are different events, and only STATE DB shows the second.

The ways to change it differ exactly where it hurts. Config load merges a file, so keys absent from it stay. Config reload flushes everything and restarts services, and the switch stops forwarding meanwhile. Config replace and apply-patch go through the Generic Config Updater, which computes a patch, validates it against SONiC's YANG models, and can checkpoint and roll back, but only when the tool decides; no timer does it. Forget config save, and a reboot loses every change.

## Change across many devices

Every interface so far gives a transaction on one device. Leaf1 cannot commit leaf2's candidate, and between the first commit and the last, the network runs a mix of old and new configuration. Atomic across the fabric is not on offer, so every intermediate state must be safe.

The shape that works borrows from two-phase commit. Prepare every device first: lock, edit, validate, with nothing live and no timer running. One refusal aborts with nothing changed. Then commit confirmed a batch, verify the network, and confirm. The timer is each device's default decision, which avoids two-phase commit's worst case, participants stuck in doubt behind a dead coordinator. The price: a late confirm is lost, and that device alone rolls back.

Timing is where it fails. The change goes to all 16 Amsterdam leaves in batches of 1, 7 and 8, with a 60 second timeout and a 45 second network check per batch. Most leaves take 2 seconds to commit; three large ones take 6. First, the orchestrator commits one leaf after another. In batch 2, leaf2 commits at 49.2 seconds, so its deadline is 109.2. Leaf8 commits at 73.2. Verification ends at 118.2, and the confirms go out from 118.4. What happened to leaf2?

[pause]

Its timer had expired, and so had those of leaf3 and leaf4. Leaf5 made it by 0.2 seconds. Three leaves rolled back while the batch passed, 13 of 16 ended on the new revision, and a tool that ignores each confirm's reply records 16 of 16. Prepare in parallel and commit together instead, and every leaf gets the same 15 second margin: 16 of 16.

Four rules. Make before break: to move Acme to a new route target, add the new import everywhere, then switch the export, then remove the old import. Size the timeout from measured commit and verification times. Read back every device, because a confirm sent to a device that already rolled back may, on some platforms, commit whatever the candidate now holds. And lock devices in one global order, such as sorted names, or two tools can each hold half and wait forever.

## In the interview

A principal engineer asks: what does confirmed commit protect you from, and what not?

[pause]

It protects against a change that destroys the tool's ability to confirm it, such as a lockout. It does not limit damage during the timeout, and it catches only what verification tests: a change that breaks BGP but keeps management access is confirmed unless the check looks at BGP. The wrong answer is "it rolls back any bad change".

And: how do you push one change to 500 devices atomically? You cannot. Each device commits alone. So make every intermediate state safe, prepare everything before any timer starts, commit confirmed in batches after a canary, verify network-wide, confirm, read back, and make re-runs idempotent.

## Recap

Five things to remember. Well formed, atomic and safe are different: validation gives the first, commit the second, and only confirmed commit plus real verification the third. Confirmed commit with persist undoes a lockout by timer, but the change is live until then. A replace deletes everything at its path that the value omits. Accepted is not in force: read OpenConfig state, SONiC's STATE DB, or the revision state. And across many devices there is no transaction: prepare first, commit together, verify the network, read back.

At your desk: the confirmed-commit visualisation, the validator, the NETCONF tables, the simulator's three runs, the gNMI Set cases, the NVUE and SONiC tables, the multi-device timing code, and the comparison and failure tables.

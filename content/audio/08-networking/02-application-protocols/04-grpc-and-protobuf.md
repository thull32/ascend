---
lesson: grpc-and-protobuf
source: 4117d00a5a77b785
fit: partial
desk:
  - "Varints, ZigZag and the 42-byte Title message encoded byte by byte"
  - "The Python decoder, and the schema-evolution table"
  - "The frames of one unary call, and the deadline budget table"
  - "The retry service config, its backoff formula, and the status-code mapping"
  - "Exercises: encode a varint, a ZigZag sint64, and a whole message"
---
## Introduction

Before a launch you scale the recommendations service from 3 pods to 12. The dashboards show three pods at 90 percent CPU and nine new ones idle. An hour later, one of the hot pods stalls on a slow dependency, and the checkout service that calls it stops responding altogether, because none of its gRPC calls has a deadline and every worker is waiting on a response that will never come.

Both incidents are gRPC working as designed. HTTP 2 puts every call from a client onto one long-lived connection, so a balancer that routes connections rather than requests pins all the traffic to the pods that existed when the connections opened. And gRPC, like most RPC stacks, waits forever unless told otherwise. gRPC is an excellent default between services. The price is knowing what it does on the wire.

The plan: what protobuf actually puts on the wire, and why the schema rules follow from it. Then what a call looks like on HTTP 2. Then deadlines, retries, and that load-balancing trap.

## Why a binary protocol

JSON over HTTP 1.1 has four costs between services. Field names travel in every message. Numbers are text to parse. Nothing checks the contract before production. And one connection carries one request at a time. gRPC replaces each: a protobuf schema that generates typed clients and servers in a dozen languages, a compact binary encoding, HTTP 2 streams, and deadlines and cancellation on every call. You give up readability, direct browser support and HTTP caching.

In a protobuf schema each field has a name and a number, and the numbers are the contract. Names exist only in generated code. On the wire, each field is a tag followed by a value, and the tag combines the field number with a wire type, which says how the value is laid out: a variable-length integer, a fixed 4 or 8 bytes, or a length followed by that many bytes.

The wire type is what lets a decoder skip a field it does not know. An old client that receives field 7 reads the tag, sees a length-delimited value, reads the length and jumps over it. That one property is the basis of schema evolution.

## Protobuf on the wire

Integers are varints: 7 bits per byte, least significant group first, with the top bit of each byte meaning "more follows". Values under 128 take one byte, values under about 16 thousand take two, and 300 becomes two bytes.

Put together, the lesson's example, a TV title with an ID, a name, two genres, a runtime, three season years and a nested rating, encodes to 42 bytes. Compact JSON for the same object is 136 bytes, 3.2 times larger. But be careful with that ratio. For a list of 100 such titles, protobuf was about 4.9 kilobytes against 14 for JSON. After gzip, about 1 kilobyte against 1.2. Compression recovers most of JSON's repeated field names, so protobuf's lasting advantages are parse CPU, the typed contract, and a smaller uncompressed wire, not a tenfold bandwidth saving.

One subtlety. Strings, raw bytes, nested messages and packed lists all share the length-delimited wire type. The decoder cannot tell them apart; only the schema can. That is why a schema registry matters for data at rest.

Negative numbers have a trap. A plain int32 field encodes a negative value as a 64-bit two's complement, so minus 1 takes ten bytes. The sint32 and sint64 types first apply ZigZag, which interleaves the signs: 0, minus 1, 1 and minus 2 map to 0, 1, 2 and 3. Now minus 1 is one byte. Use sint for fields that are often negative, such as deltas and offsets, and int for IDs and counts.

A few more rules follow from the encoding. Field numbers 1 to 15 have one-byte tags, so give the hottest fields the small numbers. Default values are not sent: in proto3, a zero, an empty string or false is simply left out, so the receiver cannot tell zero from unset. A discount of zero and a missing discount look identical. Declare the field optional when that difference matters. And when a singular field appears twice, the last value wins, so concatenating two encoded messages merges them.

## Evolving a schema

Because fields are identified by number and unknown fields are skipped, old readers can read new data and new readers can read old data, if you follow the rules. Adding a field with a new number is safe. Removing one is safe only if you reserve its number and its name. Renaming is safe for binary but not for JSON, which uses names. Changing int32 to sint32 is not safe: same wire type, different meaning.

So try this one. A team deletes an integer field, number 7, and a month later adds a string field, also number 7. What goes wrong?

[pause]

Old writers, cached payloads and events sitting in queues still carry field 7 as an integer, and new code expecting a string misreads or rejects them. Old readers misread the new messages too. When a reused number keeps the same wire type, the damage is silent. The compiler cannot catch it unless you recorded the history with reserved. So reserve removed numbers and names, roll out readers before writers, and run a breaking-change check, such as buf, in CI against the last release. Breaking changes go into a new package, a version 2, served alongside the old one.

Unknown-field preservation makes chains of services safe. A service built on an old schema that reads a message, changes one field and writes it back keeps the fields it does not understand. A JSON round trip drops them.

## A call on HTTP 2

A unary call is one HTTP 2 stream. The client sends headers: the method POST, a path naming the service and the method, a gRPC content type, and a grpc-timeout. Then a data frame with the request. Each message carries a 5-byte prefix, a compressed flag and a length, so several messages can share one stream. The server answers with headers, then the response data, then trailers carrying grpc-status.

The status comes last, because a streaming call only knows whether it succeeded after its last message. Two consequences. The HTTP status is 200 even for failed calls, so a dashboard built on HTTP codes reports 100 percent success while every call returns unavailable. And anything that cannot read HTTP 2 trailers, such as browser fetch and many HTTP 1.1 proxies, cannot speak gRPC natively. That is why gRPC-Web and Connect exist, and why a proxy that downgrades to HTTP 1.1 towards the backend breaks gRPC.

There are four call shapes: unary, server streaming for watches and feeds, client streaming for uploads, and bidirectional. Each stream has its own flow-control window, so a slow consumer applies backpressure to its own stream only, and other calls on the connection carry on. A server-streaming handler that ignores that backpressure and buffers in memory is how one slow client becomes an out-of-memory crash.

## Deadlines and retries

A call without a deadline waits until the server answers or the connection dies, and a connection to a hung process does not die. Most gRPC libraries default to no deadline. Set one on every call, and pass the incoming context downstream.

The deadline travels as a relative timeout, so clock skew between machines does not matter: each hop sends what remains. Picture a 300-millisecond budget at the edge. The edge spends 10 milliseconds on auth and sends 290 to service A. A spends 40 on its database and sends 250 to B. B spends 30 and sends 220 to C, which is stuck on a slow dependency. At 300 milliseconds the edge gives up and cancels its stream. That cancels A's context, which cancels B's call, which cancels C's, so no hop keeps working for a caller that has left. A hop that wants to answer with a fallback passes on less than it has. A sending 230 instead of 250 keeps 20 milliseconds to answer with cached data.

Which failures should be retried? Unavailable is the canonical retryable code: the call was not processed, or the server is shutting down. Resource exhausted, later, with backoff. Deadline exceeded only for idempotent methods with budget remaining. Invalid argument, not found and permission denied, never.

Then put a budget on the retries themselves. gRPC's retry throttling gives a client 10 tokens. Each failure costs 1, each success earns back a tenth, and retries stop while the count is at or below 5. In a total outage, retrying stops after five failures, so retries cannot triple the load on a service that is already down, and they resume only as successes lift the count back above 5.

## The load-balancing trap

Back to the three hot pods. The callers reached the service through a Kubernetes ClusterIP service, which balances at layer 4: it picks a pod once per TCP connection. Every call since has been a new stream on an existing connection, so new pods get traffic only when a client opens a new connection, which may be never. Restarting the hot pods does not help; it re-pins the new connections just as unevenly.

The fixes move the decision to the request. A layer 7 proxy, such as Envoy, Linkerd or a mesh sidecar, terminates HTTP 2 and balances each stream. Or client-side balancing: the client resolves every pod's address, keeps a connection to each, and picks per call with round robin. And as a mitigation, not a balancer, a maximum connection age on the server: after, say, five minutes the server sends GOAWAY, clients reconnect, and connections spread out over time.

## In the interview

The lesson's follow-up: is it safe to retry deadline exceeded?

[pause]

Only for idempotent methods, and only with budget remaining, because the server may already have done the work. Unavailable is the canonical retryable code, and retries need a budget such as retry throttling. The wrong answer is "yes, a timeout means it failed".

And the other classic: how should deadlines work across three services? Set one at the edge, pass the context so each hop sends the remaining budget, keep a reserve for fallbacks, and rely on cancellation to stop downstream work. The wrong answer is giving every hop 300 milliseconds, which lets the chain outlive its caller.

Finally, when to choose gRPC at all. Internal, high-volume, multi-language and streaming traffic: gRPC. Public APIs, browsers and CDN-cacheable reads: REST, since every gRPC call is a POST with no HTTP caching. Large organisations commonly run both, generated from one protobuf contract.

## Recap

Five things to remember. Field numbers are the contract, so never reuse one: reserve it. Protobuf is compact, 42 bytes against 136, but gzip closes most of that gap, and the lasting wins are parse CPU and a checked contract. Status lives in trailers, so monitoring must read grpc-status, not HTTP codes. Set a deadline on every call, pass the remaining budget down, and retry only what is safe, under a budget. And long-lived HTTP 2 connections defeat layer 4 balancing, so balance per request.

At your desk: the varint, ZigZag and 42-byte message encodings, the decoder and the schema-evolution table, the frames of one call and the deadline table, the retry config, and the three encoding exercises.

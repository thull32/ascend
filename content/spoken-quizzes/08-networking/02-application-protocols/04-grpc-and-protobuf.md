---
lesson: grpc-and-protobuf
source: 75532830fc22d99a
---
## 1

After scaling a gRPC service from 3 to 12 pods behind a Kubernetes ClusterIP service, only the original 3 pods receive traffic. What is the cause?

A, ClusterIP picks a pod per connection, not per call. B, gRPC clients cap each service at three backends. C, each pod caches its own copy of the protobuf schema. D, the new pods are failing their readiness checks.

[think]

The answer is A: ClusterIP picks a pod per connection, not per call.

A layer 4 balancer such as ClusterIP decides once per TCP connection. gRPC multiplexes every call as a stream over long-lived HTTP/2 connections that were opened when only 3 pods existed, so the new pods get nothing until clients reconnect. Per-request balancing, through a layer 7 proxy or client-side round robin over all the pod addresses, or a server-side maximum connection age, fixes it.

## 3

A field that is often minus 1 is declared as an int32. How many bytes does the value minus 1 take on the wire, not counting the tag, and what would it take as an sint32?

A, 4 bytes as int32, 1 byte as sint32. B, 10 bytes as int32, 2 bytes as sint32. C, 1 byte as int32, 1 byte as sint32. D, 10 bytes as int32, 1 byte as sint32.

[think]

The answer is D: 10 bytes as int32, 1 byte as sint32.

An int32 encodes a negative value as a sign-extended 64-bit number, which needs the maximum of ten varint bytes. An sint32 applies ZigZag encoding first, mapping minus 1 to 1, which is a single byte. A fixed four bytes would be the fixed-width signed type, a different type altogether.

## 4

A team removes a deprecated integer field, legacy score, numbered 7, and a month later adds a string field, region, also numbered 7. What goes wrong?

A, the new field is silently ignored by every client. B, old field 7 integers are misread as the new string. C, nothing, since a number is free once its field is gone. D, the protobuf compiler refuses to compile a schema that reuses 7.

[think]

The answer is B: old field 7 integers are misread as the new string.

The wire identifies fields only by number and wire type. Old writers, cached payloads and events in queues still carry field 7 as an integer, which new code expecting a string will misread or reject, and old readers will misinterpret new messages. Reserving removed numbers and names makes the compiler reject reuse; it cannot know the history unless you record it.

## 5

A dashboard built on the load balancer's HTTP status codes shows 100 percent success for a gRPC service, while clients are receiving errors. Why?

A, failures arrive as HTTP 200, with a non-zero gRPC status. B, the clients are misreporting their own call errors. C, gRPC sends its errors over a separate connection. D, the load balancer is caching successful responses.

[think]

The answer is A: failures arrive as HTTP 200, with a non-zero gRPC status.

The call's status is only known at the end of the stream, so it travels in the gRPC status trailer. An HTTP 200 means only that the HTTP exchange worked. Infrastructure and metrics must understand gRPC, and read that trailer, to see failures.

## 6

The edge sets a 300 millisecond deadline, spends 10 milliseconds, and calls service A. A spends 40 milliseconds and calls service B. What timeout should A pass to B, and what happens to B's work if the edge gives up?

A, 300 milliseconds, and B finishes its work even after the edge gives up. B, about 250 milliseconds, and the cancellation propagates so B stops. C, no timeout, because B should always complete what it started. D, about 250 milliseconds, and B keeps working until its own budget ends.

[think]

The answer is B: about 250 milliseconds, and the cancellation propagates so B stops.

A received about 290 milliseconds and has used 40, so it passes on the remainder, less any reserve it keeps for a fallback. When the edge's deadline fires, it cancels its stream, A's context is cancelled, and that cancellation travels on to B as a stream reset, so B stops rather than working for a caller that has left. A fresh 300 milliseconds per hop, or no deadline at all, lets the chain outlive the request.

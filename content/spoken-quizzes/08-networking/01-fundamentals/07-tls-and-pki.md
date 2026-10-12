---
lesson: tls-and-pki
source: 5f6d626cd6f0edf7
---
## 1

After a certificate renewal, the website loads in Chrome, but a Go service calling the same API fails with "certificate signed by unknown authority". An OpenSSL client connection shows only one certificate in the chain. What is wrong?

A, the Go service's clock is wrong, so the certificate looks invalid. B, the renewed certificate expired before it was deployed. C, the server omits the intermediate certificate. D, the Go service needs a newer TLS version to connect.

[think]

The answer is C: the server omits the intermediate certificate.

A single certificate in the chain means the intermediate is missing. Chrome fetches it from the address in the certificate, and Firefox preloads intermediates, which masks the problem. Go, Java, curl, Python and mobile clients require the server to send it, so they cannot build a path to a trusted root. An expired or not-yet-valid certificate would produce a date error, not "unknown authority". Serve the full chain.

## 2

In a captured TLS 1.3 handshake, the server's second flight is a single record whose header reads hex one-seven, then zero-three, zero-three, then a two-byte length. What does that header tell an observer?

A, that the record holds the server's certificate in readable form. B, that the record is application data from the HTTP response body. C, only a length, because every encrypted record is labelled application data. D, that the connection negotiated TLS 1.2, since the version bytes read zero-three, zero-three.

[think]

The answer is C: only a length, because every encrypted record is labelled application data.

From the server hello on, TLS 1.3 wraps everything in records whose outer type says application data, with the legacy version number, and the real content type is the last byte inside the ciphertext. That record held the encrypted extensions, the certificate, its signature and the finished message, under the server's handshake key, so the certificate is not readable, unlike in TLS 1.2. The version field says nothing about the negotiated version, which is carried in an extension.

## 3

Why does a full TLS 1.3 handshake need one round trip, where TLS 1.2 needed two?

A, TLS 1.3 runs over UDP, so it has no TCP handshake. B, the client sends its key share in its first message. C, TLS 1.3 piggybacks on the TCP handshake packets. D, TLS 1.3 skips certificate validation to save a round trip.

[think]

The answer is B: the client sends its key share in its first message.

TLS 1.2 spent a round trip negotiating parameters before the key exchange. TLS 1.3 has the client guess the group and send its ephemeral key share up front, so the server can derive keys and send its certificate, signature and finished message in its first reply; a wrong guess costs a retry. Certificates are still validated, and TLS 1.3 still runs over TCP. QUIC is what merges it with the transport.

## 4

A team wants to enable TLS 1.3 zero round trip early data on the API edge, to save a round trip for returning clients. Which constraint must they add?

A, none, because early data is protected like any other application data. B, disable session tickets so resumed sessions stay fresh. C, require client certificates on all early-data connections. D, accept early data only for requests that are safe to replay.

[think]

The answer is D: accept early data only for requests that are safe to replay.

Early data is sent before the server has any fresh handshake state, so an attacker can resend captured early data. It is encrypted, but a replay of a POST that charges a card is still a second charge, so only idempotent requests, such as GETs, qualify. The origin answers 425, Too Early, when it cannot risk a replay. And early data depends on session tickets, so disabling them would disable it entirely.

## 5

A wildcard certificate for star dot example dot com is deployed. Which hostname will fail validation?

A, v2 dot api dot example dot com. B, status dot example dot com. C, payments dot example dot com. D, www dot example dot com, written in capitals.

[think]

The answer is A: v2 dot api dot example dot com.

A wildcard matches exactly one label, in the leftmost position, and v2 dot api has two labels in front of example dot com. Matching is case-insensitive, so the name in capitals is fine.

## 6

In a service mesh with mutual TLS, the orders service calls the payments service through a layer 7 proxy that terminates TLS. What must be true for payments to authorise the call based on the caller's identity?

A, the proxy must downgrade the inner hop to plain TLS 1.2. B, the proxy must forward the verified client identity. C, payments must check the connection's source IP address. D, nothing, because mutual TLS identity passes through any proxy intact.

[think]

The answer is B: the proxy must forward the verified client identity.

TLS authenticates the two ends of one TCP connection. A terminating proxy is the peer that payments sees, so the proxy must verify the client certificate and forward the verified identity, for example in a forwarded client certificate header that payments trusts only from the proxy, or pass TLS through untouched. Source IPs are not identities in a cluster.

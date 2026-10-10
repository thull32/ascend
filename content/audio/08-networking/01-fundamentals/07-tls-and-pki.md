---
lesson: tls-and-pki
source: 9cafca7d7786c1bc
fit: great
desk:
  - "The curl and openssl captures of the handshake, and the record-by-record table of which key protects what"
  - "The round-trip table for TLS 1.2, 1.3, zero round trip and QUIC"
  - "The certificate fields table, and the real four-certificate chain validated step by step"
  - "The openssl s_client output for a missing intermediate, and the expiry check command"
  - "Exercise: validate a certificate chain"
---
## Introduction

The certificate for your API was renewed on Tuesday. On Saturday the old one expires, and at midnight every call from your Android app and every server-to-server client fails with a certificate error, while Chrome on your laptop loads the site perfectly. curl says it is unable to get the local issuer certificate. The new certificate is valid. The renewal script deployed the leaf certificate and forgot the intermediate, and Chrome was quietly fetching the missing link for itself. Nothing else was.

Almost no TLS incident is about cryptography. They are about chains, names, clocks, and how many round trips a handshake costs. So: the handshake as it runs, the certificate machinery that decides whether a client trusts it, and the ways both fail.

First, what TLS promises. Confidentiality: nobody on the path can read the stream. Integrity: nobody can change it undetected. And authentication of the server, optionally the client. Each comes from a different tool. An ephemeral Diffie-Hellman exchange, usually X25519, lets two strangers agree on a secret over a public network. A certificate, signed by an authority the client trusts, binds a name to a public key. And an authenticated cipher like AES-GCM keeps each record secret and unmodified.

Because the Diffie-Hellman keys are thrown away after each connection, stealing the server's private key later does not decrypt recorded traffic. That is forward secrecy. TLS 1.2 still allowed the client to encrypt the secret straight to the server's certificate key, so one stolen key decrypted every recorded session. TLS 1.3 removed that option, along with a pile of weak ciphers. The whole menu is now five entries.

## The one-round-trip handshake

The trick of TLS 1.3 is in the very first message. The client hello carries the versions and ciphers it supports, the name of the site it wants, called server name indication or SNI, the application protocols it speaks, like HTTP 2, and, crucially, its key share. The client guesses which key-exchange group the server will pick and sends its half up front.

So the server can answer in one flight. Its hello carries the chosen cipher and its own key share, and both sides now compute the same secret. Everything after that is encrypted: the server's certificate chain, then a signature over the entire handshake so far, made with the certificate's private key. That signature is the proof that the server holds the key and not merely a copy of a public certificate. Then a Finished message from each side, a checksum over the whole conversation, which catches anyone who tampered with the plaintext hellos, for instance to strip out strong ciphers.

TLS 1.2 needed two round trips, because the client sent its key share only after the server's first reply had fixed the parameters. If the client's guess is wrong in 1.3, the server asks it to retry, and that costs an extra round trip; it is rare, because nearly everything supports X25519.

What stays visible to someone watching? The addresses and ports, and the client hello in plaintext, including the name you are visiting. After that, every encrypted record is labelled application data on the outside, and the true type is hidden inside the ciphertext, so an observer cannot even tell handshake messages from data. In the lesson's capture, the client read about 4 kilobytes during the handshake, and 93 percent of it was the certificate chain.

Now count round trips before the first response byte, at 100 milliseconds each. TCP plus a full TLS 1.2 handshake: four, 400 milliseconds. TCP plus TLS 1.3: three. And a reused connection that is already open: one. That last one is the cheapest in every protocol, which is why connection reuse matters more than any handshake optimisation.

Returning clients can do better. After a full handshake, the server hands out a session ticket, encrypted with a key only the server fleet knows; on reconnect, the client presents it and the server skips the certificate and the expensive signature. Every server behind the load balancer must share those ticket keys, and they must rotate often, because anyone who gets one can decrypt the sessions it protected.

With a ticket, the client may even send its first request in the same flight as its hello. That is zero round trip early data. Before I tell you the catch: is that safe for a login request?

[pause]

No. Early data can be replayed. An attacker who records the hello and the early data can send them again, and the server has no fresh handshake state to tell the copy from the original. It is encrypted, but a replayed payment is still a second payment. So allow it only for requests that are safe to run twice, like reading a catalogue. A proxy that accepts early data forwards it with an Early-Data header, and an origin that cannot risk a replay answers 425, Too Early, so the client retries after the full handshake.

## Certificates and the chain of trust

A certificate is a signed statement: the holder of this public key may use these names, between these dates, signed by this issuer. The names that matter live in the subject alternative name field; modern clients ignore the old common name entirely. And a wildcard matches exactly one label. Star dot example dot com covers api dot example dot com, but not example dot com itself, and not v2 dot api dot example dot com. Teams discover this when they add a second level of subdomains.

Clients trust somewhere between a hundred and a few hundred root certificates, shipped with the operating system, the browser or the language runtime. Roots sign intermediates; intermediates sign your leaf. Root keys live offline in hardware, and if an intermediate is compromised it can be revoked without replacing roots on billions of devices.

The server sends its leaf plus every intermediate, but not the root, because the root has to be in the client's trust store already to be trusted at all. The client builds a path from the leaf up to a root it holds, matching each issuer to the next subject. It verifies each signature, checks that everything above the leaf is allowed to act as an authority, checks the dates against its own clock, and checks that the name it connected to matches the leaf.

Trust stores differ. Browsers have their own root programmes, Java has its own file, Node bundles Mozilla's list, Python uses the operating system's or a package, and a container image built two years ago carries two-year-old roots. That is why the same server can be trusted by one client and rejected by another.

Which brings back the opening. With only the leaf sent, the client cannot build a path. Chrome recovered by fetching the intermediate from a URL inside the certificate, and Firefox ships a preloaded set of known intermediates, so the website worked. curl, Go, Java, Node, Python and mobile apps do not do that, and they all failed. The rule: always test a certificate deployment with openssl or curl, never with a browser, and check that the chain shows two certificates, not one.

## The failures that page you

Expiry is still the most common TLS outage, and entirely preventable. Public certificate lifetimes are shrinking: 398 days from 2020, 200 days from March 2026, stepping down to 47 days by 2029. The only sustainable answer is automated renewal, plus monitoring of the certificate each endpoint actually serves, not the file on disk. The other repeat offenders: a device with a wrong clock, which sees "not yet valid"; and trust-store drift, where an old image lacks a newer root. The reference case is a widely used root expiring in September 2021, when old devices and old OpenSSL builds failed at once.

What if a key leaks? Revocation is weaker than people think. With OCSP, the client asks the authority at connection time whether a certificate is revoked. That costs a round trip to a third party and tells it which sites you visit, so browsers soft-fail: an unreachable responder counts as "not revoked", and an attacker who can block it defeats it. Stapling fixes the round trip by having the server attach a signed, time-limited answer. And the industry is moving to revocation lists, which browsers compress and push out themselves; Let's Encrypt shut down its OCSP service in 2025. Short lifetimes are the other half of the answer.

Certificate Transparency covers a different threat: an authority, compromised or careless, issuing a certificate for your name to someone else. Before issuing, the authority must submit it to public, append-only logs and embed the logs' signed receipts in the certificate, and browsers reject public certificates without them. Because the logs are public, you can monitor them and learn within hours if anyone issues a certificate for your domain.

## Mutual TLS between services

In ordinary TLS only the server proves who it is. Mutual TLS adds a request for the client's certificate to the server's encrypted flight, and the client answers with its own certificate and signature, in the same round trip. So in TLS 1.3 it costs no extra round trip. The server checks the client's chain against a private authority, not the public roots.

It is the standard way to authenticate services to each other, and it is what a service mesh does on your behalf. The identity lives in the certificate's name field, often a SPIFFE identifier naming the namespace and service account, and policies say "the orders service may call charges" instead of trusting source addresses, which are meaningless in a cluster where pods move. Sidecars fetch short-lived certificates, commonly 24 hours or less, and rotate them automatically, which removes the expiry problem by making it happen constantly and invisibly.

The catch is the proxy. Any proxy that terminates TLS ends the mutual authentication there: the backend sees the proxy, not the caller. So the proxy must verify the client certificate and forward the verified identity in a header, which the backend trusts only from that proxy. Envoy calls it the forwarded client cert header.

## Why HTTPS is fast now

"HTTPS is slow" was a real objection ten years ago, and each reason has been removed. Round trips: TLS 1.3 cut the handshake from two to one, and reuse removes it altogether. Signatures: on one core of the lesson's machine, an ECDSA signature took about 11 microseconds and an RSA-2048 signature about 166, fifteen times the cost. A server signs once per full handshake, so moving a busy fleet from RSA to ECDSA certificates cuts handshake CPU. Bulk encryption: AES-GCM ran at about 31 gigabytes a second on one core, so per-byte cost is no longer an argument.

What still bites is the size of the first flight. If the certificate chain plus handshake messages exceed the initial congestion window, about 14.6 kilobytes, the handshake needs an extra round trip. Short chains with ECDSA keys stay well under. That matters again with post-quantum key exchange now being deployed: the client's key share grows from 32 bytes to 1,216.

What remains expensive is a cold connection to a distant server, and that is geography, solved by terminating TLS at an edge close to the user.

## In the interview

A follow-up from the lesson: why does the server send intermediates but not the root?

[pause]

The root has to be in the client's trust store already to be trusted, so sending it wastes bytes. Intermediates are sent because clients cannot be expected to have them. Cross-signed roots are the exception: to an old trust store, they are just intermediates. The common wrong answer is "the root is secret".

And another: how would you rotate a leaked private key, and how fast do clients stop trusting the old certificate? Issue a new key and certificate, deploy, then revoke the old one. Revocation reaches browsers through pushed lists within hours to days, and non-browser clients often never. That is why short lifetimes and keeping keys in hardware or a keyless signing service matter more than revocation. "Revocation takes effect immediately everywhere" is the wrong answer.

## Recap

Count TLS in round trips: TLS 1.2 costs two, 1.3 costs one, early data costs zero, and a reused connection beats them all. Allow early data only for requests that are safe to replay.

Most TLS incidents are chains, names and clocks. Serve the full chain, test with openssl or curl rather than a browser, remember a wildcard covers one label, and monitor the expiry of what each endpoint actually serves, because lifetimes are heading to 47 days.

Trust stores differ per runtime and image, so "works in Chrome" and "works in my container" are separate claims. And mutual TLS gives services identities instead of addresses, but it ends at any proxy that terminates it unless that proxy forwards the verified identity.

At your desk: the handshake captures and the record table, the round-trip table, the real chain validated step by step, the missing-intermediate output, and the chain validation exercise.

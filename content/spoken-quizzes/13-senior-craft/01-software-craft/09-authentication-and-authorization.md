---
lesson: authentication-and-authorization
source: 00d99cc071a4b12d
---
## 1

A mobile app uses the authorization code flow with PKCE, but sets the code challenge method to plain. Why does that weaken the protection?

A, the identity provider cannot verify a plain challenge without the client secret. B, plain challenges are longer than S256 ones, so some servers truncate them. C, plain mode disables the state parameter, which reopens login CSRF on the callback. D, the verifier travels in the authorization request, so anyone who reads it can redeem the code.

[think]

The answer is D: the verifier travels in the authorization request, so anyone who reads it can redeem the code.

With plain, the challenge equals the verifier, so whoever can see the authorization request, a log or a malicious app on the device, learns the one secret needed to redeem an intercepted code. S256 sends only the SHA-256 hash of the verifier, which cannot be inverted. State is a separate parameter, and PKCE exists precisely for clients that have no secret.

## 2

An attacker steals refresh token R1 and uses it first, receiving a new token. An hour later, the real app presents R1. With rotation and reuse detection, what happens?

A, the app receives the attacker's new token as well, since both belong to one family. B, the server revokes the whole family, killing the attacker's token, and the user signs in again. C, the server rejects the app's request and keeps the attacker's token valid. D, nothing is detected, because R1 was rotated and has already been forgotten.

[think]

The answer is B: the server revokes the whole family, and the user signs in again.

R1 is a retired member of the family, and its reappearance proves there are two holders. The server cannot tell which one is legitimate, so it revokes the whole family, including the attacker's new token. The attacker keeps only the access token already issued, for at most its lifetime. Forgetting retired tokens would make reuse undetectable, which is why servers keep them per family.

## 3

An identity provider starts signing tokens with a new key the moment it is generated, and publishes the key in its JWKS at the same time. APIs cache the JWKS for one hour. What do users see?

A, only tokens signed with the old key fail, until they reach their expiry. B, every token fails until the APIs are restarted and reload their configuration. C, new tokens fail at APIs whose cache predates the key, for up to an hour. D, nothing, since the old key stays in the JWKS for the tokens it signed.

[think]

The answer is C: new tokens fail at APIs whose cache predates the key, for up to an hour.

Tokens now carry the new key's ID, and an API whose cached key set predates it cannot find the key, so it rejects them until its cache expires, unless it refetches on an unknown key ID. Old-key tokens still verify, because the old key is still cached. The safe order is publish, wait one cache lifetime, then sign with the new key.

## 4

A single-page app and its API were registered as the same client, so the API's expected audience equals the client ID. Which additional check stops the app's ID token being used as an access token?

A, requiring the nonce claim, which only access tokens carry. B, checking the expiry more strictly, since ID tokens live longer. C, checking the type header, which says "at plus JWT" for access tokens. D, verifying the signature with a different JWKS for ID tokens.

[think]

The answer is C: checking the type header, which says "at plus JWT" for access tokens.

With identical audiences, the audience check passes for both tokens, and both are signed with the same keys, so only an explicit type tells them apart. RFC 9068's profile marks access tokens with that type. The nonce belongs to ID tokens, not access tokens, and expiry says nothing about what a token is for. Separate audiences per API are the deeper fix.

## 5

In an XML signature wrapping attack on SAML, why does signature validation succeed?

A, the signed assertion is intact, but sits where the app does not read. B, the attacker re-signs the response with a certificate from the metadata. C, the identity provider signs the whole response, including the forged part. D, canonicalisation removes the forged assertion before the digest is computed.

[think]

The answer is A: the signed assertion is intact, but sits where the app does not read.

The signature's reference points at the element with a given ID, and that element is intact, so the digest matches. The application then reads the identity from a different, forged assertion, placed where its XPath looks. Nobody re-signs anything, and the identity provider never saw the forgery. The fix is to take identity only from the element the validator verified.

## 6

Why is WebAuthn resistant to a real-time phishing proxy, when one-time codes from an authenticator app are not?

A, WebAuthn codes change every second, instead of every thirty seconds. B, the browser records the origin, and the credential is scoped to the site. C, authenticator app secrets are sent to the server, while WebAuthn keeps nothing on it. D, WebAuthn requires a hardware key, which a proxy cannot reach over USB.

[think]

The answer is B: the browser records the origin, and the credential is scoped to the site.

The browser writes the real origin into the signed client data, and the authenticator only signs for credentials registered to that site's ID, so a look-alike domain gets nothing it could relay. A time-based code is valid wherever it is typed within its window. Passkeys need not be hardware keys, WebAuthn has no codes, and the server does store a public key.

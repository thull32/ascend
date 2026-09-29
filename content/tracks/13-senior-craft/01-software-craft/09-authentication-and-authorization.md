---
slug: authentication-and-authorization
title: "Authentication and authorization: OAuth 2 and PKCE, OIDC, sessions and JWTs, refresh tokens, RBAC to ReBAC, SAML and key rotation"
description: The OAuth 2 authorization-code flow with PKCE traced request by request, client-credentials and device flows, OIDC ID tokens and JWKS, sessions versus JWTs with measured sizes and costs, refresh-token rotation with reuse detection, audience and scope checks, RBAC, ABAC and a Zanzibar check walked by hand, SAML signature wrapping, WebAuthn and key rotation that logs nobody out.
minutes: 50
difficulty: hard
tags: [security, authentication, authorization, oauth, pkce, oidc, jwt, sessions, refresh-tokens, rbac, rebac, zanzibar, saml, sso, webauthn, mfa, key-rotation, senior-craft]
problems: []
---
A product that started with email and password grows three new doors in a year: a mobile app, a partner's nightly export job, and an enterprise customer whose employees must log in through its own identity provider. The team ships all three with 24-hour JSON Web Tokens in `localStorage`, signed with one HMAC secret every service knows. Six months later an XSS bug exfiltrates tokens that work for a day after their owners log out, the billing API accepts a token minted for reporting because nobody checked the audience, and rotating the shared secret, the only fix, logs out everyone.

Each is a missing mechanism, not a missing library, traced below on concrete requests with Ascend, one first-party web app, as the baseline.

## Three questions, five artifacts

Authentication asks who is calling; authorization asks whether they may do this, to this resource, now; delegation asks whether this *application* may act for this user within limits the user agreed to. OAuth 2 answers only delegation, so a third-party app never sees the user's password. OpenID Connect (OIDC) adds authentication on top; SAML predates both and serves enterprise single sign-on.

| Artifact | Answers | Held by | Presented to | Format |
|---|---|---|---|---|
| Session cookie | Which login is this browser? | The browser | The app that issued it | Opaque random string |
| Access token | May the bearer call this API with these scopes? | A client | An API | Opaque or a JWT |
| Refresh token | May this client get a new access token? | A client | The authorization server only | Usually opaque |
| ID token | Who logged in, when and how? | The client | Nobody: the client consumes it | A signed JWT |
| SAML assertion | Who logged in, with which attributes? | The service provider, via the browser | Its assertion consumer URL, once | Signed XML |

Incidents come from using one artifact as another: an ID token accepted by an API, or "Sign in with X" that accepts any valid access token, letting every app the user authorised log in as them.

## Ascend's baseline, and what it does not do

Ascend authenticates with email and password only. `AuthService::login` verifies an Argon2id hash (against a dummy hash for unknown emails, so timing reveals nothing) and creates a session: 32 random bytes as 43 URL-safe base64 characters, stored only as their SHA-256 and expiring `SESSION_TTL_DAYS` (default 30) after login. The raw token travels in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie, and the CSRF middleware's exact `Origin` check and required custom header stop another site spending it. A second cookie, `ascend_device`, marks browsers that signed in before, so guesses cannot lock owners out; [security fundamentals](/learn/senior-craft/software-craft/security-fundamentals) walks that code.

What Ascend does not have: OAuth, OIDC, SAML, MFA, JWTs, refresh tokens or signing keys. Until commit `39052ce` it had no password reset. Recovery is a login path, so it copies the session token's design: a 256-bit single-use token in the link's URL fragment (never sent to a server), stored as its SHA-256 in `email_tokens`, valid for an hour and consumed by `DELETE … RETURNING` so two clicks cannot both succeed, and resetting signs out every session (`a_forgotten_password_is_reset_by_email_and_signs_out_everywhere`). Authorization is a `role` column plus ownership checks. A review found the 30-day lifetime was absolute, so a session unused for four weeks still worked; since commit `427ed78` a session idle for `SESSION_IDLE_DAYS` (14 by default) is signed out too, pinned by `an_idle_session_is_signed_out`. `docs/adr/0002-server-side-sessions.md` names the trigger for a redesign, "A second service must authenticate users without calling this one", answered by short-lived signed tokens minted from the session. That hybrid is what the rest of this lesson builds.

## The authorization-code flow with PKCE, request by request

A single-page app at `https://app.example.com` wants to read orders from `https://api.example.com` for the user, through the identity provider (IdP) `https://id.example.com`. As a public client it cannot keep a secret, so PKCE (RFC 7636) replaces the secret with a one-time proof. The verifier below is the RFC's own example.

```python
import base64, hashlib, secrets

def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")    # base64url without padding

def challenge_for(verifier: str) -> str:
    return b64url(hashlib.sha256(verifier.encode("ascii")).digest())    # hash the ASCII text, not decoded bytes

def new_pkce_pair() -> tuple[str, str]:
    verifier = b64url(secrets.token_bytes(32))      # 256 bits become 43 characters; the RFC allows 43 to 128
    return verifier, challenge_for(verifier)

print(challenge_for("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
# E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
```

The digest is 32 bytes (hex `13d31e96…70f9c3`), 44 base64 characters with a trailing `=` that base64url drops: 43.

| # | Request | Parameters that matter | Who checks what |
|---|---|---|---|
| 1 | Client, in memory | `verifier`, `state=af0ifjsldkj`, `nonce=n-0S6_WzA2Mj`, all random | |
| 2 | `GET https://id.example.com/authorize?…` | `response_type=code`, `client_id=spa-7`, `redirect_uri=https://app.example.com/callback`, `scope=openid orders:read`, `state`, `nonce`, `code_challenge=E9Melhoa…-cM`, `code_challenge_method=S256` | IdP: `redirect_uri` exactly matches a registered URI; stores the challenge with the code |
| 3 | User and IdP | Password, a second factor, consent to `orders:read` | The app never sees the password |
| 4 | `302 Location: https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=af0ifjsldkj&iss=https://id.example.com` | A single-use code (RFC 6749 recommends at most 10 minutes' life) | Client: `state` matches; `iss` is the IdP it started with |
| 5 | `POST https://id.example.com/token`, form-encoded | `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id=spa-7`, `code_verifier=dBjftJeZ…EjXk` | IdP: base64url(SHA-256(verifier)) equals the challenge; code fresh; `redirect_uri` and `client_id` match step 2 |
| 6 | `200 {"access_token": "…", "token_type": "Bearer", "expires_in": 600, "refresh_token": "…", "id_token": "eyJ…", "scope": "openid orders:read"}` | | Client validates the ID token, including `nonce` |
| 7 | `GET https://api.example.com/orders` with `Authorization: Bearer <access token>` | | API: signature, `iss`, `aud`, `exp`, scope, then authorization |

A confidential client (a server-side web app) also authenticates at step 5 with a secret or a signed assertion, and still uses PKCE.

## What each parameter defeats, and why the implicit flow is gone

| Attack | How it works | Defence |
|---|---|---|
| Code interception | An app registered for the same custom URL scheme, a proxy log or a `Referer` leak captures `code` at step 4 | PKCE: redeeming needs the verifier, which never left the client |
| Code injection | A stolen code planted in the victim's callback binds their session to someone else's tokens | PKCE ties the code to this browser; `nonce` ties the ID token to this login |
| Login CSRF | A forged callback logs the victim into the attacker's account | `state`, bound to the pre-login session and checked at step 4 |
| Loose redirect URIs | Wildcards or any path on a domain let a crafted link deliver the code to an attacker's page | Exact string match against registered URIs |
| Mix-up | A client trusting several IdPs sends one IdP's code to another's token endpoint | The `iss` response parameter (RFC 9207), or one redirect URI per IdP |
| `plain` PKCE | The verifier itself travels at step 2, so anyone reading the request can redeem the code | Accept only `S256` |

The implicit flow (`response_type=token`) returned the access token in the URL fragment at step 4, from before browsers could make cross-origin POSTs. The token sat in browser history, was readable by every script on the page, could not be bound to its client, and had no refresh token, so apps renewed it through hidden iframes that third-party-cookie blocking broke. [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.txt) (January 2025) says clients should not use it and must not use the password grant; the OAuth 2.1 draft removes both.

## Client credentials and the device flow

With no user involved, such as a nightly export job or one service calling another, the client authenticates as itself:

```text
POST /token HTTP/1.1
Host: id.example.com
Authorization: Basic ZXhwb3J0LWpvYjpzM2NyZXQ=
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=orders:export
```

The `Basic` value is base64 of `export-job:s3cret`, so a leaked config file is a credential; `private_key_jwt` or mutual TLS (RFC 8705) leaves the IdP holding only a public key. No refresh token comes back, because the client can ask again: cache the access token until shortly before `expires_in` rather than multiplying IdP load by your request rate.

The device flow (RFC 8628) serves a TV or a CLI that has no browser or no keyboard:

| # | Step | Exchange |
|---|---|---|
| 1 | Device asks for codes | `POST /device_authorization` (`client_id=tv-app&scope=openid profile`) returns `device_code`, `user_code: "WDJB-MJHT"`, `verification_uri`, `expires_in: 1800`, `interval: 5` |
| 2 | Device shows the code | "Visit id.example.com/device and enter WDJB-MJHT", often as a QR code |
| 3 | Device polls every 5 s | `POST /token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code` returns `400 {"error": "authorization_pending"}` |
| 4 | Device polls too fast | `slow_down`: the interval grows by 5 seconds for every later poll |
| 5 | User approves on a phone | Signs in at the IdP, types the code, approves |
| 6 | Next poll | `200` with tokens, `access_denied`, or `expired_token` after 30 minutes |

The user code is short enough to type: 8 letters from RFC 8628's suggested 20-consonant alphabet give $20^8 \approx 2.6 \times 10^{10}$ codes, about 34.6 bits, safe only because codes expire and guesses are limited. The known abuse is device-code phishing: the attacker starts a flow and sends the victim a genuine IdP link with the attacker's code, and the victim's approval delivers tokens to the attacker. Approval screens naming the app, short expiry and enabling the flow only where needed defend against it.

## OIDC: the ID token, nonce, discovery and JWKS

The ID token from step 6, decoded (header, then payload):

```json
{"alg": "RS256", "typ": "JWT", "kid": "2026-09-a"}
{"iss": "https://id.example.com", "sub": "248289761001", "aud": "spa-7", "azp": "spa-7",
 "exp": 1790000600, "iat": 1790000000, "auth_time": 1789999990,
 "nonce": "n-0S6_WzA2Mj", "amr": ["pwd", "otp"], "email": "ada@example.com"}
```

The client validates it in this order (OIDC Core, section 3.1.3.7, lists the full set):

1. `iss` equals the issuer from discovery, byte for byte.
2. `aud` contains the client's `client_id` (with several audiences, `azp` equals it).
3. The signature verifies with the matching `kid` from the IdP's key set, under the algorithm configured for that key.
4. `exp` is in the future, within a small leeway; `iat` is recent.
5. `nonce` equals the value stored at step 1, so an ID token from another login cannot be replayed into this one.
6. The user is the pair (`iss`, `sub`), never `email`: addresses get reassigned, and an IdP that allows unverified emails lets anyone claim yours.

The ID token is for the client. An API must not accept it as a credential: its audience is the client, and it carries no scopes.

Discovery (`GET https://id.example.com/.well-known/openid-configuration`) returns the issuer, the endpoints, the supported algorithms and `jwks_uri`, which serves the public keys:

```json
{"keys": [
  {"kty": "RSA", "kid": "2026-09-a", "use": "sig", "alg": "RS256", "n": "0vx7agoebGcQSuu…", "e": "AQAB"},
  {"kty": "EC", "kid": "2026-12-b", "use": "sig", "alg": "ES256", "crv": "P-256", "x": "f83OJ3D2…", "y": "x_FEzRu9…"}
]}
```

Verifiers cache this set (typically minutes to a day, per `Cache-Control`) and on an unknown `kid` refetch once, rate-limited, before failing: the refetch lets rotation go unnoticed, and the limit stops random `kid` values flooding the IdP.

## Under the hood: verifying a JWT

A JWT is three base64url segments, `header.payload.signature`, and the signature covers the bytes of `header.payload`. A correct verifier reads `kid`, finds that key in its own set, takes the algorithm from its own configuration for that key, never the header, verifies, and only then checks claims.

The middle step hid two classic library bugs. RFC 7519 allows unsecured JWTs with `"alg": "none"`, and some libraries skipped verification when they saw it. In algorithm confusion, a token saying `"alg": "HS256"` sent to an API expecting RS256 made libraries use the downloadable RSA public key as the HMAC secret, so anyone could sign claims. RFC 8725, the JWT best current practices, requires caller-specified algorithms, each key used with exactly one.

Measured with Node 24.21 and OpenSSL 3.5.8 on one core of this lesson's machine, for a 194-byte, 10-claim payload and for the same plus email, name, roles and 40 groups:

| Algorithm | Token | With 40 groups | Verify, signature only | Sign |
|---|---|---|---|---|
| HS256 | 364 B | 2,187 B | 8.2 µs | 9.2 µs |
| RS256, 2048-bit | 663 B | 2,486 B | 12.8 µs | 171 µs |
| ES256 | 407 B | 2,230 B | 49.7 µs | 29.1 µs |
| EdDSA (Ed25519) | 407 B | 2,230 B | 45.4 µs | 17.4 µs |

RSA verifies fast and signs slowly (a small public exponent), which suits an IdP that signs once and APIs that verify every request. Every scheme costs tens of microseconds, against a session store's round trip of up to a millisecond. HS256 is symmetric: every verifier can also mint tokens.

## Sessions versus JWTs in depth

Where the credential lives decides what an attacker needs:

| Storage | Page script can read it | Sent automatically | Main threat | Mitigation |
|---|---|---|---|---|
| `HttpOnly` cookie (Ascend) | No | Yes, subject to `SameSite` | CSRF | `SameSite`, an exact `Origin` check, a custom header |
| `localStorage` | Yes | No | XSS reads it and replays it until expiry | None; keep long-lived tokens out |
| Memory, refresh token in an `HttpOnly` cookie | While the page lives | No | XSS acts while the page lives | Short access tokens; CSRF protection on refresh |
| Backend-for-frontend (BFF) | No | The BFF's cookie | CSRF on the BFF | As for any cookie; OAuth tokens never reach the browser |

Size: Ascend's cookie is 58 bytes (`ascend_session=` and 43 characters); the smallest JWT above is 6 times that, and one carrying groups passes 2 KB. RFC 6265 requires browsers to support only 4,096 bytes per cookie, and nginx and Apache cap a single request header at about 8 KB by default. Past a limit one user, usually the one in the most groups, gets a `431` or `400`.

Revocation: a session is a row, so Ascend's `logout` and `logout_everywhere` take effect on the next request. A JWT stays valid until `exp` unless every verifier consults a `jti` denylist, a per-user "issued before T" cutoff or IdP introspection (RFC 7662), each a per-request lookup, the cost JWTs were chosen to avoid. The working answer is short access tokens, revoked at refresh.

## When a JWT becomes the session

A long-lived JWT as the only login state fails in five ways:

1. **Logout does nothing on the server**: a stolen copy works until `exp`.
2. **Authorization goes stale**: a demoted admin stays one until expiry.
3. **Size creeps** with every claim until requests pass header limits.
4. **XSS becomes account takeover**: a token in `localStorage` is replayed from the attacker's machine.
5. **One key forges everyone**, and replacing it logs everyone out unless rotation was designed in.

## Refresh-token rotation with reuse detection, traced

The hybrid keeps access tokens short, 5 to 15 minutes, and puts revocation on the refresh token, which only the authorization server sees. Rotation (RFC 9700) issues a new refresh token on every use and retires the old one; the tokens descended from one login form a **family**. A retired token presented again proves two holders, and the server, unable to tell which is legitimate, revokes the family.

| Time | Actor | Presents | Server state afterwards | Result |
|---|---|---|---|---|
| 10:00 | App logs in | password | family F, current R1 | AT1 (10 min), R1 |
| 10:05 | Attacker copies R1 from a synced backup | | unchanged | |
| 10:10 | App refreshes | R1 | current R2, previous R1 | AT2, R2 |
| 10:40 | Attacker refreshes | R1 | F revoked | reuse detected, nothing issued |
| 10:50 | App refreshes | R2 | F revoked | rejected: the user signs in again |

If the attacker refreshes first (R1 for R2′), the app's next refresh presents the retired R1 and the family dies with R2′ in it: either way the second presentation catches the theft. A thief who takes the *current* token from a device that then goes silent is not caught, hence absolute and idle lifetimes per family.

Strict detection has a false positive: two tabs refreshing at once, or a response lost after rotation, make the legitimate app present a just-retired token. Servers allow a grace period of seconds in which the previous token returns the current successor; clients keep one refresh in flight. Sender-constrained tokens (DPoP, RFC 9449, or certificate-bound) make a stolen token useless without the holder's private key.

```exercise
id: refresh-token-rotation
title: Rotate refresh tokens and detect reuse
prompt: |
  Implement the authorization server's side of refresh-token rotation.
  `events` are processed in order; `grace` is a number of seconds. Return one
  outcome string per event.

  - `[t, "login", family, token]`: start a new family whose current token is
    `token`. Outcome `"issued"`.
  - `[t, "refresh", presented, new_token]`:
    1. `presented` was never issued: `"invalid"`.
    2. Its family is revoked: `"revoked"`.
    3. It is the family's current token: `new_token` becomes current and
       `presented` becomes the previous token, rotated at `t`. `"rotated"`.
    4. It is the previous token and `t` is at most `grace` seconds after it
       was rotated: `"retry"` (the client is resent the current token;
       `new_token` is not issued).
    5. Otherwise (an older token, or the previous one after the grace
       period): revoke the whole family. `"reuse_detected"`.
  - `[t, "logout", presented]`: `"invalid"` if never issued, `"revoked"` if its
    family is already revoked, otherwise revoke the family: `"logged_out"`.

  Once a family is revoked, every token in it answers `"revoked"`.
languages: [python, javascript]
entry: rotate_refresh_tokens
starter:
  python: |
    def rotate_refresh_tokens(events, grace):
        # your code here
        return []
  javascript: |
    function rotate_refresh_tokens(events, grace) {
      // your code here
      return [];
    }
tests:
  - args: [[[0, "login", "f1", "r1"], [600, "refresh", "r1", "r2"], [1200, "refresh", "r2", "r3"]], 5]
    expected: ["issued", "rotated", "rotated"]
    label: normal rotation
  - args: [[[0, "login", "f1", "r1"], [600, "refresh", "r1", "r2"], [900, "refresh", "r1", "x9"], [1200, "refresh", "r2", "r3"]], 5]
    expected: ["issued", "rotated", "reuse_detected", "revoked"]
    label: the thief replays a retired token
  - args: [[[0, "login", "f1", "r1"], [600, "refresh", "r1", "a2"], [610, "refresh", "r1", "b2"], [620, "refresh", "a2", "a3"]], 0]
    expected: ["issued", "rotated", "reuse_detected", "revoked"]
    label: the thief refreshed first
  - args: [[[0, "login", "f1", "r1"], [600, "refresh", "r1", "r2"], [602, "refresh", "r1", "r2b"], [1200, "refresh", "r2", "r3"]], 5]
    expected: ["issued", "rotated", "retry", "rotated"]
    label: a retry inside the grace period
  - args: [[[0, "login", "f1", "r1"], [600, "refresh", "r1", "r2"], [700, "logout", "r2"], [800, "refresh", "r2", "r3"], [801, "refresh", "r3", "r4"]], 5]
    expected: ["issued", "rotated", "logged_out", "revoked", "invalid"]
    label: logout revokes the family
  - args: [[[0, "login", "f1", "r1"], [600, "refresh", "r1", "r2"], [606, "refresh", "r1", "r2b"]], 5]
    expected: ["issued", "rotated", "reuse_detected"]
    hidden: true
    label: just outside the grace period
  - args: [[[0, "login", "f1", "r1"], [0, "login", "f2", "s1"], [600, "refresh", "r1", "r2"], [700, "refresh", "s1", "s2"], [800, "refresh", "r1", "z"], [900, "refresh", "s2", "s3"], [950, "refresh", "r2", "r3"]], 5]
    expected: ["issued", "issued", "rotated", "rotated", "reuse_detected", "rotated", "revoked"]
    hidden: true
    label: revocation is per family
  - args: [[[0, "login", "f1", "r1"], [600, "refresh", "r1", "r2"], [1200, "refresh", "r2", "r3"], [1201, "refresh", "r1", "q"], [1300, "logout", "r3"]], 5]
    expected: ["issued", "rotated", "rotated", "reuse_detected", "revoked"]
    hidden: true
    label: a token two generations old
hints:
  - "Keep two maps: family id to its state (current, previous, rotated_at, revoked), and every token ever issued to its family id."
  - "Check, in order: unknown token, revoked family, current token, previous token within the grace period, and treat everything else as reuse."
```

## Access-token lifetime, audience and scope

Lifetime trades exposure against issuer load: with a million active clients, 10-minute access tokens mean about 1,667 refreshes per second ($10^6 / 600$ s) and 60-minute tokens about 278, while a stolen token or a demoted user's old permissions lasts that long.

Every API checks, on every request, before any business logic:

- **Issuer**: `iss` is the IdP it trusts.
- **Audience**: `aud` names this API. With resource indicators (RFC 8707) a token for `billing-api` fails at `orders-api`, and a compromised API cannot replay its callers' tokens.
- **Type**: RFC 9068 access tokens carry `"typ": "at+jwt"`, which rejects an ID token even where the client ID equals the API's audience.
- **Time**: `exp` and `nbf`, with a leeway for clock skew, typically 30 to 60 seconds.
- **Scope**: whole space-separated tokens, so `orders:read` is not found inside `orders:readonly`.

Scopes are ceilings on what the client may do for the user, not permissions: the API still decides whether *this user* may read *this order*. An API calling another for the user exchanges the token (RFC 8693) for one with the downstream audience and a narrower scope instead of forwarding it.

## Authorization models: RBAC, ABAC and ReBAC

| Model | Decision | Example rule | Fits | Breaks when |
|---|---|---|---|---|
| RBAC | User to roles to permissions | `admin` may delete any comment | A few roles, not tied to single resources | Access depends on the resource, and roles such as `project-42-editor` multiply |
| ABAC | A policy over subject, resource, action and context attributes | Allow `read` if `subject.dept == resource.dept` | Compliance rules; time, device or location conditions | "Who can read X?" needs every policy evaluated |
| ReBAC | A walk over relationship tuples | A document's viewers include its folder's viewers | Sharing, groups, hierarchies: documents, drives, repositories | Deep graphs need caching; concurrent edits need snapshots |

Ascend is RBAC plus ownership: only the author or an admin deletes a comment, and someone else's interview returns `NotFound`, like a missing one. "The author may" is already an attribute check; real systems mix models.

### A Zanzibar check, traced

Google's Zanzibar paper (USENIX ATC 2019) describes the ReBAC service behind Drive, Calendar, YouTube and other products; OpenFGA and SpiceDB are open-source systems inspired by it. Facts are tuples `object#relation@subject`, and a namespace configuration defines relations in terms of each other:

```text
doc.viewer    = this ∪ doc.editor ∪ (doc.parent → folder.viewer)
doc.editor    = this ∪ doc.owner
folder.viewer = this ∪ (folder.parent → folder.viewer)
group.member  = this

doc:roadmap#owner@user:ana
doc:roadmap#parent@folder:eng
folder:eng#viewer@group:platform#member
group:platform#member@user:bo
```

`check(doc:roadmap, viewer, user:bo)`:

1. Direct tuples `doc:roadmap#viewer@…`: none.
2. Computed `doc:roadmap#editor`: no direct tuples; computed `doc:roadmap#owner` holds `user:ana` only. Dead end.
3. Tuple to userset: `doc:roadmap#parent` is `folder:eng`, so check `folder:eng#viewer`.
4. Its direct tuple names a userset, `group:platform#member`, so check whether Bo is in it.
5. `group:platform#member@user:bo` exists: allowed, via roadmap, eng and platform.

Each step is an indexed read; production checks run branches in parallel and cache subproblems. The subtle part is time: if Ana removes Bo from the folder and then adds a secret paragraph, a check on a stale replica could still show Bo the new text, the paper's "new enemy" problem. When content is saved, the client obtains a consistency token, a "zookie", stored with that version; later checks on it run at a snapshot at least that new, so they see every earlier ACL change.

```viz
{"type": "graph", "algorithm": "bfs", "directed": true, "start": "doc#viewer",
 "nodes": [{"id": "doc#viewer"}, {"id": "doc#editor"}, {"id": "doc#owner"}, {"id": "folder#viewer"}, {"id": "platform#member"}, {"id": "user:ana"}, {"id": "user:bo"}],
 "edges": [{"from": "doc#viewer", "to": "doc#editor"}, {"from": "doc#editor", "to": "doc#owner"}, {"from": "doc#owner", "to": "user:ana"}, {"from": "doc#viewer", "to": "folder#viewer"}, {"from": "folder#viewer", "to": "platform#member"}, {"from": "platform#member", "to": "user:bo"}],
 "title": "A permission check is graph reachability", "caption": "Each node is an object and relation; each edge is a rewrite rule or a stored tuple. The check succeeds when the search from doc#viewer reaches user:bo, here through the parent folder and the group."}
```

```exercise
id: rebac-check
title: Evaluate a Zanzibar-style permission check
prompt: |
  Implement `check(schema, tuples, obj, relation, user)`.

  `tuples` are `[object, relation, subject]`. A subject is a user
  (`"user:bo"`), a userset (`"group:eng#member"`, meaning everyone with
  relation `member` on `group:eng`), or, for linking relations such as
  `parent`, another object (`"folder:eng"`). An object's type is the text
  before the `:`.

  `schema[type][relation]` is a list of rules; `user` has `relation` on
  `obj` if any rule holds:

  - `"this"`: some tuple `[obj, relation, s]` has `s == user`, or `s` is a
    userset `o#r` and `user` has `r` on `o`.
  - `["computed", r2]`: `user` has `r2` on `obj`.
  - `["from", link, r2]`: for some tuple `[obj, link, other]`, `user` has
    `r2` on `other`.

  A relation missing from the schema has the rules `["this"]`. Groups can
  contain each other in a cycle; your check must still terminate.
languages: [python, javascript]
entry: check
starter:
  python: |
    def check(schema, tuples, obj, relation, user):
        # your code here
        return False
  javascript: |
    function check(schema, tuples, obj, relation, user) {
      // your code here
      return false;
    }
tests:
  - args: [{"doc": {"owner": ["this"], "editor": ["this", ["computed", "owner"]], "viewer": ["this", ["computed", "editor"], ["from", "parent", "viewer"]]}, "folder": {"viewer": ["this", ["from", "parent", "viewer"]]}, "group": {"member": ["this"]}}, [["doc:roadmap", "owner", "user:ana"], ["doc:roadmap", "parent", "folder:eng"], ["folder:eng", "viewer", "group:platform#member"], ["group:platform", "member", "user:bo"], ["doc:roadmap", "editor", "user:cy"]], "doc:roadmap", "viewer", "user:bo"]
    expected: true
    label: the traced check
  - args: [{"doc": {"owner": ["this"], "editor": ["this", ["computed", "owner"]], "viewer": ["this", ["computed", "editor"], ["from", "parent", "viewer"]]}, "folder": {"viewer": ["this", ["from", "parent", "viewer"]]}, "group": {"member": ["this"]}}, [["doc:roadmap", "owner", "user:ana"], ["doc:roadmap", "parent", "folder:eng"], ["folder:eng", "viewer", "group:platform#member"], ["group:platform", "member", "user:bo"], ["doc:roadmap", "editor", "user:cy"]], "doc:roadmap", "editor", "user:bo"]
    expected: false
    label: viewing does not imply editing
  - args: [{"doc": {"owner": ["this"], "editor": ["this", ["computed", "owner"]], "viewer": ["this", ["computed", "editor"], ["from", "parent", "viewer"]]}, "folder": {"viewer": ["this", ["from", "parent", "viewer"]]}, "group": {"member": ["this"]}}, [["doc:roadmap", "owner", "user:ana"], ["doc:roadmap", "parent", "folder:eng"], ["folder:eng", "viewer", "group:platform#member"], ["group:platform", "member", "user:bo"], ["doc:roadmap", "editor", "user:cy"]], "doc:roadmap", "viewer", "user:ana"]
    expected: true
    label: owners are editors are viewers
  - args: [{"doc": {"owner": ["this"]}}, [["doc:a", "viewer", "user:x"]], "doc:a", "viewer", "user:y"]
    expected: false
    label: relation missing from the schema
  - args: [{"doc": {"viewer": ["this"]}, "group": {"member": ["this"]}}, [["group:a", "member", "group:b#member"], ["group:b", "member", "group:a#member"], ["doc:d", "viewer", "group:a#member"]], "doc:d", "viewer", "user:zed"]
    expected: false
    label: cyclic groups terminate
  - args: [{"doc": {"owner": ["this"], "editor": ["this", ["computed", "owner"]], "viewer": ["this", ["computed", "editor"], ["from", "parent", "viewer"]]}, "folder": {"viewer": ["this", ["from", "parent", "viewer"]]}, "group": {"member": ["this"]}}, [["doc:roadmap", "owner", "user:ana"], ["doc:roadmap", "parent", "folder:eng"], ["folder:eng", "viewer", "group:platform#member"], ["group:platform", "member", "user:bo"], ["doc:roadmap", "editor", "user:cy"]], "doc:roadmap", "owner", "user:cy"]
    expected: false
    hidden: true
    label: editors are not owners
  - args: [{"doc": {"owner": ["this"], "editor": ["this", ["computed", "owner"]], "viewer": ["this", ["computed", "editor"], ["from", "parent", "viewer"]]}, "folder": {"viewer": ["this", ["from", "parent", "viewer"]]}, "group": {"member": ["this"]}}, [["folder:root", "viewer", "user:eve"], ["folder:eng", "parent", "folder:root"], ["doc:spec", "parent", "folder:eng"], ["group:x", "member", "group:y#member"], ["group:y", "member", "user:fay"], ["doc:spec", "editor", "group:x#member"]], "doc:spec", "viewer", "user:eve"]
    expected: true
    hidden: true
    label: two levels of folders
  - args: [{"doc": {"owner": ["this"], "editor": ["this", ["computed", "owner"]], "viewer": ["this", ["computed", "editor"], ["from", "parent", "viewer"]]}, "folder": {"viewer": ["this", ["from", "parent", "viewer"]]}, "group": {"member": ["this"]}}, [["folder:root", "viewer", "user:eve"], ["folder:eng", "parent", "folder:root"], ["doc:spec", "parent", "folder:eng"], ["group:x", "member", "group:y#member"], ["group:y", "member", "user:fay"], ["doc:spec", "editor", "group:x#member"]], "doc:spec", "viewer", "user:fay"]
    expected: true
    hidden: true
    label: nested groups through the editor relation
hints:
  - "Index tuples by (object, relation) first, so each rule is a dictionary lookup."
  - "Write a recursive has(object, relation) that tries each rule; a subject containing '#' is itself a (object, relation) pair to recurse into."
  - "Record every (object, relation) you have started exploring and return false on a repeat: that breaks cycles, and a union can never need the same pair twice."
```

## SSO and SAML: assertions and signature wrapping

Single sign-on means one login at an IdP serves many applications, each with its own session; enterprise customers mostly bring SAML 2.0. In the SP-initiated flow the app (the service provider) redirects the browser to the IdP with a deflated, base64 `AuthnRequest`, and the IdP authenticates the user and returns a page that auto-POSTs a base64 `SAMLResponse` to the SP's assertion consumer service (ACS) URL. Trimmed:

```text
<samlp:Response ID="_r1" InResponseTo="_req42" Destination="https://app.example.com/saml/acs">
  <saml:Assertion ID="_a7">
    <saml:Issuer>https://idp.example.org</saml:Issuer>
    <ds:Signature><ds:SignedInfo><ds:Reference URI="#_a7">…digest…</ds:Reference></ds:SignedInfo>…</ds:Signature>
    <saml:Subject>
      <saml:NameID>mallory@example.com</saml:NameID>
      <saml:SubjectConfirmationData InResponseTo="_req42" Recipient="https://app.example.com/saml/acs" NotOnOrAfter="2026-09-28T10:05:00Z"/>
    </saml:Subject>
    <saml:Conditions NotBefore="2026-09-28T10:00:00Z" NotOnOrAfter="2026-09-28T10:05:00Z">
      <saml:AudienceRestriction><saml:Audience>https://app.example.com</saml:Audience></saml:AudienceRestriction>
    </saml:Conditions>
  </saml:Assertion>
</samlp:Response>
```

The SP checks the signature with the IdP's metadata certificate, `Issuer`, `Audience` (its entity ID), `Recipient` and `Destination` (its ACS URL), both time windows, `InResponseTo` (an unanswered ID it issued), and that the assertion ID is unused.

**Why XML signature wrapping bit people.** An XML signature does not sign "the document": `Reference URI="#_a7"` means find the element with ID `_a7`, canonicalise it and compare its digest. The validator answers "is `_a7` intact?"; the application asks "what is the NameID?", usually via an XPath such as the first `Assertion`. Mallory adds a forged unsigned assertion (NameID `admin@example.com`) where the application looks and moves her genuine one where it does not, such as an `Extensions` element. The validator finds `_a7` intact; the application logs her in as admin.

A 2012 USENIX Security paper, "On Breaking SAML: Be Whoever You Want to Be", found wrapping vulnerabilities in 11 of the 14 frameworks it analysed. A 2018 Duo Security disclosure (CERT VU#475445) found a relative: `admin@example.com<!---->.evil.com` still verifies, because canonicalisation ignores comments, while several libraries returned only the text before the comment. Parser differentials, where signature checking and the application use two XML parsers that disagree, still produced bypasses in 2025 (ruby-saml's CVE-2025-25291 and CVE-2025-25292). The fixes: read identity only from the element the validator returned, reject more than one assertion, parse once, and keep the library patched.

## MFA and WebAuthn

| Factor | Mechanism | Stops credential stuffing | Stops real-time phishing |
|---|---|---|---|
| SMS code | A code sent to a phone number | Yes | No, and SIM swaps steal it |
| TOTP (RFC 6238) | HMAC of a 30-second counter, truncated to 6 digits | Yes | No: a proxy relays the code in its window |
| Push approval | Tap "approve" in an app | Yes | No, and repeated prompts wear users down |
| WebAuthn and passkeys | A signature over a server challenge and the origin | Yes | Yes |

TOTP fits in a dozen lines; the assertion checks it against the SHA-1 test vector in RFC 6238's appendix B:

```python
import hashlib, hmac, struct

def totp(secret: bytes, unix_time: int, step: int = 30, digits: int = 6) -> str:
    counter = unix_time // step                                   # which 30-second window
    mac = hmac.new(secret, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F                                       # dynamic truncation, RFC 4226
    code = (int.from_bytes(mac[offset:offset + 4], "big") & 0x7FFFFFFF) % 10**digits
    return str(code).zfill(digits)

assert totp(b"12345678901234567890", 59, digits=8) == "94287082"
print(totp(b"12345678901234567890", 59))    # 287082
```

A guess succeeds one time in a million, about three in a million if neighbouring windows are accepted for clock drift, so verification needs its own attempt limit. WebAuthn authentication, traced:

1. The server sends a fresh random challenge (the specification asks for at least 16 bytes) with `rpId: "example.com"` and the user's credential IDs.
2. The browser, not the page, writes `clientDataJSON`: `{"type": "webauthn.get", "challenge": "…", "origin": "https://example.com"}`.
3. The authenticator finds its credential for `example.com`, asks for a touch or biometric, and signs `authenticatorData` (the rpId's SHA-256, flags, a counter) plus the SHA-256 of `clientDataJSON` with its private key.
4. The server checks the challenge, origin, rpId hash and flags, and verifies the signature with the public key stored at registration.

On a look-alike domain, step 2 records the look-alike origin and step 3 finds no credential for its rpId, so there is nothing to relay; no code-based factor has that property. Recovery is every factor's weak point: a fallback to email or SMS inherits their weaknesses.

## Key rotation procedures

Every signing key, secret and certificate needs a rehearsed, unnoticed rotation, and the pattern is overlap. For JWKS signing keys cached by verifiers for up to an hour, with ten-minute access tokens:

| Step | JWKS publishes | IdP signs with | Tokens in circulation | Verifiers |
|---|---|---|---|---|
| Start | K1 | K1 | K1 | All know K1 |
| Publish K2 | K1, K2 | K1 | K1 | Stale caches lack K2, but nothing uses it yet |
| After one cache TTL | K1, K2 | K2 | K1 and K2 | Every cache has refreshed and knows K2 |
| After one token lifetime more | K2 | K2 | K2 | Every K1 token has expired |

Sign with K2 the moment it exists instead, and every verifier whose cache predates it rejects new tokens for up to an hour unless it refetches on an unknown `kid`. Emergency rotation skips the waits: remove K1 at once and accept that its tokens fail; clients recover through refresh tokens, which the IdP checks without K1.

The same overlap applies elsewhere: webhook and cookie-signing secrets are checked against current and previous values, and SAML IdPs publish the next certificate in metadata first, so an SP that pinned one certificate by hand breaks on rotation day.

Ascend has none of these keys; its emergency equivalent is deleting rows from `sessions`. Its `GRADER_TOKEN` shows the cost of skipping overlap: the grading service accepts one value, so `docs/RUNBOOK.md` warns that grading answers 503 between redeploying the grader and the API.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A wave of 401s right after a key rotation, gone within the hour | The IdP signed with a new `kid` before JWKS caches refreshed | Publish, wait one cache TTL, then sign; refetch on unknown `kid` |
| Users with two tabs are logged out at random | Concurrent refreshes trip reuse detection | A grace period of seconds; one refresh in flight |
| A token for one API works at another | No `aud` check, or a shared audience | Per-API audiences; check `aud` and `typ` |
| A demoted admin keeps admin rights for hours | Roles baked into long-lived tokens | Short access tokens; roles checked at the resource |
| The same users get 431 or 400 at login | Group lists in tokens or cookies pass header limits | Small tokens; look groups up server-side |
| Any user can log in as any other through SAML | Signature wrapping: NameID read from an unverified element | Use only the verified element; patch the library |
| "Token not yet valid" from one host only | That host's clock drifted past the leeway | NTP everywhere; 30 to 60 seconds of leeway |

## Trade-offs

| | Opaque session (Ascend) | JWT access plus rotating refresh | Reference token with introspection | BFF holding OAuth tokens |
|---|---|---|---|---|
| Per-request cost | One store lookup, about a millisecond or less | Signature check, 8–50 µs measured, no I/O | A call to the IdP, or a cache | A session lookup at the BFF |
| Revocation | Immediate | At the next refresh | Immediate, or after the cache TTL | Immediate |
| Size on the wire | 58-byte cookie | 0.4 to 2.5 KB | A short opaque string | A short cookie |
| Many services verify | Each calls the session store | Offline, with the public key | Each calls the IdP | Only the BFF calls APIs |
| Secret material | None to rotate | Signing keys and a rotation procedure | Introspection credentials | OAuth client credentials |
| Fits | One first-party web app | Many APIs, mobile and third-party clients | High-value APIs needing instant revocation | Browser apps on an external IdP |

## Interviewer follow-ups

**"Our SPA logs in through an external IdP. Where do the tokens live?"** Model answer: preferably not in the browser: a backend-for-frontend runs the code flow with PKCE as a confidential client, keeps the tokens, and gives the browser an `HttpOnly` session cookie with CSRF protection. If the SPA must hold tokens, access tokens live in memory for minutes and refresh tokens rotate with reuse detection. Common wrong answer: "a 24-hour JWT in `localStorage`", which turns one XSS into day-long takeover.

**"How do you log a user out everywhere when APIs verify JWTs offline?"** Model answer: revoke every refresh-token family for the user and accept that outstanding access tokens live out their minutes; if that is too long, APIs check a per-user "not before" timestamp or a short-lived `jti` denylist. Common wrong answer: "delete the token on the client", which leaves a stolen copy working.

**"Model permissions for folders, documents, groups and link sharing."** Model answer: ReBAC: relationship tuples, `viewer` defined as direct viewers plus editors plus the parent folder's viewers, cached graph walks, and consistency tokens stored with content so an unshare precedes later edits. Common wrong answer: a role per document, or ACLs copied down the folder tree, which go stale when a folder moves.

**"A customer wants SAML SSO. What does your service check on each response?"** Model answer: the IdP's signature over the exact element whose NameID is used, exactly one assertion, issuer, audience, recipient, destination, time windows, `InResponseTo` and a replay cache, via a patched library. Common wrong answer: "verify the signature", precisely the check wrapping attacks pass.

## What mid-level engineers get wrong

- **Accepting an ID token as an API credential.** Its audience is the client, and it carries identity, not permission.
- **Long-lived JWTs as sessions.** Logout, demotion and theft all wait for `exp`.
- **Rotation without reuse detection, or detection without a grace period.** The first misses theft; the second logs out two-tab users.
- **Checking scope and forgetting the resource.** `orders:read` does not mean this user may read this order.
- **Trusting a SAML response because a signature verified.** Only the verified element is trusted.

## Senior signals

- You can trace the code flow with PKCE request by request and name the attack each of `state`, `nonce`, `code_challenge`, exact redirect matching and `iss` defeats.
- You never let one of the five artifacts stand in for another.
- You choose between opaque sessions, JWTs and a BFF from measured costs and from how revocation must work.
- You design refresh-token rotation with families, reuse detection, a grace period and absolute lifetimes, and know what it cannot catch.
- You pick RBAC, ABAC or ReBAC from the shape of the permission and can walk a Zanzibar check by hand.
- You run key rotation as publish, wait, switch, wait, retire.

## Check yourself

```quiz
- q: >-
    A mobile app uses the authorization-code flow with PKCE but sends code_challenge_method=plain. Why does that weaken the protection?
  options: ["The identity provider cannot verify a plain challenge without the client secret", "Plain challenges are longer than S256 ones, so they are truncated by some servers", "Plain mode disables the state parameter, which reopens login CSRF on the callback", "The verifier travels in the authorization request, so a reader can redeem the code"]
  answer: 3
  explanation: >-
    With plain, the challenge equals the verifier, so whoever can see the authorization request (a log, a malicious app on the device) learns the one secret needed to redeem an intercepted code. S256 sends only the SHA-256 of the verifier, which cannot be inverted. State is a separate parameter, and PKCE exists precisely for clients without a secret.
- q: >-
    An attacker steals refresh token R1 and uses it first, receiving R2'. An hour later the real app presents R1. With rotation and reuse detection, what happens?
  options: ["The app receives R2' as well, since both hold members of one family", "The server revokes the family, killing R2', and the user signs in again", "The server rejects the app's request and keeps the attacker's R2' valid", "Nothing is detected, because R1 was rotated and has already been forgotten"]
  answer: 1
  explanation: >-
    R1 is a retired member of the family, and its reappearance proves two holders. The server cannot tell which is legitimate, so it revokes the whole family, including the attacker's R2'. The attacker keeps only the access token already issued, for at most its lifetime. Forgetting retired tokens would make reuse undetectable, which is why servers keep them per family.
- q: >-
    An identity provider starts signing with a new key the moment it is generated and publishes it in the JWKS at the same time. APIs cache the JWKS for one hour. What do users see?
  options: ["Only tokens signed with the old key fail, until they reach their expiry", "Every token fails until the APIs are restarted and reload their config", "New tokens fail at APIs whose cache predates the key, for up to an hour", "Nothing, since the old key stays in the JWKS for tokens it signed"]
  answer: 2
  explanation: >-
    Tokens now carry the new kid, and an API with a cached key set that predates it cannot find the key, so it rejects them until its cache expires, unless it refetches on unknown kid. Old-key tokens still verify because the old key is still cached. The safe order is publish, wait one cache TTL, then sign with the new key.
- q: >-
    An SPA and its API were registered as the same client, so the API's expected audience equals the client_id. Which additional check stops the SPA's ID token being used as an access token?
  options: ["Requiring the nonce claim, which only access tokens carry", "Checking exp more strictly, since ID tokens live longer", "Checking the typ header, which is at+jwt for access tokens", "Verifying the signature with a different JWKS for ID tokens"]
  answer: 2
  explanation: >-
    With identical audiences the aud check passes for both tokens, and both are signed with the same keys, so only an explicit type distinguishes them. The RFC 9068 profile marks access tokens with typ at+jwt. The nonce belongs to ID tokens, not access tokens, and expiry says nothing about what a token is for. Separate audiences per API are the deeper fix.
- q: >-
    In an XML signature wrapping attack on SAML, why does signature validation succeed?
  options: ["The signed assertion is intact but sits where the app does not read", "The attacker re-signs the response with a certificate from the metadata", "The identity provider signs the whole response, including the forged part", "Canonicalisation removes the forged assertion before the digest is computed"]
  answer: 0
  explanation: >-
    The reference points at the element with a given ID, and that element is intact, so the digest matches. The application then reads identity from a different, forged assertion placed where its XPath looks. Nobody re-signs anything and the IdP never saw the forgery. The fix is to take identity only from the element the validator verified.
- q: >-
    Why is WebAuthn resistant to a real-time phishing proxy when TOTP is not?
  options: ["WebAuthn codes change every second instead of every thirty seconds", "The browser records the origin and the credential is scoped to the site", "TOTP secrets are sent to the server, while WebAuthn keeps nothing on it", "WebAuthn requires a hardware key, which a proxy cannot reach over USB"]
  answer: 1
  explanation: >-
    The browser writes the real origin into clientDataJSON, and the authenticator only signs for credentials registered to that rpId, so a look-alike domain gets nothing it could relay. A TOTP code is valid wherever it is typed within its window. Passkeys need not be hardware keys, WebAuthn has no codes, and the server does store a public key.
```

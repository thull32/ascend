---
slug: authentication-and-authorization
title: "Authentication and authorization: OAuth 2 and PKCE, OIDC, sessions and JWTs, refresh tokens, RBAC to ReBAC, SAML and key rotation"
description: The OAuth 2 authorization-code flow with PKCE traced request by request, client-credentials and device flows, OIDC ID tokens and JWKS, sessions versus JWTs with measured sizes and costs, refresh-token rotation with reuse detection, audience and scope checks, RBAC, ABAC and a Zanzibar check walked by hand, SAML signature wrapping, WebAuthn and key rotation that logs nobody out.
minutes: 55
difficulty: hard
tags: [security, authentication, authorization, oauth, pkce, oidc, jwt, sessions, refresh-tokens, rbac, rebac, zanzibar, saml, sso, webauthn, mfa, key-rotation, senior-craft]
problems: []
---
A product that started with email and password grows three new doors in one year. The mobile app calls the API, a partner's server pulls nightly exports, and an enterprise customer will sign only if its employees log in through the customer's own identity provider. The team ships all three with JSON Web Tokens valid for 24 hours, kept in `localStorage` and signed with one HMAC secret that every service knows. Six months later an XSS bug on a marketing page exfiltrates tokens that keep working for a day after the victims click "log out", a token minted for the reporting service is accepted by the billing API because nobody checked the audience, and rotating the shared secret, the only fix, logs out every user at once.

Each of those is a missing mechanism, not a missing library. This lesson traces the mechanisms on concrete requests, from the OAuth flows to key rotation, with Ascend as the baseline: it does the simplest correct thing for one first-party web app, and the lesson says exactly where that stops.

## Three questions, five artifacts

Authentication asks who is calling. Authorization asks whether they may do this, to this resource, now. Delegation asks whether this *application* may act for this user, within limits the user agreed to. OAuth 2 answers only delegation: it exists so that a third-party app never sees the user's password, and it says nothing about who the user is. OpenID Connect (OIDC) adds authentication on top of OAuth. SAML predates both and answers authentication for enterprise single sign-on.

| Artifact | Answers | Held by | Presented to | Format |
|---|---|---|---|---|
| Session cookie | Which login is this browser? | The browser | The app that issued it | Opaque random string |
| Access token | May the bearer call this API with these scopes? | A client application | A resource server (API) | Opaque or a JWT |
| Refresh token | May this client get a new access token? | A client | The authorization server only | Usually opaque |
| ID token | Who logged in, when and how? | The client (relying party) | Nobody: the client consumes it | Always a signed JWT |
| SAML assertion | Who logged in, with which attributes? | The service provider, via the browser | The provider's assertion consumer URL, once | Signed XML |

Incidents come from using one artifact as another: an ID token accepted by an API, or "Sign in with X" implemented by accepting any valid access token and reading a user ID from it, which lets every app the user ever authorised log in as them.

## Ascend's baseline, and what it does not do

Ascend authenticates with email and password only. `AuthService::login` in `crates/core/src/auth/service.rs` verifies an Argon2id hash (against a dummy hash when the email is unknown, so timing does not reveal accounts) and creates a session: `token::generate` in `token.rs` draws 32 random bytes and encodes them as 43 URL-safe base64 characters, and the `sessions` table stores only `token::hash`, the hex SHA-256, as its primary key, with `expires_at` set `SESSION_TTL_DAYS` (default 30) after login. `crates/api/src/routes/auth.rs` puts the raw token in a cookie named `ascend_session` with `Path=/`, `HttpOnly`, `SameSite=Lax`, a `Secure` flag from configuration (production refuses to boot without it) and a `Max-Age` matching the expiry.

On each request the extractor in `crates/api/src/extractors.rs` resolves the cookie once and caches the user in request extensions. `authenticate` rejects anything that is not 43 URL-safe characters before touching the database, hashes the rest, loads the row by primary key, deletes it if expired, and refreshes `last_seen_at` at most hourly. Because `crates/api/src/middleware/csrf.rs` requires an exact `Origin` (or `Referer` origin) match and an `X-Requested-With` header on every mutating request, another site cannot spend the ambient cookie. [Security fundamentals](/learn/senior-craft/software-craft/security-fundamentals) and the case study's [authentication lesson](/learn/case-study-ascend/the-system/authentication-and-security) walk that code line by line.

What Ascend does not have: OAuth or OIDC (no third-party clients, no "Sign in with…"), SSO or SAML, MFA or passkeys, a password reset or change flow, JWTs, refresh tokens or signing keys. Authorization is a `role` column holding `user` or `admin`, read through `CurrentUser::is_admin`, plus ownership checks in the services. A reviewer would still raise two points. The 30-day lifetime is absolute, counted from login, with no idle timeout, so a session unused for four weeks still works. And `docs/adr/0002-server-side-sessions.md` names the trigger that would change the design, "A second service must authenticate users without calling this one", with its answer: short-lived signed tokens minted from the session, which stays the source of truth. That hybrid is what the rest of this lesson builds.

## The authorization-code flow with PKCE, request by request

A single-page app at `https://app.example.com` wants to read orders from `https://api.example.com` for the user, through the identity provider (IdP) `https://id.example.com`. The app is a public client: anything it ships is readable, so it cannot hold a client secret. PKCE (RFC 7636) replaces the secret with a one-time proof. The verifier below is the example from RFC 7636's appendix, so you can check the arithmetic.

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

The SHA-256 digest is 32 bytes (hex `13d31e96…70f9c3`), and 32 bytes encode to 44 base64 characters, the last one a `=` that base64url drops: 43. One hash took 0.18 µs in Python 3.14 on this lesson's machine, so PKCE costs nothing measurable.

| # | Request | Parameters that matter | Who checks what |
|---|---|---|---|
| 1 | Client, in memory | `verifier`, `state=af0ifjsldkj`, `nonce=n-0S6_WzA2Mj`, all random, kept for the callback | |
| 2 | `GET https://id.example.com/authorize?…` | `response_type=code`, `client_id=spa-7`, `redirect_uri=https://app.example.com/callback`, `scope=openid orders:read`, `state`, `nonce`, `code_challenge=E9Melhoa…-cM`, `code_challenge_method=S256` | IdP: `redirect_uri` equals a registered URI exactly; remembers the challenge with the code it will issue |
| 3 | User and IdP | Password and a second factor, consent to `orders:read` | The app never sees the password |
| 4 | `302 Location: https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=af0ifjsldkj&iss=https://id.example.com` | The code is single use and short-lived (RFC 6749 recommends at most 10 minutes) | Client: `state` equals the stored value; `iss` is the IdP it started with |
| 5 | `POST https://id.example.com/token`, form-encoded | `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id=spa-7`, `code_verifier=dBjftJeZ…EjXk` | IdP: base64url(SHA-256(verifier)) equals the stored challenge; code unused and unexpired; `redirect_uri` and `client_id` match step 2 |
| 6 | `200 {"access_token": "…", "token_type": "Bearer", "expires_in": 600, "refresh_token": "…", "id_token": "eyJ…", "scope": "openid orders:read"}` | | Client validates the ID token, including `nonce` |
| 7 | `GET https://api.example.com/orders` with `Authorization: Bearer <access token>` | | API: signature, `iss`, `aud`, `exp`, scope, then authorization |

A confidential client (a server-side web app) runs the same flow and also authenticates at step 5 with a secret or a signed assertion. It should still use PKCE, which also stops code injection.

## What each parameter defeats, and why the implicit flow is gone

| Attack | How it works | Defence |
|---|---|---|
| Code interception | A malicious app registered for the same custom URL scheme, a proxy log or a `Referer` leak captures `code` at step 4 | PKCE: redeeming the code needs the verifier, which never left the client |
| Code injection | An attacker plants a stolen code in the victim's callback, binding the victim's session to someone else's tokens | PKCE ties the code to this browser's verifier; `nonce` ties the ID token to this login |
| Login CSRF | A forged callback logs the victim into the attacker's account, where they then save a card or upload files | `state`, bound to the browser's pre-login session and checked at step 4 |
| Loose redirect URIs | The IdP accepts wildcards or any path on a domain, so a crafted link delivers the code to an attacker's page or an open redirector | Exact string match against registered URIs |
| Mix-up | A client that trusts several IdPs sends a code from one to another's token endpoint | The `iss` response parameter (RFC 9207), or one redirect URI per IdP |
| `plain` PKCE | `code_challenge_method=plain` sends the verifier itself at step 2, so anyone who reads the request can redeem the code | Accept only `S256` |

The implicit flow (`response_type=token`) skipped steps 5 and 6 and returned the access token in the URL fragment at step 4, because browsers could not make cross-origin POSTs before CORS. The token then sat in browser history, was readable by every script on the callback page, survived through any redirect that preserved the fragment, could not be bound to the client that asked for it, and came without a refresh token, so apps renewed it with hidden iframes that third-party-cookie blocking later broke. The OAuth 2.0 Security Best Current Practice (RFC 9700, 2025) says clients should not use it, and the OAuth 2.1 draft removes it together with the resource-owner password grant, which handed the user's password to the client. Code plus PKCE replaces both.

## Client credentials and the device flow

With no user involved, such as a nightly export job or one service calling another, the client authenticates as itself:

```text
POST /token HTTP/1.1
Host: id.example.com
Authorization: Basic ZXhwb3J0LWpvYjpzM2NyZXQ=
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=orders:export
```

The `Basic` value is base64 of `export-job:s3cret`, which is why a shared secret is the weakest option: prefer `private_key_jwt` or mutual TLS (RFC 8705), so the IdP stores only a public key and a leaked config file is not a credential. The response carries an access token and no refresh token, because the client can ask again. Cache it until shortly before `expires_in`; fetching a token per request multiplies IdP load by your request rate.

The device flow (RFC 8628) serves a TV or a CLI that has no browser or no keyboard:

| # | Step | Exchange |
|---|---|---|
| 1 | Device asks for codes | `POST /device_authorization` with `client_id=tv-app&scope=openid profile` returns `device_code`, `user_code: "WDJB-MJHT"`, `verification_uri`, `expires_in: 1800`, `interval: 5` |
| 2 | Device shows the code | "Visit id.example.com/device and enter WDJB-MJHT", often as a QR code of `verification_uri_complete` |
| 3 | Device polls every 5 s | `POST /token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=…` returns `400 {"error": "authorization_pending"}` |
| 4 | Device polls too fast | `slow_down`: the interval grows by 5 seconds for every later poll |
| 5 | User approves on a phone | Signs in at the IdP, types the code, approves the request |
| 6 | Next poll | `200` with tokens, or `access_denied`, or `expired_token` after 30 minutes |

The user code is short enough to type: 8 letters from the 20-consonant alphabet in RFC 8628's example give $20^8 \approx 2.6 \times 10^{10}$ codes, about 34.6 bits, safe only because codes expire and the entry page limits guesses. The known abuse is device-code phishing: an attacker starts a flow and sends the victim a genuine IdP link with the attacker's code, and the victim's approval delivers tokens to the attacker's device. Approval screens that name the requesting app, short expiry and allowing the flow only where needed are the defences.

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
2. `aud` contains the client's own `client_id`, and `azp` equals it when there are several audiences.
3. The signature verifies with the key whose `kid` matches in the IdP's key set, under the algorithm configured for that key.
4. `exp` is in the future, within a small leeway; `iat` is recent.
5. `nonce` equals the value stored at step 1, so an ID token captured from another login cannot be replayed into this one.
6. The user is identified by the pair (`iss`, `sub`), never by `email`: addresses change and get reassigned, and an IdP that lets users set unverified emails would let anyone claim yours.

The ID token is for the client. An API must not accept it as a credential: its audience is the client, and it carries no scopes.

Discovery removes hand configuration: `GET https://id.example.com/.well-known/openid-configuration` returns the issuer, the authorization, token and userinfo endpoints, the supported algorithms and `jwks_uri`, which serves the public keys:

```json
{"keys": [
  {"kty": "RSA", "kid": "2026-09-a", "use": "sig", "alg": "RS256", "n": "0vx7agoebGcQSuu…", "e": "AQAB"},
  {"kty": "EC", "kid": "2026-12-b", "use": "sig", "alg": "ES256", "crv": "P-256", "x": "f83OJ3D2…", "y": "x_FEzRu9…"}
]}
```

Verifiers cache this set (minutes to a day, from its `Cache-Control`), look up each token's `kid`, and on an unknown `kid` refetch once, rate-limited, before failing. The refetch is what lets rotation (below) go unnoticed; the rate limit stops a flood of tokens with random `kid` values from becoming a flood of requests to the IdP.

## Under the hood: verifying a JWT

A JWT is three base64url segments, `header.payload.signature`, and the signature covers the ASCII bytes of `header.payload`. A correct verifier decodes the header and reads `kid`; finds that key in its own key set and takes the algorithm from its configuration for that key, never from the header; verifies the signature; and only then parses the payload and checks claims.

The second step is where two classic library bugs lived. RFC 7519 allows unsecured JWTs with `"alg": "none"`, and some libraries skipped verification when they saw it. In algorithm confusion, a token with `"alg": "HS256"` sent to an API expecting RS256 made libraries use the RSA public key, which anyone can download from the JWKS, as the HMAC secret, so the attacker could sign any claims with it. RFC 8725, the JWT best current practices, says what the fix is: pin the algorithm per key.

What a token costs, measured with Node 24.21 and OpenSSL 3.5.8 on one core of this lesson's machine, for a 10-claim payload of 194 bytes and for the same claims plus email, name, roles and 40 group names:

| Algorithm | Token | With 40 groups | Verify, signature only | Sign |
|---|---|---|---|---|
| HS256 | 364 B | 2,187 B | 8.2 µs | 9.2 µs |
| RS256, 2048-bit | 663 B | 2,486 B | 12.8 µs | 171 µs |
| ES256 | 407 B | 2,230 B | 49.7 µs | 29.1 µs |
| EdDSA (Ed25519) | 407 B | 2,230 B | 45.4 µs | 17.4 µs |

RSA verifies fast and signs slowly (verification uses a small public exponent), which suits an IdP that signs once and APIs that verify on every request. Every scheme costs tens of microseconds, against a session lookup's network round trip to a store, on the order of 0.2 to 1 ms inside one region. HS256 is symmetric: every verifier holds a key that can also mint tokens, so it fits only a service verifying its own tokens.

## Sessions versus JWTs in depth

Where the credential lives decides what an attacker needs:

| Storage | Page script can read it | Sent automatically | Main threat | Mitigation |
|---|---|---|---|---|
| `HttpOnly` cookie (Ascend) | No | Yes, subject to `SameSite` | CSRF | `SameSite`, an exact `Origin` check, a custom header |
| `localStorage` | Yes | No | XSS reads it and replays it from anywhere until it expires | None survives an XSS; keep long-lived tokens out |
| Memory, with the refresh token in an `HttpOnly` cookie | While the page lives | No | XSS acts during the page's life | Short access tokens; CSRF protection on the refresh endpoint |
| Backend-for-frontend (BFF) | No | The BFF's cookie | CSRF on the BFF | As for any cookie; OAuth tokens never reach the browser |

Size: Ascend's whole cookie is 58 bytes (`ascend_session=` and 43 characters). The smallest JWT above is 6 times that, and one that carries group memberships passes 2 KB. Browsers are required to support only about 4 KB per cookie (RFC 6265 asks for at least 4,096 bytes), many proxies and servers cap request headers at around 8 KB in total by default, and a cookie rides on every request, including those for scripts and images. Past a limit the symptom is a `431` or `400` from a proxy and one user who cannot log in, usually the one in the most groups.

Revocation: a session is a row. Deleting it, which is what Ascend's `logout` does, or deleting every row for a user through `idx_sessions_user_id`, which is `logout_everywhere`, takes effect on the next request. A JWT stays valid until `exp` unless every verifier consults something: a denylist of `jti` values kept for the token's lifetime, a per-user "reject tokens issued before T" timestamp, or introspection at the IdP (RFC 7662). Each is a lookup per request, the cost the JWT was chosen to avoid, so the working answer is a short access-token lifetime with revocation at the refresh step.

## When a JWT becomes the session

A long-lived JWT as the only login state fails in five specific ways:

1. **Logout does nothing on the server.** A stolen copy works until `exp`.
2. **Authorization goes stale.** Roles are copied in at issue, so a demoted admin stays one until expiry.
3. **Size creeps.** Each feature adds a claim until requests pass header limits.
4. **XSS becomes account takeover.** A token in `localStorage` is replayed from the attacker's machine; an `HttpOnly` session cookie can be abused only while the victim's page is open.
5. **One key forges everyone.** A leaked signing key mints tokens for any user, and replacing it logs everyone out unless rotation was designed in.

Ascend's ADR 0002 rejects JWTs on the same grounds: "Stateless verification is irrelevant with one service; revocation needs a denylist anyway; tokens in JavaScript-readable storage are exposed to XSS."

## Refresh-token rotation with reuse detection, traced

The hybrid keeps access tokens short, 5 to 15 minutes, and puts revocation on the refresh token, which only the authorization server sees and can store like a session. Rotation issues a new refresh token on every use and retires the old one; all tokens descended from one login form a **family**. A retired token presented again proves two parties hold the family, and the server cannot tell which is legitimate, so it revokes the family.

| Time | Actor | Presents | Server state afterwards | Result |
|---|---|---|---|---|
| 10:00 | App logs in | password | family F, current R1 | AT1 (10 min), R1 |
| 10:05 | Attacker copies R1 from a synced backup | | unchanged | |
| 10:10 | App refreshes | R1 | current R2, previous R1 | AT2, R2 |
| 10:40 | Attacker refreshes | R1 | F revoked | reuse detected, nothing issued |
| 10:50 | App refreshes | R2 | F revoked | rejected: the user signs in again |

If the attacker refreshes first (R1 for R2′), the app's next refresh presents R1, now retired, and the family dies with R2′ in it. Either way the theft is caught at the second presentation. Rotation cannot catch a thief who takes the *current* token from a device that then goes silent, which is why families also get an absolute lifetime (30 days, say) and an idle limit.

Strict detection has a false positive: two tabs refreshing at once, or a response lost after the server rotated, make the legitimate app present a just-retired token. Servers therefore allow a grace period of a few seconds in which the previous token returns the current successor, and clients allow one refresh in flight, with other callers waiting for its result. Sender-constrained tokens (DPoP, RFC 9449, or certificate-bound tokens) go further: a stolen token is useless without the private key that proves possession.

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

Lifetime trades exposure against issuer load. With a million active clients, 10-minute access tokens mean about 1,667 refreshes per second at the authorization server ($10^6 / 600$ s); 60-minute tokens mean about 278. A stolen token, or a demoted user's old permissions, lasts that long. Five to fifteen minutes is the usual compromise; long-running jobs refresh rather than ask for long tokens.

Every API checks, on every request, before any business logic:

- **Issuer**: `iss` is the IdP it trusts.
- **Audience**: `aud` names this API. With resource indicators (RFC 8707) a client asks for a token for one API, so a token for `billing-api` fails at `orders-api`, and a compromised API cannot replay its callers' tokens elsewhere.
- **Type**: access tokens in the RFC 9068 profile carry `"typ": "at+jwt"`. Checking it stops an ID token being accepted in the common misconfiguration where the client ID and the API's audience are the same string.
- **Time**: `exp` and `nbf` with a leeway for clock skew, typically 30 to 60 seconds.
- **Scope**: whole space-separated tokens, so `orders:read` is not found inside `orders:readonly`.

Scopes are ceilings on what the client may do for the user, not permissions: the API still decides whether *this user* may read *this order*. When an API calls another on the user's behalf, it exchanges the token (RFC 8693) for one with the downstream audience and a narrower scope rather than forwarding the original. The claim checks are an exercise in [security in design](/learn/system-design/building-blocks/security-in-design).

## Authorization models: RBAC, ABAC and ReBAC

| Model | Decision | Example rule | Fits | Breaks when |
|---|---|---|---|---|
| RBAC | User to roles to permissions | `admin` may delete any comment | A few roles; permissions not tied to single resources | Access depends on the resource, and roles such as `project-42-editor` multiply |
| ABAC | A policy over attributes of subject, resource, action and context | Allow `read` if `subject.dept == resource.dept` and `resource.level <= subject.clearance` | Compliance rules; time, device or location conditions | "Who can read X?" needs every policy evaluated; attributes are fetched per check |
| ReBAC | A walk over relationship tuples | A document's viewers include its editors and its folder's viewers | Sharing, groups and hierarchies: documents, drives, repositories | Deep graphs need caching, and correctness under concurrent edits needs snapshots |

Ascend is RBAC plus ownership. `CommentService::delete` allows the author or an admin and returns `Forbidden` otherwise; `InterviewService::get` returns `NotFound` for someone else's interview, so another user's record is indistinguishable from a missing one. "The author may" is already an attribute check, which is typical: real systems mix models.

### A Zanzibar check, traced

Google's Zanzibar paper (USENIX ATC 2019) describes the ReBAC service behind Drive and other products; OpenFGA and SpiceDB are open-source systems built on its model. Facts are tuples `object#relation@subject`, and a namespace configuration defines relations in terms of each other:

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

Each step is an indexed read; production checks run branches in parallel and cache subproblems. The subtle part is time. If Ana removes Bo from the folder and then adds a secret paragraph, a check evaluated on a stale replica could still show Bo the new text; the paper calls this the "new enemy" problem. Zanzibar returns a consistency token, a "zookie", with each write, and later checks are evaluated at a snapshot at least that new.

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

Single sign-on means one login at an IdP serves many applications, each keeping its own session created from the IdP's statement. Enterprise customers mostly bring SAML 2.0. In the service-provider-initiated flow, the app (the SP) redirects the browser to the IdP with a deflated, base64 `AuthnRequest` carrying an ID; the IdP authenticates the user and returns a page that auto-POSTs a base64 `SAMLResponse` to the SP's assertion consumer service (ACS) URL. Trimmed, the part that matters:

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

The SP checks the signature with the IdP's certificate from its metadata, `Issuer`, `Audience` (its own entity ID), `Recipient` and `Destination` (its ACS URL), both time windows, `InResponseTo` (an ID it issued and has not seen answered), and that the assertion ID has not been used before.

**Why XML signature wrapping bit people.** An XML signature does not sign "the document". `Reference URI="#_a7"` means: find the element whose ID is `_a7`, canonicalise it and compare its digest. The validator therefore answers "is element `_a7` intact?", while the application asks "what is the NameID of the assertion?", usually with an XPath such as the first `Assertion`. Mallory holds a genuine signed assertion for her own account. She adds a forged, unsigned assertion (`ID="_evil"`, NameID `admin@example.com`) where the application looks and moves her signed one where it does not, for example inside an `Extensions` element. The validator finds `_a7`, whose digest still matches, and reports success; the application reads the first assertion and logs Mallory in as admin.

A 2012 USENIX Security paper, "On Breaking SAML: Be Whoever You Want to Be", found wrapping variants in most of the frameworks it tested. A 2018 disclosure found a relative: with an IdP account `admin@example.com.evil.com`, insert a comment, `admin@example.com<!---->.evil.com`; canonicalisation ignores comments, so the signature still verifies, while several libraries returned only the text before the comment. Parser differentials, where the signature check and the application use two XML parsers that disagree, were still being fixed in widely used libraries in 2024 and 2025. The fixes: read identity only from the element the validator returned (verify, then use; never verify, then search), reject more than one assertion or an unexpected structure, parse once, and keep the library patched, because here a dependency bug is an authentication bypass.

## MFA and WebAuthn

| Factor | Mechanism | Stops credential stuffing | Stops real-time phishing |
|---|---|---|---|
| SMS code | A code sent to a phone number | Yes | No, and SIM swaps steal it |
| TOTP (RFC 6238) | HMAC-SHA-1 of a 30-second counter, truncated to 6 digits | Yes | No: a proxy relays the code inside its window |
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

A guess succeeds one time in a million, about three in a million when the server also accepts the neighbouring windows for clock drift, so the verification endpoint needs its own attempt limit. WebAuthn authentication, traced:

1. The server makes a random challenge (the specification asks for at least 16 bytes), stores it with the pending login, and sends it with `rpId: "example.com"` and the user's credential IDs.
2. The browser, not the page, writes `clientDataJSON`: `{"type": "webauthn.get", "challenge": "…", "origin": "https://example.com"}`.
3. The authenticator finds its credential for `example.com`, asks for a touch or biometric, and signs `authenticatorData` (the SHA-256 of the rpId, presence and verification flags, a counter) followed by SHA-256 of `clientDataJSON`, with the private key it created at registration.
4. The server checks the challenge is its own and unused, the origin and rpId hash are its own, the flags it requires are set, and the signature verifies with the public key stored at registration.

On a look-alike domain, step 2 records the look-alike origin and step 3 finds no credential for its rpId, so there is nothing to relay. No code-based factor has that property. Recovery is every factor's weak point: a recovery flow that falls back to email or SMS inherits their weaknesses.

## Key rotation procedures

Every signing key, client secret and certificate needs a rehearsed rotation that nobody notices. The pattern is overlap. For signing keys published in a JWKS, with verifiers caching it for up to an hour and access tokens living ten minutes:

| Step | JWKS publishes | IdP signs with | Tokens in circulation | Verifiers |
|---|---|---|---|---|
| Start | K1 | K1 | K1 | All know K1 |
| Publish K2 | K1, K2 | K1 | K1 | Stale caches lack K2, but nothing uses it yet |
| After one cache TTL | K1, K2 | K2 | K1 and K2 | Every cache has refreshed and knows K2 |
| After one token lifetime more | K2 | K2 | K2 | Every K1 token has expired |

Sign with K2 the moment it exists instead, and every verifier whose cache predates it rejects every new token for up to an hour unless it refetches on an unknown `kid`. Emergency rotation after a compromise skips the waits: remove K1 at once and accept that its tokens fail; clients with refresh tokens recover without a prompt, because refresh tokens are checked at the IdP, not with K1.

The same overlap applies elsewhere. Symmetric secrets (webhook HMAC keys, cookie-signing keys) are checked against the current and previous value. OAuth client secrets come two at a time, so a client deploys the new one before the old is revoked. SAML IdPs publish the next certificate in metadata before signing with it, and an SP that pinned one certificate by hand breaks on rotation day.

Ascend has none of these keys. Its session tokens are random values looked up by hash, so nothing needs rotating; the emergency equivalent of revoking a signing key is deleting rows from `sessions` (one user's through log-out-everywhere, everyone's with a single `DELETE`), after which everyone signs in again. Its one external credential, the AI provider key, is `preserve()` in `.railway/railway.ts`, so rotating it is a variable change and a redeploy.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A wave of 401s right after a key rotation, recovering within the hour | The IdP signed with a new `kid` before verifiers' JWKS caches refreshed | Publish first, wait one cache TTL, then sign; refetch on unknown `kid`, rate-limited |
| Users with two tabs are logged out at random | Concurrent refreshes present a just-retired token and trip reuse detection | A grace period of seconds; one in-flight refresh per client |
| A token issued for one API works at another | The API does not check `aud`, or both share an audience | Per-API audiences via resource indicators; check `aud` and `typ` |
| A demoted admin keeps admin rights for hours | Roles baked into long-lived tokens | Short access tokens; check roles at the resource; bump a per-user token version on role change |
| Some users get 431 or 400 at login, always the same people | Tokens or cookies carrying group lists pass header limits | Keep tokens small; look group membership up server-side |
| Any user can log in as any other through SAML | Signature wrapping, or the NameID read from a different element than the one verified | Use the verified element only; reject multiple assertions; patch the library |
| "Token not yet valid" from one host only | That host's clock has drifted past the leeway | NTP on every host; 30 to 60 seconds of leeway |

## Trade-offs

| | Opaque session (Ascend) | JWT access plus rotating refresh | Reference token with introspection | BFF holding OAuth tokens |
|---|---|---|---|---|
| Per-request cost | One store lookup, about a millisecond | Signature check, 8–50 µs measured, no I/O | A call to the IdP, or a cache | A session lookup at the BFF |
| Revocation | Immediate | At the next refresh; access tokens live out their minutes | Immediate, or after the cache TTL | Immediate |
| Size on the wire | 58-byte cookie | 0.4 to 2.5 KB per request | A short opaque string | A short cookie |
| Many services verify | Each must call the session store | Yes, offline, with the public key | Each must call the IdP | Only the BFF calls APIs |
| Secret material | Nothing to rotate | Signing keys and a rotation procedure | Credentials for introspection | OAuth client credentials on the server |
| Fits | One first-party web app | Many APIs, mobile and third-party clients | High-value APIs that need instant revocation | Browser apps using an external IdP |

## Interviewer follow-ups

**"Our SPA logs in through an external IdP. Where do the tokens live?"** Model answer: preferably not in the browser. A backend-for-frontend runs the code flow with PKCE as a confidential client, keeps the tokens server-side, and gives the browser an `HttpOnly`, `SameSite` session cookie with CSRF protection. If the SPA must hold tokens, access tokens live in memory for minutes and refresh tokens rotate with reuse detection. Common wrong answer: "a 24-hour JWT in `localStorage`", which turns one XSS into day-long account takeover.

**"How do you log a user out everywhere when APIs verify JWTs offline?"** Model answer: revoke every refresh-token family for the user so no new access tokens are issued, and accept that outstanding access tokens live out their 5 to 15 minutes; if that is too long, APIs check a per-user "not before" timestamp or a `jti` denylist kept only for the token lifetime. Common wrong answer: "delete the token on the client", which does nothing to a stolen copy.

**"Rotate the signing key with zero downtime."** Model answer: publish the new key in the JWKS, wait at least the longest cache TTL, switch signing, wait at least the longest token lifetime, remove the old key; verifiers select keys by `kid` and refetch on an unknown one. Common wrong answer: "swap the key in config and restart", which rejects every token signed with the old key and, if the order is reversed, every new one.

**"Model permissions for folders, documents, groups and link sharing."** Model answer: ReBAC: relationship tuples, `viewer` defined as direct viewers plus editors plus the parent folder's viewers, checks evaluated as cached graph walks, and a consistency token on writes so an unshare is respected before later edits. Common wrong answer: a role per document, or ACL lists copied down the folder tree, which explode in size and go stale when a folder moves.

**"A customer wants SAML SSO. What does your service check on each response?"** Model answer: a signature by the IdP's metadata certificate over the exact element whose NameID is used, exactly one assertion, issuer, audience, recipient and destination, the time windows, `InResponseTo`, and a replay cache of assertion IDs, through a maintained, patched library. Common wrong answer: "verify the signature", which is precisely the check that wrapping attacks pass.

## What mid-level engineers get wrong

- **Accepting an ID token as an API credential.** Its audience is the client, and it carries identity, not permission.
- **Implicit flow or `plain` PKCE in new code.** Tokens in URLs and verifiers in the front channel both leak.
- **Trusting the JWT header's `alg`.** The verifier's own configuration picks the algorithm, per key.
- **Long-lived JWTs as sessions.** Logout, demotion and theft all wait for `exp`.
- **Rotation without reuse detection, or reuse detection without a grace period.** The first misses theft; the second logs out users with two tabs.
- **Checking scope and forgetting the resource.** `orders:read` says the client may read orders, not that this user may read this order.
- **Identifying users by email from an IdP.** The stable key is (`iss`, `sub`).
- **Treating SAML signature validation as "the response is trusted".** Only the element that was verified is trusted.

## Senior signals

- You can trace the code flow with PKCE request by request and name the attack each of `state`, `nonce`, `code_challenge`, exact redirect matching and `iss` defeats.
- You separate the five artifacts (session, access, refresh, ID token, assertion) and never let one stand in for another.
- You choose between opaque sessions, JWTs and a BFF from measured costs (a 58-byte cookie against 0.4 to 2.5 KB tokens, microseconds against a round trip) and from how revocation must work.
- You design refresh-token rotation with families, reuse detection, a grace period and absolute lifetimes, and you know what it cannot catch.
- You pick RBAC, ABAC or ReBAC from the shape of the permission, can walk a Zanzibar check by hand, and know why consistency tokens exist.
- You run key rotation as publish, wait, switch, wait, retire, and you can say what Ascend's design saves it from: there are no signing keys to rotate.

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

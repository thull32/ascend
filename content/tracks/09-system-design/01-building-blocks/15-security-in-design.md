---
slug: security-in-design
title: "Security in design: threat modelling, identity, secrets and the boundaries on the diagram"
description: "How to put security into a system design rather than around it: a STRIDE threat model worked on a multi-tenant design, sessions versus JWTs with measured costs, the OAuth authorization-code flow with PKCE traced, service identity with mTLS, authorization models, multi-tenant isolation and the row-level-security pooling trap, envelope encryption traced through rotation and crypto-shredding, secrets rotation and SSRF."
minutes: 40
difficulty: hard
tags: [system-design, security, authentication, authorization, oauth, oidc, secrets, threat-modelling, stride, multi-tenancy, encryption]
---
A design review is going well. The architecture has a gateway, a dozen services, a queue, two databases and a cache. Someone asks: "when the reporting service calls the user service, how does the user service know it is the reporting service, and what stops it from asking for any user's data?" Silence. The internal network was trusted, every service could call every other with any argument, and the one compromised container (a dependency with a known vulnerability in the image) could read the entire user table through an API that was never meant to be called by anyone but the mobile app.

Security in design is a set of questions asked while drawing the diagram, not a checklist applied afterwards. Where are the trust boundaries? What is each caller's identity, and how is it proven? What may each identity do? Where do secrets live and how do they rotate? What does an attacker who gets past one boundary gain? This lesson works those questions through one concrete design, with the mechanisms that answer them and the failures a senior interviewer probes for.

## Trust boundaries and STRIDE

Draw the trust boundaries on the architecture diagram: the edges where the level of trust changes. Each crossing is where authentication and authorization happen and where data goes from untrusted to validated.

```mermaid
flowchart LR
    subgraph Internet["Untrusted"]
        U["Browser / mobile"]
    end
    subgraph Edge["Edge"]
        G["Gateway: TLS, token validation, rate limits"]
    end
    subgraph Internal["Internal (mTLS, authZ per call)"]
        S1["Invoices"]
        Q["Queue"]
        R["PDF renderer"]
    end
    subgraph Data["Data"]
        DB[("Postgres, tenant_id + RLS")]
        OB[("Object storage, private")]
        V["Secrets manager / KMS"]
    end
    U -->|"TLS 1.3"| G
    G -->|"mTLS + user token"| S1
    S1 --> DB
    S1 --> Q --> R
    R -->|"fetch logo URL"| X["Internet"]
    R --> OB
    S1 & R -.->|"short-lived creds, data keys"| V
```

**STRIDE** is the prompt list per element and flow: **S**poofing, **T**ampering, **R**epudiation, **I**nformation disclosure, **D**enial of service, **E**levation of privilege. Name the assets (invoice data, bank details, tokens, the signing key) and the attackers (an anonymous user, a malicious tenant, a compromised container, an insider reading logs). Worked on the design above, an invoicing API for a B2B SaaS where tenants render PDFs with their own logo and receive webhooks:

| Element | STRIDE | Threat | Mitigation |
|---|---|---|---|
| Browser → gateway | S | Stolen token replayed from another machine | 10-minute access tokens in `HttpOnly` cookies; rotating refresh tokens with reuse detection |
| Gateway → invoices | S, E | Client sends its own `X-Tenant-Id` header | Tenant taken only from the validated token; gateway strips inbound identity headers |
| Invoices API | E | `GET /invoices/{id}` with another tenant's ID (IDOR) | Lookup by `(tenant_id, id)`; row-level security as a second wall |
| Postgres | I | Pooled connection carries the previous tenant's setting | `SET LOCAL` inside the transaction; policies fail closed (traced below) |
| Queue → renderer | T | Forged render job for another tenant's invoice | Queue writable only by invoices' identity; renderer re-reads the invoice under the job's tenant |
| PDF renderer | I, E | Logo URL points at `169.254.169.254` (SSRF) | Isolated fetcher, egress proxy, IP checks after DNS and redirects, hardened metadata service |
| Object storage | I | Guessable PDF URLs or a public bucket | Private bucket; random keys; pre-signed URLs valid for minutes |
| Webhooks out | S | Tenant cannot tell our webhook from a forgery | HMAC signature with a per-tenant secret and a timestamp to stop replays |
| Admin actions | R | An admin denies voiding an invoice | Append-only audit log written by a role that cannot update or delete |
| Export endpoint | D | One tenant's bulk export starves the rest | Per-tenant token bucket; exports as quota-limited async jobs |

Ten rows, about fifteen minutes on a whiteboard, and every row is a design decision you would otherwise make in a postmortem. The reporting-service hole from the opening is the "Gateway → invoices" and "Invoices API" rows.

```viz
{"type": "system", "scenario": "request-flow", "nodes": 4,
 "title": "A request crossing three trust boundaries", "caption": "At each boundary the caller is authenticated and its request authorised. The gateway verifies the user; each internal hop verifies the calling service's identity and checks that the user context permits this operation on this resource."}
```

### From threats to controls and residual risk

A threat list becomes a plan when each row names its controls by kind (**prevent**, **detect**, **respond**) and states what is left. Scoring likelihood and impact from 1 to 5 is a team judgement, useful for ranking rather than measurement, but writing the residual row down is what makes it a decision instead of an assumption:

| Threat | Prevent | Detect | Respond | L × I before | L × I after | Residual risk, accepted by |
|---|---|---|---|---|---|---|
| Cross-tenant read | Tenant from the token only; lookups by `(tenant_id, id)`; RLS with `SET LOCAL` | Per-caller rate of 404s on other tenants' IDs; two-tenant integration tests | Revoke the caller's credentials, notify affected tenants from the audit log | 4 × 5 = 20 | 1 × 5 = 5 | A bug in the application check and the policy at once; engineering lead, reviewed each quarter |
| Stolen access token | 10-minute lifetime, `HttpOnly` cookies, rotating refresh tokens | Refresh-token reuse; logins from impossible locations | Revoke the refresh-token family | 3 × 4 = 12 | 2 × 2 = 4 | Up to 10 minutes of use; product owner |
| SSRF from the renderer | Isolated fetcher, egress proxy, IP checks after DNS and redirects, IMDSv2 | Flow logs showing egress to private or link-local ranges | Rotate the renderer's short-lived credentials | 4 × 5 = 20 | 1 × 4 = 4 | Proxy bypasses such as DNS rebinding; security team, tested yearly |
| Credential stuffing | Breached-password checks, MFA or passkeys, per-account and per-device buckets | Global ratio of failed to successful logins | Force resets on accounts that logged in during the attack | 5 × 3 = 15 | 3 × 2 = 6 | Reused passwords on accounts without MFA; product owns the MFA adoption target |
| Secret in a log or image | Secrets manager, short leases, redaction in the logger | Scanners on repositories, images and log stores | Rotate with two live versions | 3 × 4 = 12 | 2 × 2 = 4 | A leak valid until its lease ends; platform team |
| One tenant's export starves the rest | Per-tenant token bucket; exports as quota-limited jobs | Per-tenant saturation dashboards | Shed that tenant's jobs | 3 × 3 = 9 | 1 × 2 = 2 | Slower exports at peak; accepted |

Every threat keeps a residual row, and every residual has a name beside it. A review that ends with no residual column has implicitly accepted every remaining risk on behalf of nobody. The detect column is the one teams skip, and it decides whether a breach is found in minutes by an alert or months later by a customer.

## Authentication: who is calling

**Passwords** are stored with a slow, salted, preferably memory-hard hash, never reversible encryption. Measured with Python 3.14's `hashlib` on one core: one SHA-256 takes 0.19 µs, PBKDF2-SHA256 at OWASP's 600,000 iterations takes 49 ms, and scrypt with $N = 2^{17}$, $r = 8$ takes 202 ms and 128 MB. The slowdown is the point: a GPU that tries on the order of ten billion plain SHA-256 guesses per second manages on the order of ten thousand PBKDF2 guesses, and a memory-hard function also limits how many guesses run in parallel. argon2id is the current recommendation where a library is available. Credential stuffing (replaying passwords leaked elsewhere) is the dominant attack on logins; per-account limits, breached-password checks and MFA or passkeys are the defences.

**Sessions versus JWTs.**

| | Server-side session | JWT access token |
|---|---|---|
| Verification | Session-store lookup, about a millisecond over the network | Signature check, no I/O: 2.6 µs for HS256 measured in pure Python; tens of µs for RS256 or ES256 |
| Revocation | Delete the session: immediate | Not before expiry without a denylist, which reintroduces the lookup |
| Scaling | Store must be shared and available | Any instance verifies with the issuer's public key |
| Lifetime | Hours, sliding | 5–15 minutes, renewed from a revocable refresh token |

The senior pattern is the hybrid: short-lived access tokens verified statelessly by every service, issued from a refresh token held server-side. Logout or compromise revokes the refresh token; the access token's remaining minutes are the accepted exposure. Refresh tokens rotate on each use, and presenting an already-used one revokes the whole family, which turns a stolen refresh token into a detected one. A 24-hour JWT with no revocation is the mistake to name. In browsers, tokens live in `HttpOnly; Secure; SameSite=Lax` cookies (unreadable by injected script) with a CSRF token on state-changing requests, not in `localStorage`, where any XSS reads them.

### OAuth 2.0 and OIDC, traced

OAuth 2.0 is delegation: application A gets scoped access to a user's data at service B without the user's password. OIDC adds identity: an ID token (a JWT saying who the user is) beside the access token (a credential for APIs). The authorization-code flow with PKCE, for web, mobile and single-page apps, using the example verifier from RFC 7636:

| Step | Who | What happens |
|---|---|---|
| 1 | Client | Generates a random `code_verifier` (`dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`) and `code_challenge` = base64url(SHA-256(verifier)) = `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` |
| 2 | Client → IdP | Redirects to `/authorize?response_type=code&client_id=…&redirect_uri=…&scope=openid invoices:read&state=r4nd&code_challenge=E9Mel…&code_challenge_method=S256` |
| 3 | User ↔ IdP | Authenticates at the identity provider (password and MFA, or a passkey); the client never sees the credentials |
| 4 | IdP → client | Redirects to `redirect_uri?code=SplxlO&state=r4nd`; the client checks `state` matches, which stops login CSRF |
| 5 | Client → IdP | `POST /token` with the code, `redirect_uri` and the `code_verifier` |
| 6 | IdP | Checks SHA-256(verifier) equals the stored challenge, the code is unused and seconds to minutes old, and the redirect URI matches; returns access token, ID token and refresh token |
| 7 | Client → API | `Authorization: Bearer …`; the API checks signature (keys cached from the IdP's JWKS endpoint), `iss`, `aud`, `exp`, scope and tenant on every request |

An attacker who intercepts the code at step 4, through a malicious app registered for the same redirect scheme or a leaked log line, cannot complete step 5 without the verifier, which never left the client. The implicit flow, which returned tokens in the redirect, is deprecated. For service-to-service calls with no user, the **client-credentials** flow authenticates the service itself and returns a token scoped to what it may do. Sessions stored as hashed opaque tokens, timing-uniform login and CSRF layers are worked through in real application code in [Security fundamentals](/learn/senior-craft/software-craft/security-fundamentals).

**Services.** Inside the perimeter every call carries a service identity. Mutual TLS gives each workload a certificate valid for minutes to hours, issued by an internal CA and rotated automatically (SPIFFE/SPIRE is the standard shape; a mesh makes it uniform), so the user service knows the caller is reporting and can refuse it ([TLS and PKI](/learn/networking/fundamentals/tls-and-pki) covers certificates and chains). The user's context travels separately, as the user's token or a signed assertion from the gateway, so the callee checks both "may this service call me" and "may this user see this record".

```viz
{"type": "network", "scenario": "https-tls-handshake",
 "title": "TLS 1.3 handshake", "caption": "One round trip establishes keys and authenticates the server; with mutual TLS the client also presents a certificate and the server verifies it. Inside a mesh this happens between sidecars for every connection, giving each hop a proven identity."}
```

### Under the hood: validating a JWT, and rotating the key that signs it

A JWT's header names its own algorithm and key (`alg`, `kid`), which is exactly what an attacker controls. Three classic bypasses follow from trusting it: `alg: none` (an unsigned token accepted by libraries that honour the header); algorithm confusion, where a token signed with HS256 using the server's *public* RSA key as the HMAC secret passes a verifier that picks the algorithm from the header; and a `kid` used as a file path or database key without validation. The defence is to pin: each issuer maps to an allowed algorithm and a key set, and the verifier ignores the header's opinion. Then the claims checks in the exercise below run.

Keys rotate, and the order is what keeps every token valid through it. The IdP publishes keys at its JWKS endpoint, and verifiers cache that document (an hour here), refetching early when they see an unknown `kid`, with a rate limit so a flood of forged `kid`s cannot hammer the IdP:

| Time | Step | Why |
|---|---|---|
| T | Publish key k2 in the JWKS beside k1; keep signing with k1 | Verifiers learn k2 before any token needs it |
| T + 1 h (the JWKS cache lifetime) | Start signing with k2 | Every verifier has refreshed and knows k2 |
| T + 1 h + 11 min (token lifetime plus 60 s of clock leeway) | Remove k1 | No unexpired token signed with k1 remains |

An emergency rotation after a key leak skips the waiting: k1 is removed at once and every access token it signed fails. Users do not log in again, because refresh tokens are opaque and held server-side, but every active client refreshes on its next call. With 2 million active sessions, that is between 3,300 refreshes a second, if spread across the 10-minute token lifetime, and 33,000 a second if most clients call within the first minute, so the token endpoint's capacity plan includes the day a key leaks.

## Authorization: what the caller may do

| Model | Mechanism | Fits | Weakness |
|---|---|---|---|
| RBAC | Users have roles; roles have permissions | A small fixed set of roles | Role explosion when permission depends on the resource |
| ABAC | Policy over attributes of subject, resource, action, context | Rich rules, compliance | Hard to audit; evaluation cost |
| ReBAC | Relationship tuples (`doc:42#viewer@user:7`), checked by graph walk | Sharing, hierarchies (Google's published Zanzibar design and its open-source descendants) | Check latency needs caching and consistent snapshots |

The check happens at the resource, on every request, with the resource ID: `can(user, "read", invoice_7781)`, not `is_admin(user)`. Insecure direct object references (change the ID in the URL, read another customer's invoice) remain one of the most common real vulnerabilities, and each one is an authorization check nobody wrote. Least privilege applies to infrastructure too: a workload's database role reads its schema and nothing else, and its cloud role reads one bucket. Over-broad roles ("the pod can do anything, it was easier") are the elevation-of-privilege path in most cloud breaches.

## Multi-tenant isolation

| Model | Isolation | Cost per tenant | Noisy neighbour | Operations |
|---|---|---|---|---|
| Silo: database (or account) per tenant | Strongest; a bug leaks one tenant | Highest; idle capacity per tenant | None | N migrations, N backups, fleet tooling |
| Bridge: schema per tenant | Good; relies on connection routing | Medium | Shared hardware | Migrations × N schemas; catalogue bloat past thousands |
| Pool: shared tables with `tenant_id` | Only as good as every query | Lowest | Real; needs per-tenant quotas | One schema; isolation lives in code and policy |

Most SaaS runs the pool model for the long tail and silos the largest or most regulated tenants. In the pool model, Postgres row-level security puts a second wall under the application's `WHERE tenant_id = …`:

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;          -- apply to the table owner too
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
-- per request:
BEGIN;
SET LOCAL app.tenant_id = '6f1c2a9e-0000-4000-8000-000000000001';
SELECT * FROM invoices WHERE id = $1;                   -- another tenant's id: zero rows
COMMIT;                                                  -- SET LOCAL ends here
```

The trap is the connection pool. Traced with plain `SET` instead of `SET LOCAL`:

| Step | Pooled connection c1 | Request | Rows visible |
|---|---|---|---|
| 1 | `SET app.tenant_id = A` (session-wide) | Tenant A lists invoices | A's |
| 2 | Returned to the pool; the setting persists | — | — |
| 3 | Borrowed by a job that forgets to set the tenant | Lists invoices | **A's**, to the wrong caller |

With `SET LOCAL` the setting dies at `COMMIT`, so at step 3 `current_setting('app.tenant_id', true)` returns null, the policy compares to null, and the query returns zero rows: it fails closed. Two further holes: superusers and roles with `BYPASSRLS` ignore policies, so the application's role must have neither, and table owners ignore them unless `FORCE` is set. Isolation also covers capacity: per-tenant rate limits and query timeouts, so one tenant's export cannot starve the others.

## Secrets and keys

**Where secrets live.** In a secrets manager (Vault, a cloud store backed by a KMS), fetched by a workload that authenticates with its own identity. Never in the repository, the image or a committed environment file. Secrets in logs are the second most common leak: redact in the logging library and scan log stores.

**Rotation.** A secret that cannot rotate without downtime will not be rotated. Accept two versions at once: consumers accept old and new, the producer switches, the old one is retired. Short-lived credentials (database users issued for an hour by Vault, cloud credentials from instance identity, mTLS certificates for a day) make rotation continuous and a leak short-lived.

### Under the hood: envelope encryption, traced

Encrypting terabytes directly under a KMS key would make every read a network call and every rotation a rewrite. Envelope encryption keeps the key-encryption key (KEK) inside the KMS and encrypts data with data keys (DEKs):

| Step | Operation | KMS calls | Data touched |
|---|---|---|---|
| Write | KMS generates a DEK and returns it plaintext and wrapped under `tenant-a/v1`; the app encrypts locally with AES-256-GCM and stores the wrapped DEK beside the ciphertext | 1 | Encrypted once |
| Read | KMS unwraps the DEK; the app decrypts locally (cache the DEK for minutes to avoid a call per read) | 1, or 0 when cached | None rewritten |
| Rotate KEK to `v2` | KMS re-wraps each DEK from v1 to v2 without revealing it | 1 per DEK | **None**: ciphertext unchanged |
| Crypto-shred | Destroy the tenant's KEK (or a user's DEK) | 1 | Every copy, including backups and event logs, becomes unreadable |

The number of DEKs is a design choice: per row makes rotation a call per row (ten million calls, against account quotas of thousands to tens of thousands per second and a list price on the order of a few cents per ten thousand requests), per tenant or per file keeps it small. Runnable against the `cryptography` package, with a toy class in place of the cloud KMS:

```python
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM   # pip install cryptography

class ToyKMS:
    """Stands in for a cloud KMS: key-encryption keys never leave it; every call is a network round trip."""
    def __init__(self):
        self.keks, self.calls = {}, 0
    def create_key(self, key_id):
        self.keks[key_id] = AESGCM.generate_key(bit_length=256)
    def generate_data_key(self, key_id):
        self.calls += 1
        dek = AESGCM.generate_key(bit_length=256)
        nonce = os.urandom(12)
        wrapped = nonce + AESGCM(self.keks[key_id]).encrypt(nonce, dek, key_id.encode())
        return dek, wrapped                              # plaintext DEK for local use, wrapped DEK to store
    def decrypt(self, key_id, wrapped):
        self.calls += 1
        return AESGCM(self.keks[key_id]).decrypt(wrapped[:12], wrapped[12:], key_id.encode())
    def re_encrypt(self, old_id, new_id, wrapped):      # rotation: the DEK is re-wrapped inside the KMS
        self.calls += 1
        dek = AESGCM(self.keks[old_id]).decrypt(wrapped[:12], wrapped[12:], old_id.encode())
        nonce = os.urandom(12)
        return nonce + AESGCM(self.keks[new_id]).encrypt(nonce, dek, new_id.encode())
    def schedule_deletion(self, key_id):
        del self.keks[key_id]                            # real KMSs enforce a waiting period first

def encrypt_record(kms, key_id, record_id, plaintext):
    dek, wrapped = kms.generate_data_key(key_id)
    nonce = os.urandom(12)
    body = AESGCM(dek).encrypt(nonce, plaintext, record_id.encode())   # record id as associated data
    return {"kek": key_id, "wrapped_dek": wrapped, "nonce": nonce, "body": body}

def decrypt_record(kms, record_id, row):
    dek = kms.decrypt(row["kek"], row["wrapped_dek"])
    return AESGCM(dek).decrypt(row["nonce"], row["body"], record_id.encode())

kms = ToyKMS()
kms.create_key("tenant-a/v1"); kms.create_key("tenant-a/v2")
row = encrypt_record(kms, "tenant-a/v1", "inv_1", b"IBAN GB33BUKB20201555555555")
print(decrypt_record(kms, "inv_1", row))                                 # the plaintext
row["wrapped_dek"] = kms.re_encrypt("tenant-a/v1", "tenant-a/v2", row["wrapped_dek"])
row["kek"] = "tenant-a/v2"                                               # rotated: body bytes untouched
print(decrypt_record(kms, "inv_1", row), "| KMS calls so far:", kms.calls)   # 4
kms.schedule_deletion("tenant-a/v2")                                     # crypto-shred the tenant
try:
    decrypt_record(kms, "inv_1", row)
except KeyError:
    print("unreadable: every copy of the body, including backups, is noise")
```

The record ID passed as associated data binds each ciphertext to its row, so an attacker with database write access cannot swap one tenant's encrypted IBAN into another's row. Cloud KMSs make key deletion deliberately slow (AWS KMS enforces a waiting period of 7 to 30 days), which protects against accidental shredding.

**At rest and in transit.** TLS 1.3 everywhere, inside the data centre too; "the internal network is trusted" is the assumption every lateral-movement attack relies on. Disk encryption stops the stolen-drive attack and nothing else, since the database decrypts transparently for any query, including an injected one. Field-level encryption protects the columns that matter at the cost of indexing them; store a separate searchable token (an HMAC of the value, or the last four digits) when a feature must look them up.

## Abuse, injection and SSRF

Every unauthenticated endpoint is an abuse surface: login (credential stuffing), signup (account farming), password reset (enumeration), anything expensive (denial of wallet). Limit per account and device with the algorithms in [Rate-limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms), use IP as one signal in a risk score rather than the key (thousands of users share a university NAT; a botnet is one attacker on thousands of addresses), and never reveal whether an account exists.

```viz
{"type": "system", "scenario": "token-bucket", "requests": 10,
 "title": "Per-account bucket on the login endpoint", "caption": "Legitimate users never exhaust a bucket of five attempts per minute. A credential-stuffing run against one account is throttled after five, and a distributed run across many accounts is caught by a second bucket keyed on IP range and device."}
```

**Credential stuffing, in numbers.** An attacker holds a million email and password pairs from another site's breach and rents 10,000 residential proxy addresses. Each account is tried once, so a per-account limit of five attempts a minute never fires. Each address makes 100 attempts; at a per-IP limit of 10 a minute the whole run takes 10 minutes, and a university NAT sharing that limit would have been blocked first. If even 0.5% of the pairs are reused on your site (reuse rates vary widely by audience; the figure is an assumption), 5,000 accounts are taken over in those 10 minutes. The signals that do work are aggregate and per credential: the global ratio of failed to successful logins, which jumps when most attempts use wrong passwords; checking each password against known breaches at signup and login (the Pwned Passwords range API takes the first five hex characters of the password's SHA-1 and returns every matching suffix, several hundred of them, so the password never leaves your server); device fingerprints; and MFA or passkeys, which make a correct password insufficient.

Everything crossing a trust boundary is validated against a schema and reaches interpreters (SQL, shell, templates) through parameterised interfaces. Accept data, never serialised objects or templates. **SSRF** deserves its own line in every cloud review: a feature that fetches a user-supplied URL can be pointed at internal addresses, including the metadata endpoint at `169.254.169.254` that hands out the instance's credentials. Fetch from an isolated worker with no route inside, resolve the name and check the resolved IP against public ranges before connecting and again after every redirect, go through an egress proxy that blocks link-local and private ranges, and require session-token metadata access (IMDSv2 on AWS).

### Signing what you send: webhooks

A webhook is a request from you to a URL a tenant registered, and the tenant must be able to tell it from a forgery and from a replay. The scheme Stripe documents for its webhooks, and many providers copy, signs the timestamp and the exact body bytes with a per-tenant secret, and the receiver rejects anything older than five minutes:

```python
import hashlib, hmac, json

TOLERANCE_S = 300

def sign(secret: bytes, body: bytes, t: int) -> str:
    mac = hmac.new(secret, f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={t},v1={mac}"

def verify(secrets: list[bytes], body: bytes, header: str, now: int) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    t = int(parts["t"])
    if abs(now - t) > TOLERANCE_S:                 # stale or from the future: a replay, or a broken clock
        return False
    signed = f"{t}.".encode() + body                # the timestamp is inside the MAC, so it cannot be edited
    for secret in secrets:                          # current and previous secret during a rotation
        expected = hmac.new(secret, signed, hashlib.sha256).hexdigest()
        if hmac.compare_digest(expected, parts["v1"]):   # constant time: no byte-by-byte timing leak
            return True
    return False

old, new = b"whsec_old_2f9c", b"whsec_new_81ad"
body = json.dumps({"type": "invoice.paid", "invoice": "inv_1"}, separators=(",", ":")).encode()
h = sign(new, body, t=1_767_225_600)
print(verify([new, old], body, h, now=1_767_225_630))                              # True
print(verify([new, old], body.replace(b"inv_1", b"inv_2"), h, now=1_767_225_630))  # False: body changed
print(verify([new, old], body, h, now=1_767_226_000))                              # False: 400 s old
print(verify([new, old], body, sign(old, body, 1_767_225_600), now=1_767_225_601)) # True: old secret still valid
```

Three details carry the security. The receiver must verify the raw bytes it received, before any JSON parsing and re-serialisation, which would change whitespace and key order and break the MAC. The timestamp inside the signed payload bounds replays to the tolerance window; an event ID the receiver remembers for that window closes the rest. And rotation accepts two secrets for a period, so a tenant can roll its secret without dropping a single delivery.

**Audit and PII.** An append-only audit log (who did what to which resource, when) is the only answer to repudiation. Collect the minimum PII, tag it in the schema, and keep an inventory of every store that holds it: primary and replicas, caches, search indexes, the warehouse, backups and event logs. Deletion must reach all of them, and for backups and event logs ([Event-driven architecture](/learn/system-design/building-blocks/event-driven-architecture)) that means crypto-shredding. [Authentication and security](/learn/case-study-ascend/the-system/authentication-and-security) walks through these decisions in this platform's own code.

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Long-lived JWTs | A stolen token works for a day after "log out" | Access-token lifetime in the IdP config | 5–15 minute access tokens; rotating, revocable refresh tokens |
| Cross-tenant read via the pool | A customer sees another tenant's invoice, rarely and unreproducibly | Session-level `SET` of the tenant on pooled connections | `SET LOCAL` in a transaction; policies that fail closed; tests with two tenants |
| Missing authorization on internal APIs | A compromised service reads any user | Internal endpoints with no per-resource check | mTLS identity plus per-call authorization with user context |
| Secrets in logs or images | A password found by `docker history` or a log search | Secret scanners on repos, images, log stores | Secrets manager, redaction at the logger, short leases |
| Over-broad cloud roles | One pod exfiltrates every bucket | IAM analysis shows unused wildcard permissions | One role per workload, deny by default |
| SSRF to metadata | Instance credentials used from outside the account | Egress to link-local addresses in flow logs | Isolated fetcher, post-DNS IP checks, hardened metadata |
| Rate limiting by IP | A corporate customer blocked while stuffing succeeds | 429s concentrated on one legitimate ASN | Key on account and device; IP as a risk signal |
| Algorithm confusion | Forged tokens accepted; users act as other users | The verifier takes `alg` from the token header; HS256 tokens signed with the public key pass | Pin the algorithm and key set per issuer; ignore `alg` and reject `none` |
| Rotation that logs everyone out | A wave of 401s and a refresh storm right after a key change | Signing switched to a new key before verifiers' JWKS caches refreshed, or the old key removed while its tokens were live | Publish, wait out the cache lifetime, switch, wait out the token lifetime, remove |
| Webhook signatures that fail at random | Tenants report valid events rejected, mostly with non-ASCII or reordered fields | The receiver verifies re-serialised JSON rather than the raw body | Verify the raw bytes before parsing; document it in the webhook guide |

## Interviewer follow-ups

**"How does orders authenticate to users, and what stops it reading any user?"** Model answer: service identity from a short-lived mTLS certificate, checked against an allow-list of callers per endpoint; user context forwarded from the gateway, checked against the record's owner or tenant on every call. A compromised container gets one identity with a narrow allow-list and no user token. Common wrong answer: "they are on a private network", the assumption every lateral movement exploits.

**"JWT or sessions?"** Model answer: both: 10-minute access tokens verified statelessly (microseconds, no I/O), refresh tokens held server-side, rotated on use and revocable, in `HttpOnly` cookies with CSRF protection. Common wrong answer: "JWTs, because they scale", with a 24-hour lifetime and no way to log out.

**"Why does PKCE matter if the code is single-use?"** Model answer: single-use stops replay after the legitimate client redeems it, not an attacker who redeems it first; PKCE binds the code to a verifier that never left the client, so a stolen code is worthless. Common wrong answer: "it replaces the client secret", which misses that it protects public clients who cannot keep one.

**"Pool or silo for tenants?"** Model answer: pool for the long tail, with `tenant_id` in every key, row-level security with `SET LOCAL` as a second wall, per-tenant quotas; silo the largest or regulated tenants who pay for it. Common wrong answer: "a database per tenant for everyone", which is thousands of migrations and idle instances for tenants paying a few dollars a month.

**"A user requests deletion. Where is their data?"** Model answer: I read it off the PII inventory: primary and replicas (delete), caches (purge, TTL-bounded), search (delete by user), warehouse (scheduled job), backups and event log (crypto-shred the user's key). Common wrong answer: "delete the user row", which leaves copies in six other stores.

**"Your per-account login limit is five a minute. Does that stop credential stuffing?"** Model answer: no. Stuffing tries each account once, from thousands of addresses, so neither the per-account nor the per-IP limit fires: a million pairs over 10,000 proxies is 100 attempts per address, done in 10 minutes. The defences are aggregate and per credential: alert on the global failed-login ratio, check passwords against breach corpora at login, fingerprint devices, and push MFA or passkeys so a correct password is not enough. Common wrong answer: "lower the per-account limit", which punishes real users and never touches the attack.

**"How do you rotate the JWT signing key without logging anyone out?"** Model answer: publish the new key in the JWKS first, wait out the verifiers' cache lifetime, switch signing, then remove the old key after the longest token lifetime plus clock leeway. After a leak, remove it at once and size the token endpoint for every active client refreshing within minutes. Common wrong answer: "swap the key and restart the services", which invalidates every live token and depends on restart order.

## What mid-level engineers get wrong

- **Trusting the internal network.** One compromised container then reaches everything.
- **Authentication without per-resource authorization.** Known callers read any record by changing an ID.
- **Tenant from a header.** A client-supplied `X-Tenant-Id` makes every tenant any other tenant.
- **`SET` instead of `SET LOCAL` behind a pool.** The previous tenant's context leaks into the next request.
- **Fast hashes for passwords.** A plain or single-round hash turns a leaked table into cracked passwords within hours.
- **Encrypting at rest and calling it done.** Disk encryption does nothing against an injected query.
- **Threat models with no residual column.** Every remaining risk is accepted by nobody, and the detect controls that would find a breach are never built.
- **Letting the token choose its own algorithm.** A verifier that honours `alg` from the header accepts unsigned or confused tokens.

## Exercise: validate an access token's claims

```exercise
id: validate-claims
title: Check a decoded access token's claims before trusting it
prompt: |
  The signature has already been verified with a pinned algorithm. Check the
  decoded `claims` against `expected` at time `now` (seconds), in this order,
  and return the first failure, or `"ok"`:

  1. `iss` must equal `expected["iss"]`, else `"bad_issuer"`.
  2. `aud` may be a string or a list; it must contain `expected["aud"]`,
     else `"bad_audience"`.
  3. Expired if `exp` is missing or `now >= exp + leeway`: `"expired"`.
  4. If `nbf` is present and `now < nbf - leeway`: `"not_yet_valid"`.
  5. `scope` is a space-separated string; it must contain
     `expected["scope"]` as a whole token, else `"insufficient_scope"`.
  6. `tenant` must equal `expected["tenant"]`, else `"wrong_tenant"`.

  `leeway` is `expected["leeway"]`, the tolerated clock skew in seconds.
languages: [python, javascript]
entry: validate_claims
starter:
  python: |
    def validate_claims(claims, now, expected):
        # your code here
        return "ok"
  javascript: |
    function validate_claims(claims, now, expected) {
      // your code here
      return "ok";
    }
tests:
  - args: [{"iss": "https://id.example.com", "aud": "orders-api", "exp": 1000, "nbf": 0, "scope": "orders:read orders:write", "tenant": "t1"}, 900, {"iss": "https://id.example.com", "aud": "orders-api", "scope": "orders:read", "tenant": "t1", "leeway": 30}]
    expected: "ok"
    label: a valid token
  - args: [{"iss": "https://id.example.com", "aud": "orders-api", "exp": 1000, "nbf": 0, "scope": "orders:read orders:write", "tenant": "t1"}, 1030, {"iss": "https://id.example.com", "aud": "orders-api", "scope": "orders:read", "tenant": "t1", "leeway": 30}]
    expected: "expired"
    label: expired once now reaches exp plus leeway
  - args: [{"iss": "https://id.example.com", "aud": ["billing-api", "orders-api"], "exp": 1000, "nbf": 0, "scope": "orders:read orders:write", "tenant": "t2"}, 900, {"iss": "https://id.example.com", "aud": "orders-api", "scope": "orders:read", "tenant": "t1", "leeway": 30}]
    expected: "wrong_tenant"
    label: audience list accepted, tenant checked
  - args: [{"iss": "https://id.example.com", "aud": "billing-api", "exp": 1000, "nbf": 0, "scope": "orders:read orders:write", "tenant": "t1"}, 900, {"iss": "https://id.example.com", "aud": "orders-api", "scope": "orders:read", "tenant": "t1", "leeway": 30}]
    expected: "bad_audience"
    label: token minted for another API
  - args: [{"iss": "https://id.evil.example", "aud": "orders-api", "exp": 1000, "nbf": 0, "scope": "orders:read orders:write", "tenant": "t1"}, 900, {"iss": "https://id.example.com", "aud": "orders-api", "scope": "orders:read", "tenant": "t1", "leeway": 30}]
    expected: "bad_issuer"
    label: issuer is not the one you trust
  - args: [{"iss": "https://id.example.com", "aud": "orders-api", "exp": 1000, "nbf": 0, "scope": "orders:readonly", "tenant": "t1"}, 900, {"iss": "https://id.example.com", "aud": "orders-api", "scope": "orders:read", "tenant": "t1", "leeway": 30}]
    expected: "insufficient_scope"
    label: scopes are whole tokens, not substrings
  - args: [{"iss": "https://id.example.com", "aud": "orders-api", "exp": 1000, "nbf": 0, "scope": "orders:read orders:write", "tenant": "t1"}, 1029, {"iss": "https://id.example.com", "aud": "orders-api", "scope": "orders:read", "tenant": "t1", "leeway": 30}]
    expected: "ok"
    hidden: true
    label: inside the leeway
  - args: [{"iss": "https://id.example.com", "aud": "orders-api", "exp": 1000, "nbf": 1000, "scope": "orders:read orders:write", "tenant": "t1"}, 950, {"iss": "https://id.example.com", "aud": "orders-api", "scope": "orders:read", "tenant": "t1", "leeway": 30}]
    expected: "not_yet_valid"
    hidden: true
    label: not valid yet, beyond the leeway
hints:
  - "Normalise `aud` to a list before checking membership."
  - "Split `scope` on spaces; `\"orders:read\" in \"orders:readonly\"` is true for a substring check and wrong."
  - "Apply the leeway in the token's favour on both time checks."
```

## Senior signals

- You draw **trust boundaries** on the diagram and run STRIDE per element and flow, and can produce a table like the one above in fifteen minutes.
- You separate **authentication from authorization**, check per resource with the resource ID on every call, and take the tenant only from a validated token.
- You propose **short-lived access tokens with rotating, revocable refresh tokens**, can trace the authorization-code flow and say what PKCE defeats.
- You give every service an **identity** and a **least-privilege role**, and treat the internal network as hostile.
- You can defend a **tenancy model**, and you know the row-level-security pooling trap and how `SET LOCAL` fails closed.
- You use **envelope encryption** for rotation and crypto-shredding, keep secrets in a manager with short leases, and name **SSRF** for any URL-fetching feature.
- You turn threats into prevent, detect and respond controls with a named owner for each residual risk, pin token algorithms, rotate keys in a publish-wait-switch-wait-remove order, and sign webhooks over raw bytes with a timestamp.

## Check yourself

```quiz
- q: >-
    A web app uses JWT access tokens valid for 24 hours with no server-side state. A user reports their laptop stolen. What can the system do?
  options: ["Rotate the signing key, which invalidates only that user's token", "Nothing before expiry, unless each request checks a denylist", "Revoke the token immediately at the identity provider", "Force the token to expire by logging the user out everywhere"]
  answer: 1
  explanation: >-
    Stateless verification means no per-request check against revocation, so there is nothing to revoke or log out server-side. A denylist reintroduces the lookup; rotating the signing key logs out every user, not only this one. Short-lived access tokens with revocable refresh tokens bound the exposure to minutes.
- q: >-
    An attacker intercepts the authorization code in the redirect of an authorization-code flow that uses PKCE. Why can they not obtain tokens?
  options: ["The identity provider rejects codes from new IP addresses", "The state parameter binds the code to the user's cookie", "The token request needs the verifier the client kept", "The code is encrypted with the client's public key"]
  answer: 2
  explanation: >-
    The identity provider stored the challenge, a hash of the verifier, and only issues tokens to a request presenting a verifier that hashes to it. The verifier never left the client. The state parameter protects the client against login CSRF; it does not stop a stolen code being redeemed.
- q: >-
    A pooled service sets the tenant with SET app.tenant_id at the start of each request, and Postgres RLS filters on it. What can go wrong?
  options: ["RLS policies are ignored when a connection pool is used", "A request that skips the SET sees the previous tenant's rows", "The setting is lost between the statements of a single transaction", "Every query is slowed by a full scan to check the policy"]
  answer: 1
  explanation: >-
    A session-level SET persists on the pooled connection, so the next borrower inherits the last tenant. SET LOCAL ends at commit, and a policy using current_setting with the missing-ok flag then compares to null and returns no rows, failing closed. RLS still applies with a pool; the leak comes from session state.
- q: >-
    An attacker tries a million leaked email and password pairs against your login from 10,000 proxy addresses. Why does a per-account limit of five attempts a minute not stop it?
  options: ["The limit only counts attempts after a first successful login", "Stuffing tools solve the CAPTCHA the per-account limit relies on", "Changing IP address resets each account's attempt counter", "Each account is tried only once, so none reaches the limit"]
  answer: 3
  explanation: >-
    Stuffing spreads one attempt per account across thousands of addresses, so per-account limits never fire and per-IP limits allow about 100 attempts per address. What works is aggregate or per credential: the global failed-login ratio, breach checks on passwords, device fingerprints and MFA or passkeys. Per-account counters are keyed by account, not by IP.
- q: >-
    A feature fetches user-supplied URLs to render previews. The most important cloud-specific control is:
  options: ["Rate limiting preview fetches per user and per domain", "Fetching over HTTPS only, rejecting plain HTTP URLs", "Caching previews so each URL is fetched only once", "Blocking private and metadata IPs after resolving DNS"]
  answer: 3
  explanation: >-
    SSRF against the instance metadata endpoint yields instance credentials. Validation must block link-local and private ranges on resolved addresses and on every redirect, from an isolated fetcher and egress proxy with no internal reach. Rate limiting helps abuse but not this attack.
- q: >-
    Why is PBKDF2 with 600,000 iterations used for stored passwords instead of a single SHA-256?
  options: ["PBKDF2 output is reversible for password resets", "Each guess costs an attacker 600,000 times more work", "A single SHA-256 is too slow for login at scale", "SHA-256 has known collisions that expose stored passwords"]
  answer: 1
  explanation: >-
    The lesson measured 0.19 microseconds for one SHA-256 and 49 ms for PBKDF2 at 600,000 iterations: negligible per login, but it cuts an attacker's guess rate by the same factor. SHA-256 has no practical collisions, and password hashes are never reversible.
```

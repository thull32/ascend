---
lesson: security-in-design
source: e1f0b38fd0a88ea3
---
## 1

A web app uses JWT access tokens valid for 24 hours, with no server-side state. A user reports their laptop stolen. What can the system do?

A, rotate the signing key, which invalidates only that user's token. B, nothing before expiry, unless each request checks a denylist. C, revoke the token immediately at the identity provider. D, force the token to expire by logging the user out everywhere.

[think]

The answer is B: nothing before expiry, unless each request checks a denylist.

Stateless verification means no per-request check against revocation, so there is nothing to revoke, or log out, on the server. A denylist reintroduces the lookup, and rotating the signing key logs out every user, not only this one. Short-lived access tokens with revocable refresh tokens bound the exposure to minutes.

## 2

An attacker intercepts the authorization code in the redirect of an authorization-code flow that uses PKCE. Why can they not obtain tokens?

A, the identity provider rejects codes from new IP addresses. B, the state parameter binds the code to the user's cookie. C, the token request needs the verifier the client kept. D, the code is encrypted with the client's public key.

[think]

The answer is C: the token request needs the verifier the client kept.

The identity provider stored the challenge, a hash of the verifier, and only issues tokens to a request presenting a verifier that hashes to it. The verifier never left the client. The state parameter protects the client against login forgery; it does not stop a stolen code being redeemed.

## 3

A pooled service sets the tenant in a session setting at the start of each request, and Postgres row-level security filters on it. What can go wrong?

A, row-level security policies are ignored when a connection pool is used. B, a request that skips the setting sees the previous tenant's rows. C, the setting is lost between the statements of a single transaction. D, every query is slowed by a full scan to check the policy.

[think]

The answer is B: a request that skips the setting sees the previous tenant's rows.

A session-level setting persists on the pooled connection, so the next borrower inherits the last tenant. A setting scoped to the transaction ends at commit, so the next borrower finds no tenant, and the policy fails closed: it errors or matches no rows. Row-level security still applies with a pool; the leak comes from session state.

## 4

An attacker tries a million leaked email and password pairs against your login, from 10,000 proxy addresses. Why does a per-account limit of five attempts a minute not stop it?

A, the limit only counts attempts after a first successful login. B, stuffing tools solve the CAPTCHA the per-account limit relies on. C, changing IP address resets each account's attempt counter. D, each account is tried only once, so none reaches the limit.

[think]

The answer is D: each account is tried only once, so none reaches the limit.

Credential stuffing spreads one attempt per account across thousands of addresses, so per-account limits never fire, and limits per IP address allow about 100 attempts per address. What works is aggregate or per credential: the global ratio of failed logins, breach checks on passwords, device fingerprints, and multi-factor authentication or passkeys. Per-account counters are keyed by account, not by IP.

## 5

A feature fetches user-supplied URLs to render previews. What is the most important cloud-specific control?

A, rate limiting preview fetches per user and per domain. B, fetching over HTTPS only, rejecting plain HTTP URLs. C, caching previews, so each URL is fetched only once. D, blocking private and metadata IP addresses after resolving DNS.

[think]

The answer is D: blocking private and metadata IP addresses after resolving DNS.

Server-side request forgery against the instance metadata endpoint yields the instance's credentials. Validation must block link-local and private ranges on the resolved addresses, and on every redirect, from an isolated fetcher and egress proxy with no internal reach. Rate limiting helps against abuse, but not against this attack.

## 6

Why is PBKDF2 with 600,000 iterations used for stored passwords, instead of a single SHA-256?

A, PBKDF2 output is reversible for password resets. B, each guess costs an attacker 600,000 times more work. C, a single SHA-256 is too slow for login at scale. D, SHA-256 has known collisions that expose stored passwords.

[think]

The answer is B: each guess costs an attacker 600,000 times more work.

Each guess has to run the hash 600,000 times. The lesson measured 0.19 microseconds for one SHA-256 call, and 49 milliseconds for PBKDF2 at 600,000 iterations, about 260 thousand times longer in that measurement: negligible per login, but it cuts an attacker's guess rate by that order of magnitude. SHA-256 has no practical collisions, and password hashes are never reversible.

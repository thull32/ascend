---
lesson: security-in-design
source: 7d36a469345c9a5c
fit: great
desk:
  - "The STRIDE table and the controls-and-residual-risk table for the invoicing design"
  - "The OAuth authorization-code flow with PKCE, step by step"
  - "The row-level security policy and the SET versus SET LOCAL trace"
  - "The envelope encryption code and the webhook signing code"
  - "Exercise: validate an access token's claims"
---
## Introduction

A design review is going well. A gateway, a dozen services, a queue, two databases and a cache. Then someone asks: when the reporting service calls the user service, how does the user service know it is the reporting service, and what stops it asking for any user's data? Silence. The internal network was trusted. Every service could call every other with any argument. And one compromised container, a dependency with a known vulnerability in its image, could read the entire user table through an API that was only ever meant for the mobile app.

Security in design is a set of questions you ask while drawing the diagram, not a checklist applied afterwards. Where are the trust boundaries? Who is each caller, and how is it proven? What may each caller do? Where do secrets live, and how do they rotate? And what does an attacker who gets past one boundary gain?

We will take those questions in order, on one design: an invoicing API for business customers, where each tenant renders PDFs with its own logo and receives webhooks.

## Boundaries and threats

Start by drawing the trust boundaries on the diagram: the edges where the level of trust changes. Internet to gateway. Gateway to internal services. Services to data. Every crossing is where authentication and authorization happen, and where data goes from untrusted to validated.

Then walk every element and every flow with STRIDE, a prompt list: spoofing, tampering, repudiation, information disclosure, denial of service, and elevation of privilege. Name the assets, invoices, bank details, tokens, the signing key, and the attackers: an anonymous user, a malicious tenant, a compromised container, an insider reading logs.

A few of the rows it produces. A client sends its own tenant header: so the tenant is taken only from the validated token, and the gateway strips any identity headers coming in. A request asks for an invoice by an ID that belongs to another tenant: so every lookup is by tenant and ID together, with row-level security in the database as a second wall. The PDF renderer fetches a logo URL that points at the cloud's internal metadata address: that is server-side request forgery, and it gets an isolated fetcher. An admin denies voiding an invoice: an append-only audit log. One tenant's bulk export starves the rest: a per-tenant quota. Ten rows, about fifteen minutes on a whiteboard, and every row is a decision you would otherwise make in a postmortem.

A threat list becomes a plan when each row names its controls by kind, prevent, detect and respond, and writes down the risk that is left, and who accepted it. A review with no residual column has accepted every remaining risk on behalf of nobody. And the detect column is the one teams skip. It decides whether a breach is found in minutes by an alert, or months later by a customer.

## Who is calling

Passwords first. They are stored with a slow, salted hash, never with reversible encryption. The lesson measured it. One SHA-256 takes about 0.2 microseconds. PBKDF2 at the recommended 600 thousand iterations takes 49 milliseconds. That slowdown is the point: a GPU that tries on the order of ten billion plain SHA-256 guesses a second manages on the order of ten thousand PBKDF2 guesses. Memory-hard functions go further, and argon2id is the current recommendation where a library is available.

Next, sessions or tokens. A server-side session is a store lookup, about a millisecond over the network, and you can revoke it instantly by deleting it. A signed JSON web token, a JWT, is verified with no network call at all, a few microseconds, but it cannot be revoked before it expires without a denylist, which brings the lookup back.

The senior answer is both. Short-lived access tokens, 5 to 15 minutes, verified statelessly by every service, issued from a refresh token held on the server. Logout or compromise revokes the refresh token, and the access token's remaining minutes are the accepted exposure. Refresh tokens rotate on every use, and presenting one that was already used revokes the whole family, which turns a stolen refresh token into a detected one. In browsers, tokens live in cookies that script cannot read, not in local storage, where any injected script reads them.

For delegated login, the flow is OAuth's authorization code with PKCE. The client invents a random secret, the verifier, and sends only its hash with the login redirect. The user signs in at the identity provider, and the client gets back a one-time code. To swap the code for tokens, the client must present the original verifier. So an attacker who intercepts the code, through a malicious app or a leaked log line, cannot redeem it. The verifier never left the client.

Services need identity too. Inside the perimeter, every workload gets a mutual TLS certificate valid for minutes to hours, rotated automatically, so the user service knows the caller is reporting and can refuse it. The user's context travels separately, so the callee checks two things: may this service call me, and may this user see this record.

Two traps in token validation. A token's header names its own algorithm and key, which is exactly what an attacker controls. Trust it, and you may accept an unsigned token, or one signed with your own public key used as a shared secret. So pin the algorithm and key set per issuer, and ignore the header's opinion. And rotate signing keys in order: publish the new key, wait out the verifiers' cache, switch signing, wait out the token lifetime, then remove the old key. After a leak you skip the waiting, and every active client refreshes at once. With 2 million active sessions, that is somewhere between 3,300 and 33 thousand refreshes a second, so the token endpoint's capacity plan includes the day a key leaks.

## What the caller may do

Authorization happens at the resource, on every request, with the resource's ID: may this user read invoice 7781, not "is this user an admin". Change the ID in the URL and read another customer's invoice: that falls under broken access control, first in the current OWASP top ten, and each one is an authorization check nobody wrote. Least privilege applies to infrastructure as well: a workload's database role reads its own schema, and its cloud role reads one bucket.

Multi-tenant isolation has three shapes. A silo gives each tenant its own database: strongest isolation, highest cost, and a thousand migrations. A pool puts everyone in shared tables with a tenant column: cheapest, and only as safe as every query. Most software-as-a-service runs the pool for the long tail and silos the largest or most regulated tenants.

In the pool, Postgres row-level security adds a policy under every query: only rows whose tenant matches a setting on the connection. Now the trap. Request one sets the tenant to A with a plain set, which lasts for the whole connection session. The connection goes back to the pool. A background job borrows it and forgets to set a tenant. Whose invoices does it see?

[pause]

Tenant A's, handed to the wrong caller, rarely and unreproducibly. The fix is set local, inside a transaction, so the setting dies at commit. Then the forgetful job finds an empty setting, the policy's type conversion raises an error, and the query fails instead of leaking. It fails closed. Two more holes: superusers and roles allowed to bypass the policy ignore it, so the application's role must be neither, and table owners ignore it unless the policy is forced.

## Secrets and keys

Secrets live in a secrets manager, fetched by a workload that proves its own identity. Never in the repository, the image, or a committed environment file. Logs are the second most common leak, so redact in the logging library and scan the log stores. And a secret that cannot rotate without downtime will not be rotated, so accept two versions at once: consumers accept old and new, the producer switches, the old one retires. Short-lived credentials, a database user issued for an hour, make rotation continuous and a leak short.

For encrypting data, the pattern is envelope encryption. The master key, the key-encryption key, never leaves the KMS. Data is encrypted locally with data keys, and each data key is stored next to its ciphertext, wrapped by the master key. To rotate the master key, the KMS re-wraps each data key without revealing it, and not one byte of the data is rewritten. And to delete a tenant everywhere, you destroy its master key, crypto-shredding, and every copy, including backups and event logs, becomes unreadable noise. How many data keys you have is a design choice: one per row makes rotation ten million KMS calls, one per tenant or per file keeps it small.

Two warnings. Disk encryption stops the stolen-drive attack and nothing else, because the database decrypts for any query, including an injected one. And use TLS everywhere, inside the data centre too. "The internal network is trusted" is the assumption every lateral-movement attack relies on.

## Abuse at the edges

Every unauthenticated endpoint is an abuse surface, and the classic one is credential stuffing. An attacker holds a million email and password pairs from another site's breach, and rents 10 thousand residential proxy addresses. Your per-account limit is five attempts a minute. Does it help?

[pause]

No. Each account is tried once, so the per-account limit never fires. Each address makes 100 attempts, so at a per-address limit of 10 a minute, the whole run takes 10 minutes, and a university sharing one address would have been blocked first. If even half a percent of those pairs are reused on your site, and the lesson flags that figure as an assumption, 5 thousand accounts are taken over in those 10 minutes. What works is aggregate and per credential: alert on the global ratio of failed to successful logins, check passwords against known breaches at signup and login, fingerprint devices, and push a second factor or passkeys, so a correct password is not enough. Use the IP address as one signal in a risk score, never the key.

Server-side request forgery deserves a line in every cloud review. Any feature that fetches a user-supplied URL can be pointed at internal addresses, including the metadata endpoint that hands out the instance's credentials. Fetch from an isolated worker with no route inside, check the resolved address before connecting and again after every redirect, go through an egress proxy that blocks private ranges, and harden the metadata service.

And sign what you send. A webhook signature covers a timestamp and the exact body bytes, with a per-tenant secret. The receiver rejects anything older than five minutes, which bounds replays, verifies the raw bytes before parsing any JSON, and accepts two secrets during a rotation, so a tenant can roll its secret without dropping a delivery.

## In the interview

Here is the opening question, as an interviewer asks it. How does orders authenticate to users, and what stops it reading any user? Service identity from a short-lived mutual TLS certificate, checked against an allow-list of callers per endpoint, and user context forwarded from the gateway, checked against the record's owner or tenant on every call. A compromised container gets one identity, a narrow allow-list and no user token. The wrong answer is "they are on a private network", the assumption every lateral movement exploits.

And: why does PKCE matter if the code is single-use anyway?

[pause]

Single-use stops a replay after the real client redeems the code. It does not stop an attacker who redeems it first. PKCE binds the code to a verifier that never left the client, so a stolen code is worthless. The wrong answer is "it replaces the client secret", which misses that it protects public clients who cannot keep one.

## Recap

Four things to remember. Draw trust boundaries on the diagram, walk STRIDE over every element, and write down the detect controls and who accepted each residual risk. Separate who is calling from what they may do: short-lived access tokens with rotating, revocable refresh tokens, a service identity on every hop, and an authorization check per resource, with the tenant taken only from the token. In a pooled database, use set local so row-level security fails closed. And keep secrets in a manager with short leases, use envelope encryption for rotation and crypto-shredding, and expect credential stuffing and request forgery at the edges.

At your desk: the two threat tables, the PKCE flow, the row-level security trace, the encryption and webhook code, and the token-claims exercise.

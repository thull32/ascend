---
lesson: security-fundamentals
source: 4166c75a12d5c05d
fit: great
desk:
  - "The OWASP table: each risk family as an exploit, a fix, and Ascend's control"
  - "The injection, access-control and SSRF scripts, run against the toy app"
  - "The password-hash cost table and the hashing semaphore code"
  - "The four forged requests traced through the CSRF layers"
  - "The Content Security Policy and the rate-limit key table"
  - "Exercise: implement the CSRF gate"
---
## Introduction

Most breaches do not need a zero-day. They need one endpoint that returns another user's data when you change the ID in the URL. A login that answers in 2 milliseconds for unknown emails and 100 for real ones. A session table storing tokens in plain text. Or a rate limiter keyed on a header the attacker controls. Small decisions, made by someone thinking about features.

Security at the senior level is a habit: at every boundary, ask who controls this input, and what happens if they lie.

Five areas, then. Access control and injection. Passwords and sessions, and why they need different hashes. Cross-site request forgery and its three layers. Scripting attacks and the content security policy. And rate limits, which are only as good as their key.

## The map, and two exploits

The OWASP Top 10 is a map of where applications fail. Broken access control is first. Then cryptographic failures, injection, insecure design, misconfiguration, vulnerable components, authentication failures, software integrity, missing monitoring, and server-side request forgery.

The lesson runs each as an exploit against a toy notes app. Take broken access control. Ada is logged in and asks for note 11. The handler looks it up by ID alone, so she reads Bob's recovery codes. She was authenticated, but never authorised. The fix is to put the owner in the query itself: where the ID matches and the owner is the caller. Ascend's interview service does exactly that, and returns "not found" for another user's interview, so it looks identical to a missing one. A check in the query beats "fetch, then compare", because the safe path becomes the only path.

Injection next. The search builds SQL by pasting in the user's term. The attacker types a quote, then "or 1 equals 1", then a comment marker. The quote closes the string, the "or" makes the condition true for every row, and the comment swallows the rest. Every user's notes come back. With a parameterised query, the driver sends the statement and the value separately, so the database never parses the value as SQL. The quote is just a character, and the search returns nothing.

Server-side request forgery has a nasty twist. A link-preview feature blocks "localhost" and "127.0.0.1" by string. But the resolver happily accepts 127.0.0.1 written as one big number, or in hex, or disguised inside an IPv6 address. The string check never sees it. The fix is to resolve the name, check every address, connect to the address you checked, and re-check on every redirect. The durable fix is structural: fetch from a worker with no route to internal networks.

## Passwords: make every guess expensive

A stolen password table is attacked offline, at the attacker's pace, so every guess must be expensive. Here are the numbers from the lesson. One pass of SHA-256 takes under a microsecond, and one high-end GPU runs about 22 billion guesses a second. Argon2id, with Ascend's settings, takes about 12 milliseconds and 19 mebibytes of memory per hash. A GPU with 24 gibibytes can hold only about 1,300 of those at once. Memory is the wall. And a random salt per password means identical passwords get different hashes, so precomputed tables are useless.

That cost lands on your server too. A review found the gap. Hashing was moved off the async workers, which is right, but onto a blocking pool that grows to 512 threads. 512 hashes at 19 mebibytes each is about 9 and a half gibibytes, far past the container's memory. Now a semaphore admits one hash per CPU, minimum two. The rule generalises: move CPU-heavy work off the async workers, and bound how much runs at once.

On password rules, length beats composition. Ascend requires 15 to 200 characters, following NIST's 2025 guidance: at least 15 for a password used alone, no composition rules, and screening against breached passwords. That screening uses Have I Been Pwned with k-anonymity: the server sends only the first five hex digits of the password's hash, gets back every breached hash with that prefix, and compares locally. If the service is down, sign-up proceeds. The check raises the floor; it must not become a way to take sign-up down.

## Login, and sessions stored hashed

Login must not leak who has an account. For an unknown email, Ascend still verifies the password, against a precomputed dummy hash, so both branches pay one hash and return the same message. Otherwise a stopwatch enumerates accounts. And "precomputed" took a fix: the dummy hash was computed lazily, by the first unknown-email login after each boot, which made that one response twice as slow. Now it is warmed before the server starts. A timing defence has to cover the first call too.

After login, the browser gets a session token: 32 random bytes. The sessions table stores only the token's SHA-256, so a stolen table holds hashes that cannot become cookies.

Here is a question interviewers love. Passwords get slow Argon2id, but session tokens get fast SHA-256. Is that inconsistent?

[pause]

No. Slow hashing compensates for low entropy. A password is a few dozen bits of human-chosen text, so each guess must be slow. A 256-bit random token cannot be found at any guess rate: at a trillion guesses a second, searching half the space takes about 10 to the 57 years. Using Argon2id for tokens would slow every request and change no attack.

Opaque tokens also make revocation trivial: delete the row, and it takes effect at once. A self-contained token like a JWT has to wait for expiry, or keep a denylist, which is a session table again. The cookie itself is HTTP-only, same-site Lax, and Secure, and production refuses to boot without Secure.

## CSRF: three layers

Browsers attach cookies to requests triggered by other sites. If an evil site serves a form that auto-submits a POST to your API, the victim's browser sends their session cookie with it. Your server sees a valid session and a plausible request. Ascend stacks three independent defences.

First, same-site Lax cookies. Browsers withhold the cookie from cross-site POSTs, PUTs and DELETEs. Lax still sends it on top-level GET navigations, which is why a GET must never change state. Second, an origin check. On every mutating request, the Origin header, or the origin part of the Referer, must exactly equal the configured public origin: scheme, host and port. Third, a required custom header on every mutating request. A page on another origin cannot set a custom header without a CORS preflight, and this server never grants one.

Why three? Because each covers the others' gaps. Same-site is not same-origin: a compromised sibling subdomain counts as the same site, and its cookie gets through. And the layering paid off once. The first Referer check compared by prefix, so a look-alike domain that began with the real origin passed. The custom header still blocked the forged requests. The fix parses the origin and compares for equality. Compare security identifiers by parsing and equality, never by prefix.

One honest limit: an attacker with a stolen cookie, using a command-line tool and setting the header, gets through. That is session theft, and no CSRF defence addresses it.

## Scripting and the content security policy

Cross-site scripting is injection into HTML: a comment containing an image tag with an error handler, pasted into a page, runs script with the victim's session. The first defence is the renderer. React escapes text, and Ascend's codebase now has no raw-HTML insertion at all.

The second defence is the content security policy, which tells the browser what the page may load and run even if an injection slips through. The key line is what it leaves out: no inline scripts. That is what blocks injected script tags and inline event handlers.

The policy does allow eval, a documented weakening, because the in-browser Python and JavaScript runners need it. It is compensated elsewhere: learner code runs in Web Workers with no page access, the JavaScript worker loses its network APIs, and every worker is terminated at a time limit. A review also tightened images. The policy allowed images from any HTTPS host, and an injected image tag pointing at an attacker's server can carry data off a page with no script at all. Every source in a policy should be there because a feature needs it.

Learner code on the server gets the same suspicion. Once progress mattered, the browser's "all tests passed" became a claim anyone could forge. Now the server grades the same code itself, in a WebAssembly sandbox with no network, no environment variables and no other files, under time and memory limits.

## Rate limits and the IP you can trust

Ascend has seven rate limits, and the interesting decision in each is the key. Password attempts: 10 a minute, keyed by the known device, otherwise by the account. Model calls: 20 a minute, per session. Sign-up and login routes: 30 a minute per IP.

Most of those keys came from one review finding. A class or an office shares one network address, and per-IP limits punish it. The AI limit used to be per IP, so thirty learners behind one address shared twenty calls a minute.

A per-account limit has its own price: anyone who knows your email can spend your ten attempts. So Ascend uses OWASP's device-cookie pattern. A successful login sets a long-lived device cookie. Logins from a known device are charged to that device's own bucket; unknown devices share the account's. A test exhausts the account bucket with wrong guesses and asserts that the owner's browser still signs in.

And the limits used to live in each process's memory, which is right for one replica and quietly wrong for two, since two processes allow twice every limit. The security limits now live in Postgres, one atomic statement per check.

Finally, a limiter is only as good as its key. Suppose a limiter keys login attempts on the first IP in the X-Forwarded-For header. The attacker can send a new fake IP with every request, and get a fresh bucket every time. Proxies append to that header; they do not remove what the client sent. Ascend reads the client IP only from a header its trusted edge sets itself, and otherwise uses the socket address.

## In the interview

A follow-up the lesson expects: how do you stop credential stuffing without locking out whole offices?

[pause]

Limit per account, because the attacker cannot vary that key, but give known devices their own bucket so guesses cannot lock out the owner. Keep per-IP limits loose, because offices share addresses. Add breached-password screening and multi-factor authentication, and alert on distributed failure patterns. The wrong answer is "block the IP after five failures", which punishes a school and does nothing against a botnet.

And: our preview feature blocks 127.0.0.1 and the cloud metadata address. Is server-side request forgery handled? No. Numeric and IPv6-mapped encodings, names that resolve to internal addresses, rebinding between check and connect, and redirects all pass a string list. Resolve, check, connect to the checked address, re-check every redirect, and isolate the fetcher. Not "add more entries to the blocklist".

## Recap

Five things to remember. Ask who controls this input at every boundary, headers included. Authorise in the query, scoped by owner, and answer "not yours" with a 404. Slow, salted, memory-hard hashes for passwords, a fast hash for 256-bit tokens, and login that is uniform in timing and message. Layer your CSRF defences, compare origins by parsing and equality, and treat every weakened control as a documented trade-off with named compensations. And a rate limit is only as good as its key.

At your desk: the full OWASP table, the three toy exploits, the hash cost table, the CSRF trace, the content security policy and rate-limit tables, and the CSRF gate exercise.

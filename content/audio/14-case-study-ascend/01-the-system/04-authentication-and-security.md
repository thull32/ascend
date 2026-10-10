---
lesson: authentication-and-security
source: 488070a046e5fe25
fit: great
desk:
  - "The threat table and the login sequence diagram"
  - "The Argon2 semaphore, the session token and authenticate code, and the CSP string"
  - "The shared rate limiter's conditional upsert and its trace of the password quota"
  - "Exercise: reproduce the CSRF decision as a pure function"
---
## Introduction

Ascend lets people sign up with an email and a password, by invite for now, and behind the login sits an API that costs real money per request. That attracts every classic attack: credential stuffing, a stolen database backup, a page that makes a signed-in learner's browser post on their behalf, script injection, bots enumerating accounts, and scripts that burn the AI budget.

None of the defences is exotic. What is worth studying is how they are layered, and what a reviewer found wrong in each. Five stories: a password hash that was a denial-of-service amplifier, the doors that still reveal whether an account exists, session tokens hashed with a fast hash on purpose, a CSRF bug that defence in depth absorbed, and rate limits that multiplied with replicas.

## Passwords: an amplifier, bounded

Passwords are hashed with Argon2id at the library defaults: 19 mebibytes of memory and two passes over it per guess. An attacker with a GPU can compute billions of SHA-256 hashes a second, but cannot give thousands of parallel cores 19 mebibytes each. Memory-hardness turns the attacker's advantage from thousands to one into something close to one to one. bcrypt was acceptable but not memory-hard; PBKDF2 is GPU-friendly; a fast salted hash is a mistake.

A hash takes tens of milliseconds of pure CPU, so it runs on Tokio's blocking pool rather than stealing time from every request on a worker thread. And that created the problem. The blocking pool grows to hundreds of threads by default, and each Argon2 computation holds 19 mebibytes. The login limit was per IP, so a few hundred addresses submitting logins at once could make the process allocate gigabytes. Password hashing is a denial-of-service amplifier by design: the attacker sends a few bytes, and the server spends tens of milliseconds and 19 mebibytes.

The fix is a semaphore with one permit per CPU, at least two. Memory for hashing is now bounded by CPUs times 19 mebibytes, and more concurrent hashes than cores would not finish sooner anyway. Requests beyond the limit wait rather than fail. A waiter holds a small future, not 19 mebibytes, so a class signing in at nine o'clock queues for a few hundred milliseconds instead of getting a wall of errors.

Hashing protects a stored password, not one guessed early. So sign-up now requires 15 characters, following the NIST standard for a password that is the only factor, and screens new passwords against Have I Been Pwned. Only the first five hex digits of the password's SHA-1 leave the server, and the comparison happens locally. After a 3-second timeout or any error, the check fails open, so the blocklist cannot take sign-up down.

## Who has an account?

When the email is unknown, login still runs a full Argon2 verification against a dummy hash. So "no such user" and "wrong password" take the same time and return the same body, and a test pins the identical responses.

But timing defences fail at their edges. The dummy hash was computed lazily on first use, so the first unknown-email login after each boot hashed and verified, twice as slow as any other. Now it is warmed up before the port binds. A lazy static is a hidden first-call cost.

And there is a front door. Registering an email that already has an account answers 409, "an account with that email already exists": exactly what login hides. It used to leak through timing as well, because registration checked the email before hashing and answered roughly 100 milliseconds sooner; now it hashes first and lets the unique index decide. The 409 itself remains, as a written trade-off. Closing it means a sign-up that always says "check your inbox" and signs in only from the emailed link. For a learning platform, where membership is low-sensitivity, keeping instant sign-in is defensible. Invite-only sign-up narrows it further, because only someone holding a valid invite gets far enough to learn that an email is taken.

Password reset, added later, treats the link as a credential. The request endpoint answers the same for every address and does the lookup and send in a background task, so neither body nor timing tells; it allows three an hour per address. The token is 256 random bits, stored only as a hash, valid for one hour. It travels in the URL fragment, which browsers never send to a server or in a referrer. It is consumed by one delete-returning statement, so two clicks at once cannot both win. And a completed reset signs out every session.

## Sessions: opaque tokens, hashed at rest

A session token is 32 random bytes, 43 URL-safe characters in the cookie. The sessions table stores only its SHA-256, as the primary key.

Here is a question worth answering before I do. Passwords get slow, salted Argon2id. Why is a fast, unsalted SHA-256 right for session tokens?

[pause]

Because a password has perhaps 30 to 40 bits of real entropy, so an attacker tries likely passwords in order of popularity, and slowness and salt are the only defence. A token has 256 random bits and no dictionary. The hash exists for one purpose: a read-only leak, a backup, a replica, a logged query, cannot be replayed as a login. A test asserts the raw token is never in the table.

Resolving a cookie is one primary-key lookup joined to users, with an update of the last-seen time at most once an hour, so an active session does not cost a write per request. The cookie is HttpOnly, so even a successful script injection cannot read it, and Secure, and the config refuses to boot in production if that flag would be false.

The decision record rejects JWTs. With server-side sessions, "log out everywhere" and "revoke that stolen laptop" are a delete. A JWT is a compromised token you cannot kill before it expires, and a denylist to fix that is server state anyway.

Weaknesses a reviewer should raise. Sessions expire 30 days after login, however active you are; a sliding window with an absolute cap is the usual design. The opposite gap is closed: a forgotten laptop used to stay signed in all 30 days, and now a session unused for 14 days is deleted. The cookie lacks the Host prefix that would stop a sibling subdomain from shadowing it. And the Content Security Policy allows eval for the in-browser code runners, and because one middleware sets one policy, that allowance covers the main page too.

## CSRF: three independent layers

A session cookie is ambient: the browser attaches it no matter which page started the request. So Ascend checks every POST, PUT, PATCH and DELETE three ways.

Layer one, SameSite Lax: the browser withholds the cookie from cross-site POSTs. The catch is the word site: scheme plus registrable domain, not the origin. Ascend was first served from a subdomain of Railway's shared domain, and other Railway apps counted as different sites only because of an entry in a public list Ascend does not control. It now serves from its own domain, and redirects the old host.

Layer two, the Origin header, falling back to Referer, compared exactly: scheme, host and port. Layer three, a required custom header. A cross-origin page can only add one by passing a CORS preflight, and Ascend has no CORS layer at all, so the preflight fails and the real request is never sent. A plain HTML form cannot set custom headers either.

Notice what is deliberately not relied on: requiring a JSON content type. Logout and comment deletion take no body, so that check never applies to them.

Now the bug. An earlier version checked the Referer with "starts with". With an origin of ascend dot example, a Referer from ascend dot example dot evil dot net starts with the expected string, and passed. The localhost rule for development had the same shape. It was a genuine bug, and not exploitable from a browser: the Referer branch only runs when Origin is absent, which browsers do not do for cross-site mutations, and the custom header and SameSite would each have stopped the request anyway. One layer was wrong, and nothing was exposed. That is why the layers must be independent: three checks that trust the same header are one check.

The fix's shape is worth copying. The comparison became exact, and the decision moved into a pure function over the headers, so unit tests can enumerate adversarial inputs: a look-alike host, another scheme or port, a null origin. Security logic reachable only through an HTTP stack gets tested on the happy path. A pure function gets a table of attacks.

## Rate limits: keys, replicas and lockouts

When this module was first drafted, every limiter was keyed by client IP: 10 logins a minute, 20 AI requests, 300 others. A class behind one NAT exhausted ten logins in seconds, while an attacker with many addresses got a fresh bucket per address. The fix changed the keys, not just the numbers. Model calls became 20 a minute per session. Login and registration, 30 a minute per IP. Password guesses gained their own bucket: 10 a minute per account, keyed by the thing being attacked, so rotating addresses buys nothing. Everything else, 1,200 a minute per IP.

The second problem: every bucket lived in process memory, so N replicas allowed N times every limit, the ten password guesses included. The fix keeps the same algorithm, GCRA, and moves its one number per key into Postgres: the time at which the next request would be due at exactly the sustained rate. Check and update are one conditional upsert. Two replicas racing for the last slot cannot both win: the second waits for the first one's row lock, then re-checks its condition against the committed value and gets no row back. A test spends ten guesses through one app instance and expects another to refuse the eleventh.

Three choices to defend. Postgres, not Redis: every replica already shares it, and a new store adds a failure mode and no capability. An unlogged table, which skips the write-ahead log: after a crash it is emptied, which only forgives some recent requests. And fail closed: if the query fails, the answer is a 503, because these limits guard passwords and spend. The general bucket stays in memory on purpose; it only stops floods of cheap reads.

The per-account bucket had a cost: anyone who knew a learner's email could lock them out by emptying it. The fix is OWASP's device-cookie pattern. After a successful login, the browser gets a random device token, stored as a hash. A login from a device known for that account is charged to that device's own bucket; unknown devices share the account's. The cookie grants no access. It only chooses which bucket pays.

## In the interview

A follow-up the lesson expects. How do you stop a distributed attacker guessing one learner's password, and what does it cost?

[pause]

Key the limit by the thing being attacked: ten attempts a minute per account, shared by login and account deletion, so rotating addresses buys nothing, and stored in Postgres, so landing on another replica buys nothing either. The cost is a targeted lockout, and Ascend gives each known device its own bucket, so an attacker drains only the allowance for browsers that never signed in. The weak answer is "a tighter per-IP limit", which a botnet ignores and a classroom behind one NAT pays for.

And: your login is timing-safe, so is enumeration solved? No. Registration still answers 409 for a taken email, and the lazy dummy hash showed that timing defences have edges.

## Recap

Five things to remember. Password hashing is memory-hard on purpose, which makes it a denial-of-service amplifier: bound it with a semaphore and let bursts wait. Session tokens need only a fast hash, because 256 random bits have no dictionary; the hash defeats read-only leaks. Enumeration is closed one door at a time, and registration's 409 is a written trade-off. CSRF defence is independent layers, and SameSite is about sites, not origins. And key each limit by what it protects, share it across replicas, and use device cookies to defuse the lockouts per-account limits invite.

At your desk: the threat table and login sequence, the semaphore and session code, the shared limiter's upsert and its trace, and the CSRF exercise.

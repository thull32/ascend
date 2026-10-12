---
lesson: security-fundamentals
source: aa4db86ff75db6bc
---
## 1

Ascend stores session tokens as plain SHA-256 hashes, but passwords as Argon2id hashes. Why is a fast hash acceptable for the tokens?

A, tokens expire within 30 days, so a stolen hash is soon useless. B, tokens are 256 random bits, so no guessing rate could ever find one. C, SHA-256 is a stronger algorithm than Argon2id for short inputs. D, tokens are also encrypted at rest, so the hash is a second layer.

[think]

The answer is B: tokens are 256 random bits, so no guessing rate could ever find one.

Slow hashing makes up for inputs with little entropy, which attackers can guess, like passwords. A 256-bit random token has no guessable structure: at a trillion guesses a second, searching half the space takes around 10 to the 57th years. Expiry limits the window but does not replace hashing, SHA-256 is faster than Argon2id rather than stronger, and the tokens are not encrypted in the database. The hash is the only protection, and it is enough.

## 2

A search endpoint builds its SQL by pasting the search term into a Python format string. A term made of a percent sign, a quote, then "OR 1 equals 1", then a comment marker, returns every user's rows. Why does a parameterised query stop this?

A, the driver sends the value separately, so it is never parsed as SQL. B, the database rejects any value that contains an SQL keyword like OR. C, parameterised queries escape quotes by doubling them before sending. D, placeholders limit the value's length, so a payload cannot fit in it.

[think]

The answer is A: the driver sends the value separately, so it is never parsed as SQL.

With a placeholder, the statement's structure is fixed before the value arrives. The value is bound as data, so its quote and its OR are just characters in a LIKE pattern, and the lesson's fixed search returned no rows. Escaping is the fragile alternative that parameterisation replaces, and databases do not filter keywords or cap lengths for you.

## 3

A rate limiter keys login attempts on the first IP address in the X-Forwarded-For header. What can an attacker do?

A, skip the CSRF check, since the limiter runs before the CSRF layer. B, spoof only IPv6 addresses, because IPv4 entries are checked against the connection. C, send a new fake IP on each request, and get a fresh bucket every time. D, nothing, because proxies replace the header with the real client address.

[think]

The answer is C: send a new fake IP on each request, and get a fresh bucket every time.

Proxies append to that header; they do not remove what the client sent, so the first entry is attacker-controlled, whatever its address family. Each fake address gets its own bucket, and the per-IP limit disappears. The limiter's key has nothing to do with CSRF. Key on a header your trusted edge overwrites, as Ascend does with the real IP header on Railway, or on the socket address, and limit per account as well.

## 4

A link preview service rejects URLs whose host is 127.0.0.1, localhost, or the cloud metadata address 169.254.169.254. Why is a URL whose host is the bare number 2130706433 still dangerous?

A, the resolver reads it as 127.0.0.1, which the string check never saw. B, browsers rewrite numeric hosts to the metadata address on redirect. C, any URL without a dot bypasses TLS, so the fetch happens in plain text. D, port 80 is implied, and the blocklist only covers explicit port numbers.

[think]

The answer is A: the resolver reads it as 127.0.0.1, which the string check never saw.

That number is 127.0.0.1 written as one 32-bit integer, and the system resolver accepts it, just as it accepts hex and IPv6-mapped forms. Only a check on the resolved address catches every encoding, and even then the fetcher must connect to the address it checked, and check again on every redirect. Ports and TLS have nothing to do with the bypass.

## 5

A session cookie is set with SameSite Lax. With which of these requests does the browser still send the cookie?

A, a top-level GET navigation from another site to your page. B, a cross-site form POST that submits itself when the page loads. C, a cross-site image tag whose source points at your API. D, a cross-site fetch call that uses the DELETE method.

[think]

The answer is A: a top-level GET navigation from another site to your page.

Lax sends cookies on top-level GET navigations, so that links into your site keep users logged in. That is why state-changing operations must never be GETs. The self-submitting POST and the cross-site DELETE use unsafe methods, and the image is a cross-site sub-request; Lax withholds the cookie from all three.

## 6

Ascend's Content Security Policy includes unsafe eval. What makes this acceptable?

A, nothing: every unsafe keyword should be removed at once. B, the policy also allows unsafe inline scripts, which cancels it out. C, the code runners need it, and learner code runs in time-limited workers. D, it only relaxes CSS evaluation, so script execution is still locked down.

[think]

The answer is C: the code runners need it, and learner code runs in time-limited workers.

A weakened control can be acceptable when the need is real and the compensating controls are explicit. Pyodide and the JavaScript sandbox need eval and WebAssembly, and learner code runs in Web Workers with no DOM, which are terminated at a time limit; the JavaScript worker also loses its network APIs. The policy still forbids inline scripts, which blocks the most common injection payloads. Unsafe eval governs scripts, not CSS, and removing it outright would break the runners.

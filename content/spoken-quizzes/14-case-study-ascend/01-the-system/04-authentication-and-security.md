---
lesson: authentication-and-security
source: 716f872081ab7869
---
## 1

Ascend stores a SHA-256 hash of each session token, with no salt, yet uses slow, salted Argon2id for passwords. Why is that consistent?

A, session tokens are less valuable to an attacker than passwords are. B, SHA-256 is slower than Argon2id once the token is 43 characters long. C, salts matter only for columns that serve as a table's primary key. D, tokens hold 256 random bits, so there is no dictionary to try.

[think]

The answer is D: tokens hold 256 random bits, so there is no dictionary to try.

Password hashing is slow and salted because attackers guess likely passwords from a dictionary. A random 256-bit token cannot be guessed, so the only goal of hashing it is that a leaked table cannot be replayed as a login, which any preimage-resistant hash achieves. SHA-256 is far faster than Argon2id, and that is fine here.

## 2

Registration now hashes the password before it inserts, so an existing email no longer answers faster. How can an attacker still learn whether an email has an account?

A, they cannot, since every auth endpoint now answers identically for all emails. B, by timing the login endpoint, which still skips hashing for unknown emails. C, by registering it: the endpoint still answers 409 when the account already exists. D, by reading the session cookie, which embeds the account's email address.

[think]

The answer is C: by registering it, since the endpoint still answers 409 when the account already exists.

Login verifies against a dummy hash for unknown emails, so its timing and its body reveal nothing, and a password reset request answers the same for every address. Registration still says that an email is taken, and the code documents that as a deliberate trade-off; only a sign-up completed from an emailed link would remove it. The cookie holds an opaque random token, not an email.

## 3

A malicious page auto-submits an HTML form that POSTs to Ascend's logout endpoint, which takes no request body. Which defence does not help here?

A, the required X-Requested-With header, which a plain form cannot set. B, the origin check, which rejects a request that claims to come from evil dot example. C, SameSite Lax, which withholds the session cookie on the cross-site POST. D, the JSON extractor's demand for a JSON content type.

[think]

The answer is D: the JSON extractor's demand for a JSON content type.

Logout has no JSON extractor, so the content type requirement never applies to it. That is exactly why the middleware enforces an explicit rule for every mutating route, instead of relying on body parsing. The other three are independent layers, and each of them stops the forged request.

## 4

A signed-in learner types the wrong password into the delete-account form. Why does the API answer 422, rather than 401?

A, 422 is required by the HTTP specification for any incorrect form field value. B, 422 tells rate limiters to charge the attempt, while a 401 is never counted. C, browsers show a native login prompt for every 401, and it cannot be suppressed. D, 401 means no valid session, and the app would treat the learner as signed out.

[think]

The answer is D: 401 means no valid session, and the app would treat the learner as signed out.

The session is valid; only a field is wrong, which is what 422 says. The web app's auth context clears the user on a 401, so a typo would bounce a signed-in learner to the login page. Browsers show a native prompt only when a 401 carries an authentication challenge header, which this API never sends.

## 5

The password attempt quota is 10 a minute, keyed by account, for devices that have never signed in. An attacker sends 15 login attempts for one email at time zero, from 15 different IP addresses, and one more at 7 seconds. How many reach the password check?

A, 1 at time zero, then one more every six seconds after it. B, 10 at time zero, and the attempt at 7 seconds is refused as well. C, 11 in total: ten at time zero, and then the one at 7 seconds. D, 15 at time zero, since every attempt comes from a different address.

[think]

The answer is C: 11 in total, ten at time zero and then the one at 7 seconds.

The bucket is keyed by account and stored in Postgres, so rotating addresses or replicas buys nothing. Capacity is 10, so the first ten pass and five are refused. One token is replenished every 6 seconds, so by 7 seconds the next attempt passes. The owner signing in from a browser that has signed in before is unaffected, because a known device has its own bucket.

## 6

Two replicas each receive a login for the same account at the same instant, and the account's password bucket has one slot left. What does the shared limiter's conditional upsert do?

A, one upsert updates the row; the other waits on its lock, re-checks its condition, and is refused. B, both read the same theoretical arrival time before either writes, so both logins are allowed. C, the second insert fails with a unique violation, and the API answers 500 for that login. D, each replica holds its own copy of the state, so both logins pass and both are recorded.

[think]

The answer is A: one upsert updates the row; the other waits on its lock, re-checks its condition, and is refused.

The on-conflict update locks the conflicting row. The waiting statement then evaluates its condition against the arrival time the first one committed, which is past the tolerance, so it updates nothing and returns no row: a 429. There is no window between a read and a write for both to slip through, the on-conflict clause absorbs the duplicate key instead of raising an error, and since a recent change no replica keeps its own copy.

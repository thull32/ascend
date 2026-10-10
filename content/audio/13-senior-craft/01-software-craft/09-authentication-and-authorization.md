---
lesson: authentication-and-authorization
source: 20337f1da5cfd9b9
fit: great
desk:
  - "The PKCE code and the authorization-code flow, request by request"
  - "The table of what each parameter defeats"
  - "The device flow steps and the client-credentials request"
  - "The decoded ID token, the JWKS, and the JWT size and speed measurements"
  - "The SAML response and how wrapping moves the signed assertion"
  - "The TOTP code, the WebAuthn steps and the key-rotation table"
  - "Exercises: refresh-token rotation with reuse detection, and a Zanzibar-style check"
---
## Introduction

A product that started with email and password grows three new doors in a year: a mobile app, a partner's nightly export job, and an enterprise customer whose employees must log in through its own identity provider. The team ships all three with 24-hour JSON web tokens, JWTs, stored in the browser's local storage, all signed with one shared secret that every service knows.

Six months later, three things go wrong. A cross-site scripting bug steals tokens that keep working for a day after their owners log out. The billing API accepts a token minted for reporting, because nobody checked the audience. And rotating the shared secret, the only fix, logs out everyone. Each is a missing mechanism, not a missing library.

Here is what is coming: the five artifacts and why you never swap them; the code flow with PKCE; sessions versus JWTs and refresh-token rotation; authorization models; and the two classic signature traps, in JWTs and in SAML.

## Three questions, five artifacts

Authentication asks who is calling. Authorization asks whether they may do this, to this resource, now. Delegation asks whether this application may act for this user, within limits the user agreed to. OAuth 2 answers only delegation, so a third-party app never sees the user's password. OpenID Connect, OIDC, adds authentication on top. SAML predates both and serves enterprise single sign-on.

There are five artifacts. A session cookie says which login this browser is, and goes only to the app that issued it. An access token says the bearer may call this API with these scopes. A refresh token lets a client get a new access token, and is shown only to the authorization server. An ID token says who logged in, when and how, and is consumed by the client, never presented to an API. And a SAML assertion carries a login and its attributes to an enterprise app, once.

Incidents come from using one artifact as another: an ID token accepted by an API, or "sign in with X" that accepts any valid access token, letting every app the user ever authorised log in as them.

Ascend is the baseline: one first-party web app with email and password. Passwords are hashed with Argon2id. A session is 32 random bytes, stored only as its SHA-256, in a cookie that page scripts cannot read and other sites cannot send. It expires 30 days after login, or after 14 days idle.

## The code flow with PKCE

A single-page app wants to read a user's orders through an identity provider. It is a public client: it cannot keep a secret. So PKCE replaces the secret with a one-time proof.

The app makes a random verifier and keeps it in memory. It sends the user to the identity provider with the verifier's SHA-256 hash, called the challenge, plus a random state and a random nonce. The user logs in at the provider; the app never sees the password. The provider redirects back with a single-use code. The app then trades the code for tokens, and this time it sends the verifier itself. The provider hashes it and checks that it matches the challenge.

Each parameter defeats one attack. PKCE defeats code interception: a stolen code is useless without the verifier, which never left the app. State defeats login CSRF, a forged callback that logs the victim into the attacker's account. The nonce ties the ID token to this login. Exact string matching of the redirect address stops a crafted link delivering the code to an attacker's page. And the issuer parameter on the response stops a client that trusts several providers from sending one provider's code to another.

Why must the challenge method be the hash and not "plain"? With plain, the challenge is the verifier, so anyone reading the first request can redeem the code. The old implicit flow, which returned the access token straight in the URL, is gone: the current OAuth security best practice says clients should not use it, and must not use the password grant at all.

## Sessions, JWTs and refresh tokens

Where the credential lives decides what an attacker needs. A cookie that page scripts cannot read is sent automatically, so its threat is CSRF, which same-site rules, an origin check and a custom header defend. A token in local storage is readable by any script, so one cross-site scripting bug replays it from the attacker's machine until it expires. There is no mitigation for that except keeping long-lived tokens out.

Size matters too. Ascend's cookie is 58 bytes. The smallest JWT measured is six times that, and one carrying a user's groups passes 2 kilobytes. Browsers need only support 4 kilobytes per cookie, and common web servers cap a request header at about 8 kilobytes, so past a limit one user, usually the one in the most groups, gets an error at login.

And revocation. A session is a row, so logout takes effect on the next request. A JWT stays valid until it expires, unless every verifier checks a denylist, which is the per-request lookup JWTs were chosen to avoid. A long-lived JWT as the only login state fails five ways: logout does nothing on the server, a demoted admin stays one until expiry, size creeps, cross-site scripting becomes account takeover, and one key forges everyone.

The working answer is a hybrid. Access tokens live 5 to 15 minutes, and revocation moves to the refresh token, which only the authorization server sees. With rotation, every refresh issues a new refresh token and retires the old one. The tokens descended from one login form a family.

Trace it. At 10:00 the app logs in and gets refresh token R1. At 10:05 an attacker copies R1 from a synced backup. At 10:10 the app refreshes with R1 and gets R2. At 10:40 the attacker presents R1. What does the server do?

[pause]

R1 is retired, and it has come back, which proves two holders. The server cannot tell which one is legitimate, so it revokes the whole family. At 10:50 the app's R2 is rejected, and the user signs in again. If the attacker had refreshed first, the app's next refresh would present the retired token, and the family would die with the attacker's token in it. Either way, the second presentation catches the theft.

Strict detection has a false positive: two tabs refreshing at once. So servers allow a grace period of a few seconds in which the previous token returns the current one, and clients keep one refresh in flight. And a thief who takes the current token from a device that then goes silent is not caught, which is why families also have absolute and idle lifetimes.

Shorter tokens cost load. With a million active clients, 10-minute access tokens mean about 1,700 refreshes a second; 60-minute tokens, about 280. In exchange, a stolen token or a demoted user's old permissions last only that long.

## What an API checks, and why the algorithm is not yours to read

Every API checks every token before any business logic. The issuer is the one it trusts. The audience names this API, so a token for billing fails at orders. The type marks it as an access token, which rejects an ID token even where the audiences happen to match. The expiry, with 30 to 60 seconds of leeway for clock skew. And the scope, matched as whole words.

Scopes are ceilings on what the client may do for the user, not permissions. A token with orders read does not mean this user may read this order. The API still decides that.

Signature checking hid two classic library bugs. The JWT standard allows unsecured tokens with an algorithm of "none", and some libraries skipped verification when they saw it. In algorithm confusion, a token claiming the shared-secret algorithm was sent to an API expecting RSA, and libraries used the downloadable RSA public key as the secret, so anyone could sign claims. The rule: take the algorithm from your own configuration for that key, never from the token's header.

When validating an ID token, the user is the pair of issuer and subject, never the email. Addresses get reassigned, and a provider that allows unverified emails lets anyone claim yours.

## Authorization models

Role-based access control maps users to roles to permissions, and fits a few roles not tied to single resources. It breaks when access depends on the resource, and roles like "project 42 editor" multiply. Attribute-based control evaluates a policy over the user, the resource and the context, which fits compliance rules. Relationship-based control, ReBAC, walks a graph of relationships, and fits sharing, groups and folders. Ascend is roles plus ownership: only the author or an admin deletes a comment. Real systems mix models.

Google's Zanzibar paper describes the ReBAC service behind Drive and other products. Can Bo view the roadmap document? No direct grant. Is he an editor or the owner? No, Ana owns it. But the document's parent is the engineering folder, the folder's viewers include the platform group, and Bo is a member. Allowed. A permission check is graph reachability.

The subtle part is time. If Ana removes Bo from the folder and then adds a secret paragraph, a stale replica could still show Bo the new text: the "new enemy" problem. So when content is saved, it stores a consistency token, and later checks run at a snapshot at least that new.

## SAML wrapping, WebAuthn and key rotation

An XML signature does not sign the document. It says: find the element with this ID, and check that it is intact. The application, meanwhile, reads the identity from the first assertion it finds. So in signature wrapping, an attacker adds a forged, unsigned assertion where the application looks, and moves the genuine signed one somewhere it does not. The validator finds the signed element intact; the application logs her in as admin. A 2012 study found wrapping flaws in 11 of the 14 frameworks it analysed. The fix: read identity only from the element the validator verified, reject more than one assertion, and keep the library patched.

For second factors: text-message codes, authenticator app codes and push approvals all stop credential stuffing, and none stops a real-time phishing proxy, which simply relays the code. WebAuthn and passkeys do, because the browser, not the page, records the real origin, and the authenticator only signs for credentials registered to that site. A look-alike domain gets nothing to relay.

Last, key rotation, and the pattern is overlap. Publish the new key while still signing with the old. Wait one cache lifetime, so every verifier knows the new key. Then sign with the new one. Wait one token lifetime, so every old token has expired. Then retire the old key. Sign with a new key the moment it exists instead, and every verifier whose cache predates it rejects fresh tokens for up to an hour.

## In the interview

"How do you log a user out everywhere when your APIs verify JWTs offline?"

[pause]

Revoke every refresh-token family for the user, and accept that outstanding access tokens live out their few minutes. If that is too long, the APIs check a per-user "not before" timestamp, or a short-lived denylist. The common wrong answer is "delete the token on the client", which leaves a stolen copy working.

And: "our single-page app logs in through an external identity provider. Where do the tokens live?" Preferably not in the browser. A backend-for-frontend runs the code flow with PKCE as a confidential client, keeps the tokens, and gives the browser an ordinary session cookie with CSRF protection. The wrong answer is a 24-hour JWT in local storage, which turns one cross-site scripting bug into a day-long takeover.

## Recap

Five things to remember. Never let one of the five artifacts stand in for another; an ID token is not an API credential. In the code flow, PKCE defeats code interception, state defeats login CSRF, the nonce binds the ID token, and redirect addresses match exactly. Keep access tokens short and rotate refresh tokens in families, with reuse detection and a grace period. Take the signing algorithm from your own configuration, and in SAML trust only the element the signature covered. And rotate keys by publishing, waiting, switching, waiting, and retiring.

At your desk: the PKCE flow request by request, the attacks table, the device flow, the decoded ID token and the JWT measurements, the SAML response, the WebAuthn steps and rotation table, and the two exercises.

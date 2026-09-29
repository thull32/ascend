---
slug: code-review-as-mentorship
title: "Code review as mentorship: reviewing for design, teaching through comments"
description: What review is for and the order to review in, a real diff from this app's history reviewed twice (a nitpicking review and a mentoring one, comment by comment), how review latency caps team throughput via Little's law, a review checklist by risk, and how review tooling and policy work underneath.
minutes: 30
difficulty: medium
tags: [leadership, code-review, mentorship, communication, security, littles-law]
---
A 900-line pull request that adds a shared HTTP client receives 38 review comments. Thirty-five are about naming, formatting and import order. Three are about logic. None notices that the new client retries every request that times out, including `POST /charges`, so the next time the payment provider slows down, customers are charged twice. The author, six months into their first job, spends two days addressing nits and learns nothing about idempotency. The review failed twice: as a quality gate and as teaching. (The scenario is illustrative; the worked review below is not.)

Code review is the highest-frequency leadership activity a senior engineer has. You do it daily, it is where standards are actually set, and it is where most engineers learn most of what they know about a codebase. This lesson reviews a real change from this app's history twice, once badly and once well, then quantifies what slow review costs a team and gives you a checklist sized to the risk of the change.

## What review is for

In priority order:

1. **Correctness and risk.** Bugs, security holes, data loss, concurrency errors, operational hazards, and whether the approach is right at all.
2. **Shared understanding.** After review, at least two people understand the change. That is your bus factor and your on-call coverage.
3. **Maintainability.** Will the next engineer understand and safely change this?
4. **Consistency.** Style and conventions, which formatters and linters should enforce, not humans.

Google's public [engineering-practices guide](https://google.github.io/eng-practices/review/reviewer/standard.html) states the standard well: reviewers should favour approving a change once it "definitely improves the overall code health" of the system, even if it is not perfect. Review is not for proving you are clever, rewriting the change the way you would have written it, or enforcing taste that no document records. Every comment spends the author's time; spend it at the top of the list.

## Review in passes

Reading a diff top to bottom mixes design questions with typos and tends to find the typos. Review in passes, largest concerns first:

1. **Context.** Read the description and the linked issue or design doc. If you cannot tell *why* the change exists, ask before reviewing the code.
2. **Design.** Does this belong in this module? Is there a much simpler way? Post design concerns *first and alone*, so the author does not polish lines that are about to be rewritten.
3. **Correctness.** Edge cases (empty, null, huge, concurrent, retried, first call), error handling, security boundaries, the hot path, migrations and rollbacks.
4. **Tests.** Would they fail if the bug you are worried about were present?
5. **Readability.** Names, structure, comments that explain why.
6. **Nits.** Label them, or better, leave them to tooling.

Size matters more than skill. A commonly cited guideline comes from SmartBear's study of a Cisco team: review no more than 200 to 400 lines at a time, over 60 to 90 minutes, and no faster than about 500 lines an hour, because defect-finding drops beyond that ([SmartBear's summary](https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/)). It is one vendor's study of one team, so read the numbers as an order of magnitude, not a threshold. Ask for large changes to be split into a stack (refactor, then feature, then cleanup).

## Label every comment

| Label | Meaning | Example |
|---|---|---|
| `blocking:` | Must change before merge | "blocking: this query runs inside the loop; 500 items means 500 round trips." |
| `suggestion:` | Better way; author decides | "suggestion: `entry().or_insert` would remove the double lookup." |
| `question:` | A question you want answered, not disguised criticism | "question: can this be called before `init()`? If so we need a guard." |
| `nit:` | Trivial; never blocks | "nit: typo in the log message." |
| `praise:` | A specific thing done well | "praise: the table-driven test makes the edge cases easy to see." |

Google's guide asks reviewers to prefix unimportant points with "Nit:". [Conventional Comments](https://conventionalcomments.org/) formalises a fuller vocabulary close to the one above: labels such as `praise`, `nitpick`, `suggestion`, `issue` and `question`, plus `(blocking)` and `(non-blocking)` decorations. Praise is not decoration: it tells the author which habits to keep.

## A real diff, reviewed twice

In September 2026 one commit to this repository bounded Argon2 work with a semaphore, because an unbounded burst of logins could queue unlimited hashing, each call using about 19 MiB. The commit touched 52 files and about 1,300 lines; this is the part that matters, from `crates/core/src/auth/password.rs`, trimmed (`...` marks omitted lines):

```text
 static DUMMY_HASH: LazyLock<String> =
     LazyLock::new(|| hash_sync("ascend-dummy-password-for-timing").expect("dummy hash"));

+/// Argon2 is deliberately expensive (~19 MiB and tens of ms per call). An
+/// unbounded burst of logins would queue unlimited work on the blocking pool
+/// and exhaust memory, so at most one hash per CPU runs at a time; the rest
+/// wait here (and the auth rate limiter bounds how many can wait).
+static HASH_PERMITS: LazyLock<tokio::sync::Semaphore> = LazyLock::new(|| {
+    let cpus = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2);
+    tokio::sync::Semaphore::new(cpus.max(2))
+});
+
 pub async fn hash(password: String) -> AppResult<String> {
+    let _permit = HASH_PERMITS.acquire().await.map_err(AppError::internal)?;
     tokio::task::spawn_blocking(move || hash_sync(&password))
 ...
 pub async fn verify(password: String, hash: Option<String>) -> bool {
     let exists = hash.is_some();
     let hash = hash.unwrap_or_else(|| DUMMY_HASH.clone());
+    let Ok(_permit) = HASH_PERMITS.acquire().await else { return false };
     let ok = tokio::task::spawn_blocking(move || verify_sync(&password, &hash)).await.unwrap_or(false);
     ok && exists
 }
```

Context a reviewer needs: `verify` checks against `DUMMY_HASH` when the email is unknown, so "no such user" and "wrong password" cost the same and nobody can learn which emails have accounts by timing the login endpoint.

### Review A: the nitpick storm

> 1. "Rename `HASH_PERMITS` to `ARGON2_SEMAPHORE`, it's more descriptive."
> 2. "`cpus.max(2)` is a magic number; extract a constant."
> 3. "Why `let Ok(..) else { return false }`? `.expect()` is cleaner."
> 4. "This doc comment is five lines, trim it."
> 5. "LGTM once these are fixed."

### Review B: the mentoring review

> **praise:** The comment on `HASH_PERMITS` says why (19 MiB per call, unbounded queueing) and what bounds the waiters (the auth rate limiter). That is the comment the next person needs.
>
> **blocking (timing):** `DUMMY_HASH` is a `LazyLock`, so the first read computes an Argon2 hash. That read happens in `unwrap_or_else`, on the async task, before the permit. So the first unknown-email login after each boot does two hashes, one of them on a Tokio worker thread and outside the semaphore: it is roughly twice as slow as every other login, a one-off signal that the email has no account, and it stalls whatever else is scheduled on that worker for tens of milliseconds. Could we read the static inside the `spawn_blocking` closure, after the permit, and force it once at startup so no request ever pays for it? Happy to pair.
>
> **question:** The comment says the auth rate limiter bounds how many callers wait for a permit. Does that cover every caller of `verify`? In `routes/auth.rs` the auth bucket wraps `/register` and `/login`, but this commit also adds account deletion, which calls `verify` from `DELETE /me` outside that bucket. What limits password guesses there, for someone holding a stolen session?
>
> **suggestion:** A unit test that forces the dummy hash at startup and then verifies an unknown email would at least prove the warm path works. A timing assertion would be flaky in CI; I would not add one.

### Comment by comment

| Comment | Label | Cost to the author | What it teaches | Finds a defect? |
|---|---|---|---|---|
| A1 rename | none | 10 minutes, every call site | That reviews are about taste | No |
| A2 constant | none | 5 minutes | Nothing; `max(2)` is explained by its context | No |
| A3 `.expect()` | none | 5 minutes, and a new bug | It would panic the login handler if the semaphore were ever closed; the reviewer's suggestion is worse than the code | Adds one |
| A4 trim | none | Deletes the most useful comment in the diff | That why-comments are noise | No |
| B praise | praise | None | Keep writing why-comments | No |
| B blocking | blocking | An hour | How lazy statics hide a first-call cost, why async workers must not do CPU work, and that timing defences fail at their edges | Yes |
| B question | question | An hour | Verify the claims your comments make, against every caller | Yes, a second gap |
| B suggestion | suggestion | Optional | What to test and what not to | No |

Review A has five comments and makes the code worse. Review B has four and finds both real gaps, because it read for risk (a timing defence plus a lazy static plus an async boundary) before reading for style. Formatting is not in either review because `cargo fmt --check` and `cargo clippy` run in this repository's CI.

### What happened

Both gaps shipped in that commit, and both were closed within the hour by two later commits. One added a per-account limit of 10 password attempts a minute covering login and account deletion, so a stolen session cannot become a guessing oracle. The other, whose message credits a review of the code, is the blocking comment almost word for word:

```rust
pub async fn verify(password: String, hash: Option<String>) -> bool {
    let exists = hash.is_some();
    let Ok(_permit) = HASH_PERMITS.acquire().await else { return false };
    // The dummy hash is read on the blocking pool, inside the permit: its
    // first use computes it, which is Argon2 work like any other.
    let ok = tokio::task::spawn_blocking(move || verify_sync(&password, hash.as_deref().unwrap_or(&DUMMY_HASH)))
        .await
        .unwrap_or(false);
    ok && exists
}
```

The same commit added `password::warm_up()`, which `crates/api/src/main.rs` awaits before the server starts listening, so the static exists before any request arrives. The [authentication case study](/learn/case-study-ascend/the-system/authentication-and-security) tells the whole story, including the registration timing leak the same commit closed.

## Tone: rewriting comments

| Instead of | Write |
|---|---|
| "Why didn't you use a map here?" | "suggestion: a map keyed by user ID would make this lookup O(1). Any reason it would not fit?" |
| "This is wrong." | "blocking: I think this panics on an empty list (`items[0]`). Could we return early?" |
| "This should be async, surely." | "question: this does disk I/O inside a request handler; should it go through `spawn_blocking`?" |
| "You forgot tests." | "Could we add a test for the empty-cart case? That path caused the March incident." |
| "Do it like the payments service." | "The payments service solved this with an outbox table (link). Worth a look?" |

The principles: comment on the code, not the person; say *why*; make severity explicit; ask questions you want answered; offer help. Write "we" about the codebase, because it is shared.

## Teaching through review

**Calibrate to the author and the urgency.** With a junior engineer on a non-urgent point, a leading question teaches more than an answer: "What happens if two workers pick up the same job at once?" On anything urgent or security-related, give the answer and explain it, as Review B does; a Socratic dialogue about an open vulnerability is self-indulgent. With a senior peer, be direct and brief.

**Turn repetition into rules.** The second time you write the same comment, it belongs in a linter, a template or the team's review guide. Your comments should get more interesting over time.

**Move long threads to a conversation.** After three replies each way, talk for ten minutes, then post a one-paragraph summary in the PR so the record stays complete.

**Let small things go.** "Approve with suggestions" trusts the author with non-blocking comments. Blocking on a nit teaches that review is a toll booth.

**Watch the trend.** Mentoring through review is working if a mentee's PRs need fewer and less fundamental comments each month, and if they start leaving good comments on others' code.

## Review latency and throughput: Little's law

Little's law says that, in any stable system, average work in progress equals throughput times average time in the system: $L = \lambda W$. It needs no assumptions about distributions, which is why it applies to pull requests as well as packets.

Take an illustrative team of 8 engineers. Writing a PR takes a day of hands-on work and addressing comments another quarter-day, so if nobody ever waited the team could merge 8 / 1.25 = 6.4 PRs a day. Each engineer keeps at most two PRs in flight, since more means constant rebasing, so work in progress is capped at 16. Rearranged, Little's law gives the most the team can merge: $\lambda \le 16 / W$, where $W$ now includes the wait for review.

```python
ENGINEERS, OPEN_PER_ENGINEER = 8, 2
CODING_DAYS, REWORK_DAYS = 1.0, 0.25

wip = ENGINEERS * OPEN_PER_ENGINEER
capacity = ENGINEERS / (CODING_DAYS + REWORK_DAYS)   # PRs/day if nobody waits
for wait_hours in (24, 16, 10, 8, 4, 1):
    t = CODING_DAYS + wait_hours / 8 + REWORK_DAYS    # days in the system
    merged = min(wip / t, capacity)                   # Little's law bound vs hands-on time
    print(f"{wait_hours:>2} h wait: {t:.2f} days in system, {merged:.1f} merged/day")
```

| Review wait | Days in system | Little's law bound | Merged per day | What limits the team |
|---|---|---|---|---|
| 24 h | 4.25 | 3.8 | 3.8 | Review wait |
| 16 h | 3.25 | 4.9 | 4.9 | Review wait |
| 10 h | 2.50 | 6.4 | 6.4 | Crossover |
| 4 h | 1.75 | 9.1 | 6.4 | Engineering time |
| 1 h | 1.38 | 11.6 | 6.4 | Engineering time |

Read it two ways. Above about ten working hours, review latency sets the team's output: a three-day wait (24 working hours) leaves the team at 3.8 PRs a day, 41% below what its engineers could write. Below the crossover, faster review stops raising throughput and instead shrinks work in progress: at a one-hour wait the team carries 6.4 × 1.38 ≈ 9 open PRs instead of 16, which means fewer stale branches, fewer conflicts and less context held in people's heads. Google's guide sets ["one business day"](https://google.github.io/eng-practices/review/reviewer/speed.html) as the maximum time to respond, and this arithmetic is one reason why.

The wait itself grows sharply with reviewer load. Modelled as a single-server queue (M/M/1), the mean wait is $\frac{\rho}{1-\rho}$ times the review time: with 30-minute reviews, a reviewer at 50% utilisation adds a 30-minute wait, at 80% two hours, at 90% four and a half. A senior who does 60% of a team's reviews is running near the right-hand end of that curve.

## A review checklist by risk

Spend review depth in proportion to what the change can break.

| Tier | Recognise it by | Reviewers | Checklist |
|---|---|---|---|
| Low | Docs, tests only, lockfile-only dependency bumps | One; skim | Does CI pass? Does the text match the code? |
| Medium | Ordinary feature code | One who knows the module | The passes above; tests fail without the change |
| High: auth and secrets | `auth/`, sessions, tokens, crypto | A second reviewer who owns security | Identical errors and timing on every failure path (including the first call); authorisation on every route; nothing secret logged |
| High: data | Migrations, backfills, schema | The data owner | Additive and compatible with the running version; lock time on large tables; rollback path; migrations append-only (this repository's rule) |
| High: concurrency and async | Locks, channels, spawned tasks, `async` boundaries | Someone who has debugged this runtime | No CPU or blocking work on async workers; bounded queues; cancellation safety; lock ordering |
| High: delivery | CI, Dockerfile, deploy config, flags | The platform owner | Blast radius; a staged rollout; what happens on rollback |

The diff above was high-risk on two rows at once (auth and async), in a 52-file commit. That combination is exactly where a checklist earns its place: the row for auth says "including the first call", and the async row says "no CPU work on async workers".

## Under the hood: how review is enforced

**Branch protection.** Hosting platforms enforce review with repository rules: a required number of approvals, required status checks (CI must pass), and an option to dismiss approvals when pushed commits change the diff, so an approval covers the code that merges, not an earlier version ([GitHub's protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)).

**Ownership files.** A `CODEOWNERS` file maps path patterns to owners. On [GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) the last matching pattern in the file wins, owners are requested automatically, and a rule can require an owner's approval. Large monorepos use per-directory `OWNERS` files so ownership lives next to the code; [Chromium's](https://github.com/chromium/chromium/blob/main/docs/code_reviews.md) are public, apply recursively to subdirectories, and require a positive review from an owner of each directory a change touches. Google also runs a "readability" programme, described in the study below, in which every change must be authored or reviewed by someone certified in the language's style, which spreads style knowledge without a style reviewer on every change.

**Merge queues.** When many PRs merge a day, each passing CI on its own base does not mean they pass together. A merge queue tests each change against the queue ahead of it before merging, trading a little latency for a main branch that stays green.

**What research reports.** A study of review at Google ([Sadowski et al., "Modern Code Review: A Case Study at Google"](https://sback.it/publications/icse2018seip.pdf), ICSE-SEIP 2018), covering about 9 million reviewed changes, found that most changes are small, fewer than 25% have more than one reviewer, and the median time for the whole review is under 4 hours, with first feedback on small changes in under an hour. Small changes and fast turnaround are policies that reinforce each other, as the Little's law table shows. The same study lists education as one of four things Google developers expect from review (with maintaining norms, gatekeeping and accident prevention), and finds that the average number of comments on an author's changes falls as they gain experience there, which is the trend the mentoring section tells you to watch. An earlier study at Microsoft ([Bacchelli and Bird, ICSE 2013](https://www.microsoft.com/en-us/research/publication/expectations-outcomes-and-challenges-of-modern-code-review/)) found that "while finding defects remains the main motivation for review, reviews are less about defects than expected", with knowledge transfer and team awareness among the other benefits: the shared-understanding purpose at the top of this lesson, measured.

## Being reviewed, as a senior

Make review cheap for others. Self-review your diff before requesting review, keep changes small, and write descriptions that answer the reviewer's first questions:

```text
What: <one or two sentences on the change>
Why: <the problem, with a link to the issue or design doc>
How: <the approach, and anything surprising about it>
Testing: <what you ran; new tests; manual checks>
Risk and rollout: <what could break, flag name, how to roll back>
Reviewer notes: <where to focus; files that are mechanical and can be skimmed>
```

Respond to every comment, even with "done". Disagree with reasons, not silence; a well-argued "I would rather not, because..." is a legitimate reply to a suggestion.

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Rubber stamp | Approvals within two minutes of a 600-line PR; defects found later in production | Review seen as a gate to pass, not a check | Risk tiers; a second reviewer on high-risk paths; ask reviewers to name the riskiest line |
| Nit storm | Many comments per PR, few defects found; authors dread review | Style enforced by humans; no labels | Formatter and linter in CI; labels; nits never block |
| Review bottleneck | PRs wait a day or more; one name on most approvals | One reviewer near 90% utilisation | Rotation, `CODEOWNERS` with several owners, a written guide so others can review |
| Mega-PR | 1,000-line changes; reviews shallow | Work not sliced; review cost grows faster than size | Stacked PRs; flags so incomplete work can merge dark |
| Stale approval | Code changed after approval merges unreviewed | Approvals not dismissed on new pushes | Branch protection that dismisses stale approvals |

## Choosing a review model

| Model | Latency added | Defects caught before merge | Knowledge spread | Best for |
|---|---|---|---|---|
| Blocking pre-merge review | Hours to days | High, if tiered by risk | High | Most teams, most changes |
| Pairing or mob programming as review | None after the session | High for design; lower for fresh-eyes bugs | Very high | Complex or risky work |
| "Ship / Show / Ask" (a pattern described on Martin Fowler's site) | None for "ship" | Low for "ship", as for pre-merge on "ask" | Medium | Trusted teams with strong CI |
| Post-merge review | None | None before merge | Medium | Low-risk, reversible changes behind flags |
| AI first pass, then human | Minutes | Good for local bugs; weak on design and intent | Low | A filter before human review, never a replacement ([AI in design and review](/learn/ai-assisted-engineering/senior-engineering-with-ai/ai-in-design-and-review)) |

## Interviewer follow-ups

**"Tell me about a code review where you found something important."** Model answer: the risk you were reading for, the mechanism of the bug, how you explained its impact, what you proposed, and the rule or test that stops it recurring. Common wrong answer: a story about a style disagreement, which signals that your reviews stop at the surface.

**"How do you review a 2,000-line pull request?"** Model answer: read the description and design first; if the design is right, ask for it to be split and offer to help slice it; if it must go in whole, review by risk (auth, data, concurrency first) and say which files you skimmed. Common wrong answer: "carefully, line by line", which is how the important line gets missed.

**"How do you give critical feedback to someone more senior than you?"** Model answer: the same labels and the same evidence: the mechanism, the impact, a question where you are unsure. Seniority changes the brevity, not the bar. Common wrong answer: "I would not block a senior's PR".

**"Your team's PRs wait two days for review. What do you do?"** Model answer: measure time to first review and who reviews what; by Little's law a two-day wait caps throughput well below what the team can write; set a response target, spread ownership, cut PR size, and review daily in a fixed slot. Common wrong answer: "ask people to review faster", which changes nothing while one reviewer is saturated.

## What mid-level engineers get wrong

- **Reviewing top to bottom.** They find the typos and miss the design.
- **Leaving unlabelled comments.** Authors cannot tell a nit from a blocker and treat all of them as blocking.
- **Suggesting changes they have not reasoned through.** The `.expect()` suggestion would have added a panic to the login path.
- **Deleting why-comments as noise.** They remove the context the next reviewer needs.
- **Going Socratic on a security bug.** The vulnerability stays open while the author guesses.
- **Letting PRs wait.** They see review as interruption, while the queue caps the team's output.

## Exercise: tier a diff by risk

```exercise
id: review-risk-tier
title: Decide how deep a review must go
prompt: |
  `files` is a list of `[path, added, deleted]` entries. Classify the change.

  Categories, checked per file (a file can match several):
  - `auth`: some path segment, with its extension removed, equals "auth"
    (so both `src/auth/password.rs` and `routes/auth.rs` match).
  - `migration`: the path starts with "migration/".
  - `ci`: the path starts with ".github/workflows/", or the file name is
    "Dockerfile".
  - `dependencies`: the file name is "Cargo.toml" or "package.json".

  A file is low risk if it matches none of those and it ends with ".md",
  or its path contains "/tests/" or starts with "tests/", or it ends with
  ".test.ts", or its file name is "Cargo.lock" or "pnpm-lock.yaml".
  Any other file is ordinary source.

  - `tier` is "high" if any file is auth, migration or ci; otherwise
    "medium" if any file is dependencies or ordinary source; otherwise "low".
  - `reasons` is the sorted list of distinct categories matched.
  - `lines` is added + deleted summed over all files except lockfiles
    ("Cargo.lock", "pnpm-lock.yaml").
  - `split` is true when `lines` is greater than 400.

  Return `{"tier": ..., "reasons": [...], "lines": n, "split": bool}`.
languages: [python, javascript]
entry: review_tier
starter:
  python: |
    def review_tier(files):
        # your code here
        return {"tier": "low", "reasons": [], "lines": 0, "split": False}
  javascript: |
    function review_tier(files) {
      // your code here
      return { tier: "low", reasons: [], lines: 0, split: false };
    }
tests:
  - args: [[["crates/core/src/auth/password.rs", 13, 3], ["crates/core/src/auth/service.rs", 27, 5]]]
    expected: {"tier": "high", "reasons": ["auth"], "lines": 48, "split": false}
    label: two files in the auth module
  - args: [[["content/tracks/13-senior-craft/track.md", 300, 20]]]
    expected: {"tier": "low", "reasons": [], "lines": 320, "split": false}
    label: docs only
  - args: [[["Cargo.lock", 900, 850], ["Cargo.toml", 2, 1]]]
    expected: {"tier": "medium", "reasons": ["dependencies"], "lines": 3, "split": false}
    label: lockfile lines do not count
  - args: [[["migration/src/m0007_integrity.rs", 131, 0], ["crates/api/tests/api.rs", 170, 5], ["crates/core/src/services/interviews.rs", 70, 18]]]
    expected: {"tier": "high", "reasons": ["migration"], "lines": 394, "split": false}
    label: a migration makes the whole change high risk
  - args: [[["web/src/pages/Profile.tsx", 300, 20], ["web/src/lib/markdown.test.ts", 90, 5]]]
    expected: {"tier": "medium", "reasons": [], "lines": 415, "split": true}
    label: too large to review well
  - args: [[[".github/workflows/ci.yml", 5, 1], ["Dockerfile", 4, 0], ["crates/api/src/routes/auth.rs", 12, 6]]]
    expected: {"tier": "high", "reasons": ["auth", "ci"], "lines": 28, "split": false}
    hidden: true
    label: a file named auth counts, and so does CI
  - args: [[]]
    expected: {"tier": "low", "reasons": [], "lines": 0, "split": false}
    hidden: true
    label: empty change
  - args: [[["crates/core/src/services/progress.rs", 250, 150]]]
    expected: {"tier": "medium", "reasons": [], "lines": 400, "split": false}
    hidden: true
    label: exactly 400 lines does not need splitting
hints:
  - "Split the path on '/', take the last segment as the file name, and strip everything from the first '.' of each segment when checking for auth."
  - "Work out each file's categories first, then derive the tier from the set of categories and whether any ordinary source file appeared."
  - "Exclude only lockfiles from the line count; docs and tests still count as lines to review."
```

## Senior signals

- You review in passes, starting with context and design, and read for risk before style.
- You label comments by severity, and your suggestions are reasoned through before you post them.
- You explain impact and mechanism, point to what the codebase already has, and turn repeated comments into automation.
- You calibrate between asking and telling by author and urgency, and never go Socratic on a security bug.
- You know that review latency above a threshold caps team throughput (Little's law), and you treat your own review queue as part of the team's delivery.
- You scale review with risk tiers, ownership rules and a written guide, and make your own changes small and easy to review.

## Check yourself

```quiz
- q: >-
    In the Ascend diff, why did the first unknown-email login after each boot leak information?
  options: ["The lazy dummy hash was computed on its first use, slowing that login", "The permit was held across the database query, adding a lookup delay", "The semaphore rejected the first caller, so it returned an error body", "spawn_blocking started a new thread for the first call, adding latency"]
  answer: 0
  explanation: >-
    DUMMY_HASH is a LazyLock, so its first read runs a full Argon2 hash. The read happened before the permit, on the async task, so that one login did two hashes and was roughly twice as slow: a one-off signal that the email had no account. The semaphore does not reject callers, and the permit is not held across the query.
- q: >-
    A reviewer suggests replacing let Ok(_permit) = ... else { return false } with .expect(). What is wrong with the suggestion?
  options: ["expect() is slower than a let-else because it formats a message", "It changes nothing, so it is harmless style that should be a nit", "It would hold the permit for longer than the verification needs", "It would panic the handler if the semaphore were ever closed"]
  answer: 3
  explanation: >-
    The let-else fails closed: verification returns false. expect() turns the same condition into a panic in a request handler. The lesson's point is that unreasoned style suggestions can make code worse; a suggestion must be thought through as carefully as the code it replaces.
- q: >-
    Eight engineers can each keep two PRs in flight, and a PR spends one day in coding and a quarter-day in rework. Review wait rises from 4 to 16 working hours. What happens to throughput under Little's law?
  options: ["It falls by three-quarters, in proportion to the wait", "It falls from about 6.4 to about 4.9 merged per day", "It rises, because larger batches merge more at once", "It stays at 6.4, because engineers start other work"]
  answer: 1
  explanation: >-
    With 16 PRs of work in progress, throughput is at most 16 divided by time in the system. At a 4-hour wait that bound is 9.1, above the 6.4 the engineers can write, so engineering time limits the team. At 16 hours the time in system is 3.25 days and the bound is 4.9, so the review wait now sets output. The fall is not proportional because coding time is also in the denominator.
- q: >-
    Why does a reviewer at 90% utilisation create long waits even though they have spare capacity?
  options: ["A reviewer at 90% has no spare capacity, so the queue grows forever", "Context switching makes each review take nine times longer at that load", "They batch reviews at the end of the day, so every review waits a day", "Queue wait grows as rho over one minus rho: 9 review-times at 90%"]
  answer: 3
  explanation: >-
    In a single-server queue model the mean wait is rho over one minus rho times the service time: about 1 at 50% but 9 at 90%, because arrivals are bursty and the idle 10% cannot absorb bursts. The queue is still stable below 100%; it is merely long. Batching and context switching can make it worse but are not the mechanism.
- q: >-
    A mid-level engineer's PR has a subtle race condition in a non-urgent background job. Which comment teaches best?
  options: ["Approve now and quietly fix the race yourself in a follow-up PR later.", "blocking: this is racy; add a lock around the job pickup before merge.", "Push a fix to their branch yourself so the race never reaches main.", "question: what happens if two workers pick up the same job at once?"]
  answer: 3
  explanation: >-
    For a non-urgent issue, a leading question lets the author find the race and remember it. Stating the fix is right for urgent or security problems; pushing a fix or quietly fixing it later removes both the learning and the author's ownership.
- q: >-
    A change touches a migration, an auth module and 300 lines of ordinary code. How should its review be staffed?
  options: ["Two reviewers who each read the whole diff, top to bottom, to be safe", "One reviewer who knows the module, since the total is under 400 lines", "Owners of the data and auth paths review them with the risk checklist", "An AI first pass, then a human approves anything the tool did not flag"]
  answer: 2
  explanation: >-
    Review depth follows risk, not size. Migrations and authentication are high-risk rows with their own checklists and owners; a single generalist reviewer, or two reading top to bottom, tends to find the typos rather than the timing leak or the table lock. An AI pass is a filter before human review, not a replacement for the owner's judgement.
```

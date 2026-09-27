---
slug: code-review-as-mentorship
title: "Code review as mentorship: reviewing for design, teaching through comments"
description: What code review is for, the order to review in, how to label and word comments, a worked review of a real security bug, and how seniors scale good review across a team.
minutes: 22
difficulty: medium
tags: [leadership, code-review, mentorship, communication, security]
---
A 900-line pull request receives 38 review comments. Thirty-five are about naming, formatting and import order. Three are about logic. None notices that the login endpoint now returns immediately when the email does not exist, so an unknown email answers in about 2 ms while a wrong password takes about 40 ms: an attacker can now enumerate which emails have accounts by timing the responses. The author, six months into their first job, spends two days addressing nits and learns nothing about timing attacks. The review failed twice: as a quality gate and as teaching.

Code review is the highest-frequency leadership activity a senior engineer has. You do it daily, it is where standards are actually set, and it is where most engineers learn most of what they know about a codebase. Done well it catches the bugs that matter and makes the author better. Done badly it is slow, demoralising and still lets the important bugs through.

## What review is for

In priority order:

1. **Correctness and risk.** Bugs, security holes, data loss, concurrency errors, operational hazards, and whether the approach is right at all.
2. **Shared understanding.** After review, at least two people understand the change. That is your bus factor and your on-call coverage.
3. **Maintainability.** Will the next engineer understand and safely change this?
4. **Consistency.** Style and conventions, which should be enforced by formatters and linters, not by humans.

Review is not for proving you are clever, rewriting the change the way you would have written it, or enforcing taste that no document records. Every comment spends the author's time and attention; spend it on the top of the list.

## Review in passes

Reading a diff top to bottom mixes design questions with typos and tends to find the typos. Review in passes, largest concerns first:

1. **Context.** Read the description and the linked issue or design doc. If you cannot tell *why* the change exists, ask before reviewing the code.
2. **Design.** Does this belong in this module? Is the approach sound? Is there a much simpler way? Post design concerns *first and alone*, so the author does not polish lines that are about to be rewritten.
3. **Correctness.** Edge cases (empty, null, huge, concurrent, retried), error handling, security boundaries, performance on the hot path, migrations and rollbacks.
4. **Tests.** Do they test behaviour and failure paths, and would they fail if the bug you are worried about were present?
5. **Readability.** Names, structure, comments that explain why.
6. **Nits.** Label them as such, or better, leave them to tooling.

Size matters more than skill. Most teams find review quality falls off sharply once a change passes a few hundred lines; beyond that, reviewers skim. Ask for large changes to be split into a stack of small ones (refactor, then feature, then cleanup), and aim to give a first response within one working day, because a pull request that waits three days costs the author far more context than any review saves.

## Label every comment

Explicit labels remove the guessing about what is required. Many teams use a convention like this (a lightweight version of the "conventional comments" style):

| Label | Meaning | Example |
|---|---|---|
| `blocking:` | Must change before merge | "blocking: this query runs inside the loop; 500 items means 500 round trips." |
| `suggestion:` | Better way, author decides | "suggestion: `entry().or_insert` would remove the double lookup." |
| `question:` | Genuine question, not disguised criticism | "question: can this be called before `init()`? If so we need a guard." |
| `nit:` | Trivial, never blocks | "nit: typo in the log message." |
| `praise:` | Specific thing done well | "praise: the table-driven test makes the edge cases easy to see." |

Praise is not decoration. Specific praise tells the author which habits to keep, and a review with only criticism teaches people to dread review.

## A worked review

Here is a hypothetical pull request against this app's authentication service, titled "Simplify login: return early for unknown emails":

```rust
pub async fn login(&self, email: &str, password: String) -> AppResult<Session> {
    let Some(user) = self.users.find_by_email(email).await? else {
        // unknown email: skip the expensive hash
        return Err(AppError::Validation("invalid email or password".into()));
    };
    if !password::verify(password, Some(user.password_hash.clone())).await {
        return Err(AppError::Validation("invalid email or password".into()));
    }
    self.sessions.create(user.id).await
}
```

**A review that fails:**

> "Why would you do this??"
>
> "Use `match` here, I don't like let-else."
>
> "Rename `user` to `maybe_user`."
>
> "Approve after fixes."

It is hostile, mixes taste with substance, gives no reasons, and never mentions the actual problem.

**A review that works:**

> **blocking (security):** When the email does not exist we now return before hashing, so that path answers in about 2 ms while a wrong password takes about 40 ms because Argon2 is deliberately slow. That difference lets anyone enumerate which emails have accounts by timing requests. `password::verify` already handles this: it accepts `None` and verifies against a dummy hash so both paths cost the same (see the comment on `DUMMY_HASH` in `crates/core/src/auth/password.rs`). Something like:
>
> ```rust
> let user = self.users.find_by_email(email).await?;
> let ok = password::verify(password, user.as_ref().map(|u| u.password_hash.clone())).await;
> match (ok, user) {
>     (true, Some(user)) => self.sessions.create(user.id).await,
>     _ => Err(AppError::Validation("invalid email or password".into())),
> }
> ```
>
> Happy to pair on it if useful.
>
> **question:** Is there a test that would have caught this? `login_errors_do_not_leak_account_existence` checks that the two response bodies are identical, which this change still passes, because a test that compares bodies cannot see timing. A test that asserts `verify` is called on both branches (with a counting fake) would lock the behaviour in.
>
> **praise:** Returning the same "invalid email or password" error for both failure paths is exactly right: identical responses mean the error body cannot leak which emails exist. The fix above just makes the timing match too.

Why it works: the one blocking issue is clearly labelled and explained in terms of impact, it points to the mechanism the codebase already has (teaching the codebase, not just the fix), it proposes concrete code, the question pushes toward a test that prevents regression, and the praise is specific. The personal-taste comments are simply gone.

## Tone: rewriting comments

| Instead of | Write |
|---|---|
| "Why didn't you use a map here?" | "suggestion: a map keyed by user ID would make this lookup O(1). Any reason it would not fit?" |
| "This is wrong." | "blocking: I think this panics on an empty list (`items[0]`). Could we return early?" |
| "Obviously this should be async." | "question: this does disk I/O inside a request handler; should it go through `spawn_blocking`?" |
| "You forgot tests." | "Could we add a test for the empty-cart case? That path caused the March incident." |
| "Just do it like the payments service." | "The payments service solved this with an outbox table (link). Worth a look?" |

The principles behind the rewrites: comment on the code, not the person; say *why*; make severity explicit; ask questions you genuinely want answered; offer help. Write "we" when talking about the codebase ("we usually..."), because it is shared.

## Teaching through review

**Calibrate to the author.** With a junior engineer on a non-urgent point, a leading question teaches more than an answer: "What happens if two requests for the same user arrive at once?" lets them find the race themselves. On anything urgent or security-related, give the answer and explain it; a Socratic dialogue about an open vulnerability is self-indulgent. With a senior peer, be direct and brief.

**Turn repetition into rules.** The second time you write the same comment, it belongs in a linter, a formatter, a template or the team's review guide, not in a third review. Your comments should get *more* interesting over time.

**Move long threads to a conversation.** After three back-and-forth replies, talk for ten minutes, then post a one-paragraph summary of the outcome in the PR so the record stays complete.

**Let small things go.** "Approve with suggestions" trusts the author to take or leave non-blocking comments. Blocking a merge on a nit teaches that review is a toll booth.

**Watch the trend.** Mentoring through review is working if a mentee's pull requests need fewer and less fundamental comments each month, and if they start leaving good comments on others' code.

## Being reviewed, as a senior

Seniors make review cheap for others. Self-review your diff before requesting review (you will find a third of the comments yourself), keep changes small, and write descriptions that answer the reviewer's first questions:

```text
What: <one or two sentences on the change>
Why: <the problem, with a link to the issue or design doc>
How: <the approach, and anything surprising about it>
Testing: <what you ran; new tests; manual checks>
Risk and rollout: <what could break, flag name, how to roll back>
Reviewer notes: <where to focus; files that are mechanical and can be skimmed>
```

Respond to every comment, even with "done". Disagree with reasons, not silence, and accept that a well-argued "I would rather not, because..." is a legitimate reply to a suggestion.

## Scaling review across a team

- **A written review guide** stating what blocks a merge and what does not, the label convention, and the expected turnaround.
- **Ownership files** (such as `CODEOWNERS`) so the right expert is requested automatically, plus rotation so knowledge spreads beyond them.
- **Automation for everything mechanical:** formatting, linting, type checks, dependency and secret scanning. AI review assistants can take a useful first pass for obvious bugs, but humans stay accountable for design and risk; see [AI in design and review](/learn/ai-assisted-engineering/senior-engineering-with-ai/ai-in-design-and-review).
- **A few metrics:** time to first review, pull request size, and how review load is distributed. If one senior does 60% of the team's reviews, they are a bottleneck and a single point of failure, however good their reviews are.

Mentorship extends beyond review, of course: regular one-to-ones, stretch assignments with a safety net, and *sponsorship*, which is advocating for someone's work in rooms they are not in. Review is simply where the daily, compounding part of it happens.

## Senior signals

- You review in passes, starting with context and design, and post design concerns before line comments.
- You label comments by severity so authors know exactly what blocks a merge.
- You explain impact and point to existing mechanisms in the codebase, teaching the system rather than just the fix.
- You calibrate between asking and telling based on the author and the urgency, and never go Socratic on a security bug.
- You turn repeated comments into automation or written guidance.
- You make your own changes easy to review: small, self-reviewed, with a description that states risk and rollback.

## Check yourself

```quiz
- q: >-
    You open a 700-line pull request and immediately see a fundamental problem with the approach. What should you do first?
  options: ["Rewrite it yourself on a branch, since explaining the problem would take longer", "Approve it to keep things moving and open a follow-up ticket for the design", "Comment on every line first, then raise the approach once the details are fixed", "Post the design concern alone first, so the author does not polish doomed code"]
  answer: 3
  explanation: >-
    Design feedback determines whether the lines matter at all. Leading with line comments wastes the author's effort and buries the important point; approving defers a known problem, and rewriting it yourself removes the author's learning and ownership.
- q: >-
    A mid-level engineer's PR introduces an early return for unknown emails in login. What makes this worth a blocking comment?
  options: ["let-else is harder to read than match, and the team style guide prefers match", "Unknown emails now answer faster than wrong passwords, so timing reveals accounts", "It changes the error message, so the client can no longer show a friendly error", "It adds a database query to the login path, which slows every sign-in down"]
  answer: 1
  explanation: >-
    Argon2 verification is deliberately slow, so skipping it creates a measurable timing difference; the dummy-hash path in password.rs exists to equalise it. The PR adds no query and keeps the same error message, and let-else versus match is taste, which never earns a blocking label.
- q: >-
    You have left the same "use the shared retry helper" comment on five pull requests this month. What is the senior move?
  options: ["Block every PR that misses it until the team stops making the mistake", "Stop reviewing that team's code, since they are clearly not reading comments", "Keep leaving it on every PR, because repetition is how a team learns rules", "Encode it in a lint rule, template or review guide so tooling catches it"]
  answer: 3
  explanation: >-
    Repeated comments are a signal that a rule belongs in automation or documentation. That frees review for problems only humans can spot, instead of turning it into a toll booth for a rule a machine could check.
- q: >-
    A junior engineer's PR has a subtle race condition in a non-urgent background job. Which comment teaches best?
  options: ["\"blocking: this is racy; add a lock around the job pickup before merge.\"", "\"question: what happens if two workers pick up the same job at once?\"", "Approve now and quietly fix the race yourself in a later pull request", "Push a fix to their branch yourself, so the race never reaches main"]
  answer: 1
  explanation: >-
    For a non-urgent issue, a leading question lets the author find the race and remember it. Stating the fix is right for urgent or security problems, but here it skips the learning; pushing a fix or quietly fixing it later removes both the learning and the author's ownership.
- q: >-
    One senior engineer performs about 60% of a team's code reviews and is praised for their thoroughness. What is the concern?
  options: ["Seniors should not review code at all, because their time is better spent on design work", "None; thorough reviews are always good, whoever happens to be doing them", "Thorough reviews are wasted on routine changes, so they should review less deeply", "They are a bottleneck and single point of failure, and review skill is not spreading"]
  answer: 3
  explanation: >-
    Concentrated review delays everyone when that person is busy or away and keeps others from learning to review. The depth of the reviews is not the problem; leverage means making the team capable of good review, with rotation and written guidance, not doing it all personally.
```

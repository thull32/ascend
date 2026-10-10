---
lesson: design-docs-and-rfcs
source: fdbd35e49378ec4c
fit: great
desk:
  - "RFC-0142 in full: summary, goals and non-goals, the options table, rollout phases, risks and decision log"
  - "The retry-amplification code and its table of load at each failure rate"
  - "The review-meeting timetable and the document lifecycle diagram"
  - "The design doc skeleton and the reviewer's seven-question checklist"
  - "The reply-persistence options table, with the shutdown fix and its test"
  - "Exercise: replay an RFC's history"
---
## Introduction

A team spends ten weeks building a notification service on WebSockets. In week ten, a security review points out that a corporate proxy, used by a third of their enterprise customers, strips WebSocket upgrade requests. Those customers will never receive a notification. The team rebuilds on Server-Sent Events, which that proxy passes through. A four-page design doc circulated in week one would have drawn that comment from the networking team in a day. The story is illustrative; proxies that break WebSocket upgrades are not.

A design doc is the cheapest place to be wrong. Changing a paragraph costs minutes. Changing a deployed system costs weeks, and sometimes a migration. The doc is also how a senior engineer scales judgement: ten people check your reasoning in parallel, and the engineer who inherits the system in two years can read why.

Four things are coming. When to write one. A full RFC, worked end to end, with numbers a reviewer can check. How the review meeting and the document's life actually run. And a real decision from this app's code, including the part that was still missed.

## When to write one, and how big

Write a design doc when any of these hold. The work is more than about two engineer-weeks. It crosses a team boundary or changes a shared API or data contract. It is hard to reverse: a data model, a storage engine, a public API, a vendor. It touches security, privacy or compliance, or adds infrastructure someone must operate. Or reasonable engineers would disagree.

Size the document to the risk. A reversible two-week change deserves a one-pager: problem, proposal, alternatives, risks. One widely read description of design docs at Google puts larger projects at around 10 to 20 pages and incremental changes at one to three. A twelve-page doc for a reversible decision is its own failure. It teaches people that docs are bureaucracy.

A design doc is usually about a project one team owns. An RFC, a request for comments, proposes a change that many teams must adopt: a shared standard or platform capability. The audience is wider, adoption is voluntary until mandated, and the process, who may object and until when, matters more.

## An RFC, worked end to end

Five product teams each wrote their own HTTP retry logic, and one afternoon a slow dependency turned into a two-hour outage. The incident is illustrative. RFC 142 proposed the fix.

The summary, five sentences. Five teams retry five different ways, and under a slowdown their retries multiply to nine times normal load. Proposal: one shared client library with jittered backoff, a per-client retry budget of 10 percent, and no retries of requests that are not idempotent. Cost: about three engineer-weeks to build and half a week per team to adopt. And what the author needs: a decision on the budget, and on who owns the library.

Then the goals, every one checkable. Under total failure of a dependency, each layer adds at most 10 percent load. Posts are retried only when they carry an idempotency key. All five teams on the library within two quarters. Steady-state 99th percentile latency within 5 percent of today. And the non-goals: circuit breaking, timeout policy, gRPC services, adopting a service mesh. Every non-goal answers a question a reviewer would otherwise ask in the comments.

Now the number the design exists to hit. Two layers of services each make up to three attempts. The dependency behind them fails every call. How many calls does it get per user request?

[pause]

Nine. Three attempts at the outer layer, each causing three at the inner one. Retries multiply across layers; they do not add.

A retry budget caps retries at a fixed fraction of requests, here 10 percent, the figure from Google's SRE book. So each layer adds at most a tenth, and two layers come to about 1.2 times normal load, whatever the failure rate. On a dependency that normally serves 2,000 requests a second, total failure without a budget sends 18 thousand. With the budget, about 2,400. At a 50 percent failure rate, it is over 6 thousand without a budget, and still about 2,400 with one.

And the budget costs almost nothing when failures are rare. At a 10 percent failure rate, it allows a tenth of a retry per request, against 0.11 without it: a sliver. Here is the argument in one line: the budget removes the storm when failures are common and is nearly invisible when they are rare. And the table lets a reviewer check that without trusting the author.

## Options, rollout and risks

Four options. A, a written guideline and every team fixes its own code: cheapest to write, and least likely to stay true, because five implementations drift. B, the shared library: meets the goals with no new infrastructure. C, retries in a service-mesh sidecar: the strongest guarantee, but it asks the organisation to adopt a mesh for one feature, which takes quarters. D, do nothing: nine times the load, already drifted.

Decision: B. And a revisit line: when the organisation adopts a mesh for another reason, mutual TLS being the usual one, retry policy moves into the sidecar and the library shrinks.

The rollout has phases. A week in shadow mode, where the library only logs what it would have retried or refused. Then checkout, behind a per-service flag, from 10 to 100 percent of traffic. Then the service template, a codemod, and a lint warning on hand-written retry loops. Then the remaining teams, with the platform team opening the pull requests. Finally the lint fails on new loops and the old helpers are deleted. Rollback, at every step until then, is flipping the flag.

Each risk has a mitigation and an owner, and the decision log records what review changed, with dates: the budget's shape, from the reliability engineer's review; posts retried only with an idempotency key, from the payments lead; the mobile gateway out of scope until later; and the final comment period closing with no blocking objection.

Before shipping, run a pre-mortem. Assume it is a year later and the design failed, and list the likeliest reasons. Teams kept their old loops, so requests were retried twice: the lint covers it. The budget refused retries during short blips, so teams turned it off: shadow data and an alert cover it. And the library fell behind a language upgrade, and teams forked it. That one was not in the risks at all. The pre-mortem found it in ten minutes, and the fix was a named owner and an upgrade policy. Imagining the failure as already happened asks for a story, not a probability, and surfaces risks that "what could go wrong" does not.

## The meeting and the lifecycle

Most review happens asynchronously in the document's comments, with a deadline; five working days is common. The meeting exists only for what is still contested. A 45-minute shape that works: ten minutes of silent reading, and the author does not present, because the doc is the argument and a presentation replaces it with charisma. Then 25 minutes of open comments, blocking ones first, each ending as accept, reject, or a follow-up with an owner. Then the approver states the decision. Then the note-taker reads back the decision log. And the facilitator is not the author, so the author can listen.

Here is a blocking comment being closed. The payments lead: the draft retries any request that times out; a timed-out post to payments may have succeeded, so retrying it charges twice. The author: agreed, that is a real bug in the draft. Proposal: posts are retried only with an idempotency key, which payments already deduplicates on. Other teams' posts have no keys, so they are not retried at all, which is today's safest behaviour. Logged, with an owner and a date. The objection came with its mechanism, and the author conceded the fact without defending the draft.

The document has a life. Draft, then in review, then the final comment period, then accepted, implemented, and eventually superseded. The final comment period is the important state: a fixed window, a week is common, announced widely, after which silence counts as consent. Without it, RFCs stay open forever, which is itself a decision not to decide. Rust's public process uses ten calendar days, and substantial new arguments during it send the proposal back. And after implementation, an "as built" section records where reality diverged. A design doc that no longer describes the system is worse than none, because readers trust it.

## A decision from this codebase

This app streams AI coach replies to the browser, and a reply can take tens of seconds. The obvious first implementation saves the reply at the end of the request handler. Then a closed tab cancels the handler, and the reply, already paid for, is never saved.

The doc's goals: no reply lost because the client disconnected, no added latency to the first token, no new infrastructure. Its non-goals: surviving a server crash mid-stream, and resuming a stream in a new tab.

Three options. A, save in the handler: smallest, and loses replies. B, a spawned background task owns the stream and the saving, and the response just reads from a bounded channel of 64 messages: survives a disconnect, no new infrastructure, under 60 lines. C, a durable job queue with a worker and publish-subscribe to the browser: survives crashes too, but adds a queue hop per event and hundreds of lines plus operations. Decision: B. C solves a problem listed as a non-goal.

The consequences were written down: a reply in flight when the process is killed is lost, so graceful shutdown must wait for in-flight tasks. And here is the lesson's point. The first implementation still started the task with a bare spawn, and nothing waited for it at shutdown. Once connections drained, the server exited and dropped any reply whose browser had already gone. The fix tracks those tasks and waits up to 30 seconds for them after the server stops accepting connections, bounded so a hung upstream cannot block a deploy.

A consequence that says "must" is a requirement. Give it a test or a checklist item, or it stays prose. This one later got its test.

Alongside the doc, keep architecture decision records: one decision in a few paragraphs, context, decision, status and consequences, never edited afterwards, only superseded, stored next to the code. Together they become a searchable history of why the system is the way it is.

## In the interview

Here is a follow-up the lesson expects. A reviewer blocks your design, and you think they are wrong. What do you do?

[pause]

Restate their objection until they agree you have it. Separate fact from preference. Settle the fact, with a spike or a lookup. And if it is a values question, take it to the approver with both positions written fairly. The wrong answer is going around them to the approver, or accepting the change just to end the argument.

And: when would you not write a design doc? For reversible, local, small work, where a pull request description and a decision record for the one decision are enough. The cost of the doc should track the cost of being wrong. The wrong answer is "always write one", which is how docs become bureaucracy.

## Recap

Four things to remember. Write a doc when the change is costly, cross-team or hard to reverse, and size it to the risk. Give it checkable goals, explicit non-goals, honest alternatives including do nothing, and numbers a reviewer can recompute, like nine times the load without a retry budget and about 1.2 with one. Run review asynchronously, meet only for what is contested, and close with a final comment period. And keep the document alive: a decision log, an "as built" section, decision records, and a test for every "must".

At your desk: the full RFC and its options table, the retry-amplification table, the meeting timetable and lifecycle, the doc skeleton and reviewer checklist, the reply-persistence design, and the RFC-history exercise.

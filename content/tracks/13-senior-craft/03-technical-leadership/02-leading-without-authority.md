---
slug: leading-without-authority
title: "Leading without authority: influence, alignment and disagreement"
description: How senior engineers move a decision across teams they do not manage, traced through an annotated sequence of conversations, with a stakeholder map, a filled decision brief, disagree-and-commit worked in actions, and how decision rights work behind the scenes.
minutes: 22
difficulty: medium
tags: [leadership, influence, decision-making, alignment, disagreement, escalation, stakeholders]
---
Your company has twelve HTTP services owned by five teams, and they return errors in four different shapes. The mobile app carries three separate error parsers. Last quarter one of them failed to recognise a payments error, showed "Something went wrong", and the app's automatic retry sent three times the normal traffic to payments for forty minutes. You want one error format everywhere. You manage none of the five teams. Each has its own roadmap and a product manager who did not budget for your change, and two of the tech leads have never heard of you. An email saying "please adopt the new format by September 30" will be read, agreed with, and ignored.

This is the normal shape of senior work: the problems worth solving cross boundaries, and the people who must act report to someone else. What works is influence: making the right outcome cheap to agree with, making the decision and its decider explicit, and handling disagreement so it improves the decision instead of stalling it. This lesson traces one decision (the scenario is illustrative) through seven conversations over three weeks, then shows the machinery underneath: who actually holds decision rights, why pre-wiring works, and what "commit" looks like in actions.

## Where influence comes from

| Source | What it looks like | How you build it | Shelf life |
|---|---|---|---|
| Expertise | People ask your opinion because you are usually right about this area | Go deep on something the organisation depends on; write it down | Years |
| Track record | Your past proposals shipped and worked | Deliver small commitments; report outcomes | Years |
| Relationships | People take your call and give you the benefit of the doubt | Help with their problems before you need anything | Years |
| Clarity | Your writing makes the decision easy to understand | One-page briefs, numbers, explicit trade-offs, a clear ask | Per document |
| Alignment | Your ask advances their goals, not only yours | Learn what each team is measured on | Per decision |
| Borrowed mandate | A director has said this matters | Use sparingly | Buys compliance once; costs goodwill each time |

The first five compound, and they behave like a ledger. Deposits: delivering what you said, public credit, admitting mistakes quickly, keeping confidences. Withdrawals: surprising people in meetings, going around someone to their manager, relitigating settled questions, overstating certainty. Senior engineers make deposits long before they need to withdraw.

## Map the stakeholders before the first conversation

Before persuading anyone, list who must act, who can block, and what each one needs. For the error-format decision:

| Stakeholder | Role | Power over outcome | Starting position | What they care about | What would make it a yes | Position after week 3 |
|---|---|---|---|---|---|---|
| Priya, director over all five teams | Approver | Decides; controls roadmaps | Unaware | Incidents, delivery dates | A one-page brief with cost and a date | Decided: yes |
| Marco, checkout tech lead | Contributor | High: most clients; can slow-walk | Against: "churn" | Q3 checkout launch | No work before the launch; someone else writes the parser | Supports, with conditions |
| Aisha, mobile lead | Contributor | High: app release cadence | Neutral | Old app versions keep working | Additive change; nothing removed until old versions age out | Supports |
| Kenji, payments tech lead | Contributor | Medium | For a standard, a different one | Using RFC 9457 as published | His standard as the base | Disagreed on one point; committed |
| Dana, support lead | Contributor | Low power, high interest | For | Six hours a week translating codes | Any single format | Champion; supplied the evidence |
| Your manager | Sponsor | Your time | Unaware | Your quarter's goals | A bounded ask: 20% of your time for one quarter | Sponsor |

Three columns do the work. **Power** tells you the order of conversations: high-power sceptics before the meeting, never in it. **What would make it a yes** is the column you fill by asking, not guessing. **Position after** is the tracker you update after every conversation; when a row stops moving, that is where the next conversation goes.

## Seven conversations, annotated

| # | When | Who | What was said (the key line) | What changed |
|---|---|---|---|---|
| 1 | Week 0 | Dana, support | "Where does error translation cost you?" Answer: 41 tickets tagged `error-mapping` last quarter, about six hours a week | The problem has a number and someone who feels it |
| 2 | Week 0 | Your manager | "Can I spend 20% of this quarter on it, and is Priya the right approver?" | Time secured; the decider named before any persuading |
| 3 | Week 1 | Marco, checkout | "What would it cost you?" (dialogue below) | Sceptic to conditional support; two conditions written down |
| 4 | Week 1 | Aisha, mobile | "Which app versions must keep working, and for how long?" Answer: the minimum supported version is six months old | The rollout changes from "switch" to "additive, then remove" |
| 5 | Week 2 | Kenji, payments | "What would have to be true for plain RFC 9457 to be the better choice?" | Two positions narrowed to one field; the rest agreed |
| 6 | Week 3 | Priya, approver | Pre-read of the brief, then a 15-minute decision slot | Decided, with the one open point settled |
| 7 | Week 3 | Kenji | The commit conversation (below) | Dissent recorded with a revisit trigger; payments migrates first |

Notice the order: evidence (1), then sponsor and decider (2), then the highest-power sceptic (3), then the constraint that shapes the rollout (4), then the rival proposal (5), and only then the decider (6). Talking to Priya first would have produced "come back when the teams agree"; talking to Marco in the meeting would have produced a public "no" that he would then defend.

### Conversation 3: the sceptic

> **You:** I am proposing one error format across services. Your team owns the most clients, so I wanted your view before anything is decided.
>
> **Marco:** We have bigger problems. Our clients already parse our errors. This is churn.
>
> **You:** Fair. What would it cost you, roughly? *(Asking about their cost before defending the idea.)*
>
> **Marco:** Two or three weeks, plus coordinating a mobile release. And not before the Q3 launch.
>
> **You:** That matches my estimate. Two things might change the maths. Support spends about six hours a week translating codes during incidents, mostly on checkout flows. And the retry storm last quarter started in a parser that did not recognise a payments error. *(Evidence he can check, tied to his on-call.)*
>
> **Marco:** Six hours from whom?
>
> **You:** Support's ticket tags; I will put the query in the doc. What would it take for you to support this? *(The direct question.)*
>
> **Marco:** Old format valid until after the launch, and someone other than my team writes the shared parser.
>
> **You:** I will own the parser, and I will write both conditions into the brief so you can hold me to them. *(Objections converted into written commitments.)*

### Conversation 5: the rival proposal

Kenji wanted RFC 9457 ("problem details"), the IETF format with `type`, `title`, `status`, `detail` and `instance` members, served as `application/problem+json`. The first ten minutes were a disagreement about everything; separating it into kinds shrank it:

- **Facts:** RFC 9457 permits extension members. Checked in the RFC during the meeting: yes.
- **Predictions:** "Clients will branch on a URI string as easily as on a short code." Checkable later: count client branches after migration.
- **Values:** "Follow the standard exactly" against "short codes are what humans read in dashboards."

With the fact settled, both could live with an RFC 9457 body plus a `code` extension member. The one remaining question was whether clients should branch on `type` or on `code`, which is a values question, and values questions go to the decider.

## Make yes the cheapest answer

Most "no"s to cross-team requests are not disagreement; they are cost. Marco agreed errors were a mess and still said no, because two or three weeks before a launch is a real price. So reduce the price until yes is easy, and do the arithmetic, because it becomes part of the brief:

| Lever | What you did | Cost per client-heavy team |
|---|---|---|
| Nothing (the email) | "Please adopt the format by September 30" | 2–3 weeks each, their time |
| Do the shared work | A parser library for the app and the web client, owned by you | Saves about a week |
| Make it additive | Server middleware that emits the new body alongside the old fields | Removes the coordinated mobile release |
| Do their work | A codemod plus migration PRs you open; they review | About 3 days |
| Make progress visible | A tracker (service, owner, status, date) linked from the director's weekly review | Nothing; creates gentle pressure |

Across five teams the email costs about 5 × 2.5 = 12.5 engineer-weeks of other people's time. The lowered version costs about 4 weeks of yours plus 5 × 0.6 = 3 of theirs, about 7 in total, and it moves most of the cost onto the person who wants the change. Against it: six hours a week of support time is about 312 hours, roughly eight 40-hour weeks a year, before counting the next retry storm. Those three numbers, cost to them, cost to you and cost of doing nothing, are what made conversation 3 end in conditions instead of a refusal.

## The decision brief, filled

```text
DECISION BRIEF: One error body for all HTTP services?
Driver: you   Approver: Priya   Decide by: Friday, week 3
Contributors: Marco, Aisha, Kenji, Dana   Informed: all engineering

Context: 12 services return 4 error shapes; the app carries 3 parsers. Support
spends ~6 h/week translating codes (41 tagged tickets last quarter). One
misparsed payments error drove a 3x retry storm for 40 minutes.

Options
  A. RFC 9457 body + `code` extension; clients branch on `code`.
     Cost ~2-3 weeks per client-heavy team; parser library owned by driver.
  B. RFC 9457 body only; clients branch on `type` URIs.   Same cost.
  C. Do nothing.   Cost: ~6 h/week of support time; repeat misparse risk.

Rollout: additive. New body alongside the old fields for 2 quarters (covers
the app's 6-month minimum version); checkout migrates after its Q3 launch.
Recommendation: A, because codes are what support and dashboards display.
What would change it: if client code branches on both fields after migration.
Open question for the approver: A or B (Kenji prefers B).
```

The "what would change it" line turns a clash of opinions into a question about evidence, and the "open question" line tells the approver exactly which disagreement is theirs to settle.

## The decision meeting

The meeting was fifteen minutes because everything else had happened before it. Priya read the brief in the first five minutes, in silence. Kenji stated option B in his own words; you stated A. Priya asked one question: "Which one does support read at 3 a.m.?" She chose A, set the dates, and asked you to post the decision within the day. What had to be true for fifteen minutes to be enough: every contributor had seen the brief, both options were written in their owners' strongest words, and nothing in the room was a surprise.

The announcement went to all engineering the same afternoon: the decision, the rationale in two sentences, the rollout dates, the owner of the parser library, the dissent and its revisit trigger, and where to ask questions.

## Disagree and commit, worked

Amazon's leadership principles include "Have Backbone; Disagree and Commit": challenge a decision respectfully before it is made, then commit wholly once it is. The phrase is usually traced to Intel. Commitment is visible in actions, not in words, so here is what each version looked like in the weeks after:

| Week | Committed (what Kenji did) | Fake commitment (what it would have looked like) |
|---|---|---|
| 3 | "I still prefer `type` URIs. I am committing. Payments will migrate first, and I will write the payments section of the migration guide. I would revisit if clients end up branching on both fields." | "Fine, whatever you all think." |
| 4 | Migration ticket in payments' sprint with a date | "We will get to it after the backlog clears" |
| 6 | In a hallway conversation that questioned `code`: "It was decided; here is why; the trigger is in the log" | Agrees with the hallway critic; "I did say so at the time" |
| 8 | Payments live on the new format; reported in the tracker | Implements `type` only, "to be standards compliant" |
| 12 | Checks the revisit trigger: no client branches on both fields; says so | Raises the question again at planning with no new evidence |

**Reopening is legitimate only with new evidence**, stated as such. A legitimate reopen: "New information: our API gateway vendor can route on `type` but not on extension members; I would like to revisit." An illegitimate one: the same argument, louder, at the next planning meeting. The revisit trigger written into the decision log is what separates the two; anyone who wants to reopen the decision has to show the trigger fired.

Commit also binds the winner. You owe Marco his two conditions, on the dates you promised, and you owe Kenji an honest check of his trigger at week 12.

## Escalation done well

Escalation is not failure; surprise escalation is. When two leads cannot agree and the decision matters, escalate together, with one write-up both agree states each position fairly:

```text
Subject: Decision needed by <date>: <question>

We (<you> and <other lead>) disagree on <question> and need a decision.
Context: <3 sentences>.
Option A (<you>): <position>; strongest reason: <reason>; cost: <cost>.
Option B (<other lead>): <position>; strongest reason: <reason>; cost: <cost>.
What we agree on: <shared facts and constraints>.
Impact of waiting: <what slips if undecided by date>.
We will both commit to whichever you choose.
```

A manager who receives this can decide in ten minutes. A manager who hears two versions from two frustrated people re-runs the whole argument and trusts both a little less.

## Under the hood: how decision rights actually work

**The real approver is the lowest common manager.** Most organisations never write decision rights down. The effective decider for a cross-team change is the lowest manager above every team that must spend capacity on it, because only that person can trade one team's roadmap against another's. A decision taken below that level can be vetoed by any affected team through priority ("we have no capacity this quarter"). That is why conversation 2 was about naming Priya, and why frameworks such as DACI (Driver, Approver, Contributors, Informed) insist on exactly one approver.

**Capacity is allocated at planning time.** Teams commit their quarter or half in a planning cycle. An ask that arrives mid-quarter competes with committed work and usually loses; the same ask raised a few weeks before the other team's planning becomes a line in their plan. Marco's condition ("not before the launch") was the planning cycle speaking. Timing a cross-team ask to the planning calendar is often worth more than a better argument; [estimation, planning and prioritisation](/learn/senior-craft/technical-leadership/estimation-planning-and-prioritisation) covers how those cycles run.

**Why pre-wiring works.** People who state a position in public tend to defend it afterwards; persuasion research calls this commitment and consistency. A one-to-one lets someone change their mind before they have committed in front of peers, and it surfaces the objection while it is cheap to address. Pre-wiring is not vote-gathering: its output is a better proposal and a meeting with no surprises.

**Written culture changes the mechanics.** Amazon's practice of starting meetings with silent reading of a narrative memo, described publicly in its shareholder letters, moves the persuasion into the document: the meeting tests the reasoning instead of the presenter. The fifteen-minute decision meeting above is the same mechanism at small scale. [Design docs and RFCs](/learn/senior-craft/technical-leadership/design-docs-and-rfcs) covers the written artefacts in full.

## Choosing how a decision gets made

| Method | Speed | Information surfaced | Commitment afterwards | Cost to relationships | Use when |
|---|---|---|---|---|---|
| Consensus (everyone agrees) | Slow; can stall indefinitely | High | High if reached | Low, until it stalls | Small groups, reversible choices |
| Consent (no blocking objection) | Medium | High | Medium to high | Low | Standards with a final comment period |
| Single approver after input (DACI) | Fast once framed | High if pre-wired | Medium; needs disagree-and-commit | Low if dissent is recorded | Cross-team decisions with a clear owner |
| Vote | Fast | Low: counts preferences, not reasons | Low for the losing side | Medium | Rarely; tie-breaks between equal options |
| Mandate from above | Fastest | Lowest | Compliance, not commitment | High if routine | Security and legal deadlines |

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Consensus theatre | "We all agreed", yet two teams never start | Nobody decided; the loudest view won by default | Name one approver; record the decision and dissent in writing |
| Drive-by mandate | A standard announced in a channel; adoption flat after a month | No evidence, no cost reduction, no decider | Evidence, pre-wiring, a brief, then a decision with dates |
| Pocket veto | A team "agrees" but its ticket never enters a sprint | Their cost was never addressed; they are opting out silently | Ask what it costs them; do part of the work; put the dates in their plan |
| Endless RFC | A proposal open for comments for months | Closing it requires choosing, and nobody owns choosing | A decide-by date and a final comment period |
| The escalation ambush | A peer learns of your disagreement from their manager | One-sided escalation | Joint write-up, agreed wording, sent together |
| Winning the argument, losing the ally | You were right; the other lead avoids you next time | Being right in public at their expense | Private disagreement, public credit, their strongest case stated in the brief |

## Interviewer follow-ups

**"Tell me about a time you influenced a team you had no authority over."** Model answer: the problem with a number, the other team's cost and what you did to lower it, who decided and how you got a decision, and the result. "I opened the migration PRs myself and made the old format valid until after their launch; they migrated in week eight." Common wrong answer: "I explained why it was the right thing and they agreed", which describes no mechanism, or "my manager told them", which is borrowed authority.

**"Tell me about a time you disagreed with a decision that went ahead anyway."** Model answer: how you argued (evidence, before the decision), the decision, what you did to commit (actions and dates), what happened, and what trigger you set for revisiting. Common wrong answer: a story that ends "and I turned out to be right", which tells the interviewer you kept score instead of committing.

**"A peer team keeps missing the dates your project depends on. What do you do?"** Model answer: find their constraint (capacity, priorities, a planning cycle), reduce the cost of your ask, make the dependency and its dates visible to both managers, and if it still slips, escalate jointly with the impact of waiting. Common wrong answer: going to their manager first, or quietly building the thing in their codebase.

**"How do you know a decision has actually been made?"** Model answer: a named approver said yes in writing, it is recorded with its rationale and dissent, it is announced, and the teams that must act have it in their plans with dates. Common wrong answer: "everyone agreed in the meeting".

## What mid-level engineers get wrong

- **Persuading before mapping.** They pitch the most enthusiastic person first and meet the real blocker in the meeting.
- **Defending the idea before asking the cost.** The sceptic hears "you are wrong" and stops listening.
- **Treating every disagreement as a debate.** A fact gets argued for twenty minutes when a lookup would settle it.
- **Leaving the decider implicit.** Three meetings end in "good discussion" and no decision.
- **Confusing commit with silence.** They stop objecting and slow-walk the work, which the other team notices.
- **Escalating alone.** The peer relationship never recovers, and the next cross-team ask starts in deficit.

## Exercise: lint a decision brief

```exercise
id: decision-brief-lint
title: Find what a decision brief is missing
prompt: |
  Return the list of problems in a decision brief, as issue codes, in the
  order the checks are listed below. `brief` is an object with keys:
  `approvers` (list of names), `decide_by` (a date string, possibly empty),
  `options` (list of option names), `recommendation` (string, possibly
  empty), `flip_condition` (string, possibly empty), `contributors` (list of
  names) and `consulted` (list of names).

  Checks, in order:
  1. `"approver"` unless there is exactly one approver.
  2. `"deadline"` if `decide_by` is empty.
  3. `"do-nothing"` if no option equals "do nothing" (ignore case and
     surrounding spaces).
  4. `"alternatives"` if there are fewer than two options other than
     "do nothing".
  5. `"recommendation"` if the recommendation is empty or does not match an
     option name (ignore case and surrounding spaces).
  6. `"flip-condition"` if `flip_condition` is empty or only spaces.
  7. `"unconsulted:<name>"` for each contributor not in `consulted`, in
     contributor order.

  Return an empty list for a complete brief.
languages: [python, javascript]
entry: lint_brief
starter:
  python: |
    def lint_brief(brief):
        # your code here
        return []
  javascript: |
    function lint_brief(brief) {
      // your code here
      return [];
    }
tests:
  - args: [{"approvers": ["Priya"], "decide_by": "2026-10-09", "options": ["RFC 9457 + code", "RFC 9457 only", "Do nothing"], "recommendation": "rfc 9457 + code", "flip_condition": "clients branch on both fields", "contributors": ["Marco", "Aisha", "Kenji", "Dana"], "consulted": ["Dana", "Marco", "Aisha", "Kenji"]}]
    expected: []
    label: the lesson's brief is complete
  - args: [{"approvers": ["Priya", "Sam"], "decide_by": "", "options": ["Kafka", "SQS"], "recommendation": "Kafka", "flip_condition": "", "contributors": ["Ana"], "consulted": []}]
    expected: ["approver", "deadline", "do-nothing", "flip-condition", "unconsulted:Ana"]
    label: two approvers, no date, no do-nothing, no flip condition
  - args: [{"approvers": ["Lee"], "decide_by": "2026-11-01", "options": ["  Do Nothing ", "Rewrite"], "recommendation": "Rewrite", "flip_condition": "p99 above 300 ms", "contributors": [], "consulted": []}]
    expected: ["alternatives"]
    label: one real option is not a choice
  - args: [{"approvers": [], "decide_by": "2026-11-01", "options": ["A", "B", "do nothing"], "recommendation": "C", "flip_condition": "   ", "contributors": ["Bo", "Cy"], "consulted": ["Cy"]}]
    expected: ["approver", "recommendation", "flip-condition", "unconsulted:Bo"]
    label: recommending something that is not an option
  - args: [{"approvers": ["Priya"], "decide_by": "2026-10-09", "options": ["A", "B", "Do nothing"], "recommendation": "", "flip_condition": "x", "contributors": ["Zed", "Amy", "Kim"], "consulted": ["Kim"]}]
    expected: ["recommendation", "unconsulted:Zed", "unconsulted:Amy"]
    hidden: true
    label: contributor order is preserved
  - args: [{"approvers": ["Priya"], "decide_by": "2026-10-09", "options": [], "recommendation": "do nothing", "flip_condition": "x", "contributors": [], "consulted": ["Extra"]}]
    expected: ["do-nothing", "alternatives", "recommendation"]
    hidden: true
    label: no options at all
hints:
  - "Normalise option names once: strip spaces and lower-case them, then compare."
  - "Count the options that are not do nothing for the alternatives check."
  - "Consulted people who are not contributors do not matter; only walk the contributors list."
```

## Senior signals

- You map stakeholders by power and by what would make each a yes, and you order conversations from that map.
- You name the decision, the single approver and the deadline, and write a one-page brief with a recommendation and what would change it.
- You pre-wire, so nobody is surprised in the meeting where a decision is taken.
- You lower the cost of yes: do part of the work, make the new path additive, time the ask to the other team's planning cycle.
- You separate facts, predictions and values, settle each the right way, and send only values questions to the decider.
- You disagree and commit in actions with dates, record dissent with a revisit trigger, and escalate jointly when you must.

## Check yourself

```quiz
- q: >-
    Three teams agree your migration matters but none has scheduled it. What is the most effective next step?
  options: ["Wait for an incident to prove the risk and create the urgency", "Lower their cost: a codemod, your PRs, and dates in their plans", "Ask a director to mandate it so it lands on every team's roadmap", "Send a firmer email to the leads with a deadline and the risks"]
  answer: 1
  explanation: >-
    Agreement without scheduling is a cost problem, not a persuasion problem. Lowering the cost of yes and getting the work into their planning produces commitment; a mandate buys compliance and spends goodwill, and waiting for an incident accepts the risk you are trying to remove.
- q: >-
    Why was the director the sixth conversation rather than the first?
  options: ["She was the least important stakeholder, so she came last in the map", "Talking to her first would count as escalating over the tech leads", "Directors should only be told about decisions after they have been made", "Asked first, she would defer until all of the teams' costs were known"]
  answer: 3
  explanation: >-
    An approver asked to decide before the contributors have been heard will usually say come back when the teams agree. Pre-wiring the sceptics and the rival proposal first means the brief arrives with costs, conditions and a single open question, so the decision takes fifteen minutes. The approver still decides; she is not merely informed.
- q: >-
    Two leads argue about whether RFC 9457 allows extra members in the body. How should that part of the disagreement be settled?
  options: ["Send it to the approver, since it is a values question", "Read the RFC, since a published source settles it", "Prototype both and load test them against each other", "Hold a vote among the five affected tech leads"]
  answer: 1
  explanation: >-
    Whether a published standard permits something is a fact, and facts are settled by looking them up. Predictions need evidence such as a prototype, and only values and priorities go to the decider. Sending a fact to the approver or putting it to a vote wastes the time of people who could have read the answer.
- q: >-
    After the decision, which behaviour shows that the dissenting lead has committed?
  options: ["His team's migration ticket is in a sprint, dated", "He implements the format his own way to stay compliant", "He agrees the decision was correct after all", "He stops raising the topic in design meetings"]
  answer: 0
  explanation: >-
    Commitment is visible in actions: scheduled work, a first migration, defending the decision in hallways. Silence can hide a pocket veto, changing his opinion is not required, and implementing a variant is the fake commitment the lesson tabulates.
- q: >-
    Twelve weeks later the same lead proposes revisiting the decision. When is that legitimate?
  options: ["When the revisit trigger in the decision log has fired", "When he is willing to argue it again at planning", "When enough time has passed that the context may differ", "When a new engineer joins who shares his preference"]
  answer: 0
  explanation: >-
    Reopening a decision is legitimate with new evidence, and the recorded trigger defines what counts: here, clients branching on both fields, or a new constraint such as a gateway that only routes on one of them. Time passing, new allies or persistence are not evidence.
- q: >-
    You want a cross-team standard adopted. Which person is usually the real approver?
  options: ["The lowest manager above every team that must spend capacity", "The tech lead of the team that benefits most from the change", "Whoever the driver chooses, provided that the choice is announced", "The most senior engineer who has an opinion on the standard"]
  answer: 0
  explanation: >-
    Only someone who can trade one team's roadmap against another's can make a decision that costs several teams capacity; anyone below that level can be overridden by a team's priorities. Seniority or benefit does not confer that right, and a driver cannot appoint an approver the affected teams do not report to.
```

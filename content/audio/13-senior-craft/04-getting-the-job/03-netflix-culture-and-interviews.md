---
lesson: netflix-culture-and-interviews
source: 330b2d346fedfd87
fit: great
desk:
  - "The table of what changed between the 2009 deck and the current memo"
  - "The recommendations-cache story tested against the memo row by row, and the full revised telling"
  - "The API deprecation told two ways, with the comparison table"
  - "The map from published ideas to the questions they produce and the stories you need"
  - "The Netflix model against a typical large company, axis by axis"
---
## Introduction

Most companies say they value ownership, candour and high performance. Netflix wrote down, in public and in unusual detail, what it means by those words and what it does about them, including the uncomfortable parts. Managers ask whether they would fight to keep each person, and part ways quickly when the answer is no. The company models itself on a professional sports team rather than a family. And it aims to pay each person at the top of their personal market.

For a candidate, that is a gift. The lens your interviewers are likely to use is published. You can read it, test your own stories against it line by line, and decide before the loop whether it is a place you want to work.

Everything here comes from what Netflix has published, the book its co-founder co-wrote, and the loop shape candidates commonly report. There is no inside knowledge, and where it describes how the culture shapes hiring, that is inference from public material. Your recruiter is the authority on the process you will actually go through.

Three parts: the ideas themselves, how they plausibly shape the loop, and what happens when you test a real story against them.

## The sources

Three sources are worth your time, in this order. First, the culture memo on Netflix's jobs site. It is the current, official statement and is revised periodically. At the time of writing it is built on four core principles: the dream team, people over process, uncomfortably exciting, and great and always better. It lists eight valued behaviours: selflessness, judgement, candour, creativity, courage, inclusion, curiosity and resilience.

Second, the 2009 culture deck, "Freedom and Responsibility", published by Reed Hastings and widely credited to him and Patty McCord. It explains the reasoning behind many ideas that survive in the memo. Third, the book No Rules Rules, from 2020, by Hastings and Erin Meyer, which shows how the practices work day to day, including where they went wrong.

Read the current memo twice before your loop. The memo has changed since the deck: inclusion and resilience joined the valued behaviours, informed captains and farming for dissent were added, and the keeper test now comes with lines about judging the whole record and avoiding surprises. Quoting the 2009 deck as current policy is a small but telling sign that you prepared from summaries.

## People and pay

The foundation is the claim that the best thing a company can do for its employees is surround them with exceptional colleagues. No Rules Rules frames the rest as a sequence: build talent density first, then increase candour, then remove controls. If everyone is highly capable, you can remove rules. If you remove rules, you need everyone to be highly capable.

The keeper test is the best-known idea, and the one to think about most carefully. Managers ask of each person: if they wanted to leave, would I fight to keep them? Or: knowing everything I know today, would I hire them again? If the answer is no, the memo says it is fairer to everyone to part ways quickly, and the deck and the book describe a generous severance.

Two details in the current memo matter for interviews. Managers are asked to judge the whole record rather than the bets that did not pay off, so an owned failure is not disqualifying. And employees are encouraged to talk with their managers regularly, so nobody is surprised.

On pay, the memo says Netflix pays at the top of each person's market for the role and location: roughly, what the best competing offer for that person would be. The book describes a preference for high salaries over performance bonuses, and employees choosing how much of their pay to take as stock options. Programme details change, so confirm the current structure with your recruiter.

## Decisions and feedback

Freedom with responsibility replaces rules and approvals. Expenses come down to acting in Netflix's best interests. The bet is that rules protect a company from its worst employees at the cost of slowing its best, and that with high talent density the trade is not worth it.

Context, not control: managers give their teams strategy, metrics, assumptions and stakes, rather than controlling through approvals. When someone makes a poor decision, the first question is what context the manager failed to give. Teams are highly aligned on goals and loosely coupled on tactics.

For each significant decision, one person, the informed captain, gathers input, actively seeks out disagreement, which the memo calls farming for dissent, makes the call and owns the result. Afterwards, everyone, including those who argued for something else, disagrees then commits.

Candour runs in every direction, including upwards. The book summarises its feedback guidelines as the four As. When giving feedback, aim to assist and make it actionable. When receiving it, appreciate it, then accept or discard it. The book also describes leaders "sunshining" their mistakes, discussing them openly so others learn and feel safe doing the same.

## How the culture plausibly shapes the loop

Again, this is inference from public material, checked against what candidates report. Hiring is team-specific and manager-led: you apply to a role on a particular team, and candidates report the hiring manager involved early and throughout. That fits the informed-captain model and the memo's pride in how few decisions senior leaders make. The consequence is more variation between teams than a committee produces, so this team's process, from the recruiter, beats any general account.

The bar is the keeper test, applied in advance. A manager who will later ask "would I fight to keep this person?" has every reason to ask a version of it before hiring. Expect the loop to look for people who need context rather than direction.

Culture conversations carry real weight. Candidates commonly report them as a substantial share of the final rounds, sometimes with people from outside engineering. The technical rounds usually include practical coding, building and extending a working component rather than a puzzle, plus system design and sometimes a deep dive into something you built.

On levels: for many years Netflix was widely reported to hire mostly experienced engineers under one senior title. Public reporting describes levels added in 2022, and current postings carry the level in the title, so read the posting for the level you are being considered for.

## One story against the memo

Here is an illustrative story as most engineers first write it. The recommendations API was timing out at peak, the 99th percentile around 800 milliseconds. "I proposed a caching layer, wrote a design doc, got approval from my manager and then the architecture review board, and implemented it over two months with one other engineer. The 99th percentile dropped to about 200 milliseconds. Everyone was really happy, and my manager mentioned it in my review."

Nothing is wrong with that at a company that runs on approvals. Test it against the memo, one idea at a time. Before I tell you: how many of the memo's ideas does that story give evidence for?

[pause]

Almost none. Context, not control: the decision seems to belong to the approvers. Farming for dissent: nobody was consulted who might say no. Judgement: one option, no cost. Candour: "everyone was really happy". The whole record: there is no mistake, and a flawless story reads as edited. Responsibility: implementation only, no rollout or ownership after launch.

The revised telling uses the same facts, and more of them. There was a 300 millisecond target and a quarterly goal the timeouts were hurting. The candidate owned the fix and weighed three options: tuning, precomputing offline, and caching for 60 seconds, choosing caching because it could ship in weeks and staleness matters little for recommendations. Before committing, they asked the ranking team, the people most likely to object, to find the holes. They found one: stale results after a catalogue update, which changed the design. The doc went to the manager and review group for comment, and then the candidate made the call. In week three they told their manager the estimate was two weeks short. They shipped behind a flag with a canary, and when an invalidation bug served stale rows for an hour, they wrote it up and posted it to the team.

Every idea now has a line to point at, and nothing was invented. The first draft had simply left out the parts that are evidence for this culture.

## Freedom is not going rogue

A second illustrative pair: deprecating an internal API used by four teams. The approval-seeking version asks the manager, who sends it to the director, who approves it, and when one team complains, the director tells them to prioritise it. The context-driven version ties the work to the quarter's goal, with a number: the old API caused about a third of the team's pages. The candidate writes a one-page memo, shares it with the four teams starting with the heaviest user, hears that their year-end reporting falls inside the window, and moves their cut-over by six weeks. The manager is informed, not asked. On switch-off day one consumer breaks; the rollback is ready, restored within twenty minutes, and the candidate fixes the client personally.

The context-driven version is not "I did it without telling anyone". Everyone affected was informed and consulted. What changed is who owned the decision and how disagreement was used. A story like "I shipped it without telling anyone because the review process was slow" reads as freedom without responsibility, and invites probes about who knew and what happened when it broke.

Two other failure modes. Rehearsed positivity, where every story ends happily and you praise everything, the culture included, reads as a lack of candour. And reciting memo phrases, "as an informed captain I farmed for dissent", in place of evidence. Tell your stories in your own words and let the interviewer make the mapping.

## In the interview

Here is a follow-up the lesson expects. What do you think of the keeper test?

[pause]

An honest view with both sides. "I like the clarity; I'd rather know where I stand than find out in a review cycle. The cost is less security. I'd want to know how often people on this team hear where they stand, and how early." Unqualified enthusiasm avoids the question. A condemnation ignores the reasoning behind it.

And another: how would you handle a teammate who isn't performing? Early, specific, private feedback to the person, asking what is in the way. If nothing changes, tell your manager, telling the teammate first, because the keeper decision is the manager's and needs accurate information. Covering for them silently hides the problem, and going to the manager without ever telling the person is the other wrong answer.

Neither culture is better. Netflix, as published, trades job security for autonomy, clarity and constant feedback. Use the loop to find out whether that suits you: ask how the keeper test shows up on this team, and what the team disagreed about recently.

## Recap

Four things to remember. Read the current memo, not a summary of the 2009 deck: four principles, eight behaviours, the whole record, no surprises. Context, not control means you own the decision, inform everyone affected and seek dissent first; freedom always carries its responsibility. Keep real friction and an owned failure in your stories, because a flawless story reads as edited. And the pay conversation centres on your personal market, so competing offers are the evidence.

At your desk: the deck-versus-memo table, the recommendations story tested row by row, the deprecation comparison, the question-to-story map, and the trade-off table.

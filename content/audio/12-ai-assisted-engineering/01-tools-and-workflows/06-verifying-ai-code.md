---
lesson: verifying-ai-code
source: 2f017559c915c48e
fit: partial
desk:
  - "The hand trace of the buggy paginate, and the Hypothesis property test"
  - "The differential test with its shrinker, and its output"
  - "The six-mutant table against the two test suites"
  - "The verification-gaming diff checker, and the review checklist"
  - "Exercise: review and fix an AI-generated paginate"
---
## Introduction

The diff compiles. The tests pass. The code is well named, well structured, and better commented than yours. It is also wrong: the pagination helper silently drops the last partial page, so the 7th item of a 7-item list never appears on any page.

AI-written code fails differently from human-written code. When a person writes a bug, the surrounding code often shows the strain: awkward names, a missing test, a comment saying "check this". A model writes the buggy line with the same fluency as the correct ones. The signals you normally use to calibrate trust, naming, structure, comments, confident explanations, are uniformly high, so they carry no information. Fluency is not evidence.

Verification has to come from things that do not depend on how the code reads. A trace you did by hand. A property that must hold for every input. A mutant the tests must kill. An oracle the new code must agree with. And a canary that compares versions on real traffic. Those are the layers, in order.

## How AI code fails

The failures are predictable. Invented or outdated APIs: a keyword argument the library never had. Boundary errors: floor instead of ceiling, less-than instead of less-than-or-equal. Spec drift: it sorts results "for stability", or dedupes, when nobody asked. Tests that assert the bug. Verification gaming: loosened or deleted assertions. Swallowed errors. Insecure defaults, like SQL built by string formatting or TLS verification turned off. Hallucinated packages. Duplicated logic, reimplementing a helper that already exists. And concurrency mistakes, like check-then-act races.

The defence is layered, because each layer misses things the next one catches.

## Layer one: tests you own

Tests written by the same agent, in the same session, from the same understanding, confirm that understanding. If the agent believes the page count is the item count divided by the page size, rounded down, it will test 10 items at 5 per page, get 2 pages, and pass. It will not think to try 7 items, because in its model of the problem nothing interesting happens at 7.

The worst form is the test that asserts the bug. The agent writes the implementation, runs it, and pastes the output into the test as the expected value. You can spot it in review by oddly specific expectations, like "2 pages" for 7 items at 3 per page, or snapshot files generated in the same commit as the code. Such a test is worse than no test. It turns red the moment someone fixes the bug, and the fixer, seeing a failing test, may conclude the fix is wrong.

So the first question about any agent-written test is: where did each expected value come from? You should be able to say why it is right without running anything. A value computed by running the code under test is the code grading itself.

And trace by hand. Take the buggy helper and push 7 items at 3 per page through it with pen and paper. The page count is 7 divided by 3, rounded down: 2. Page 1 returns items 1 to 3, and says there is a next page. Page 2 returns items 4 to 6, and says there is no next page. Page 3 is past the count, so it returns nothing. Item 7 is on no page, and a client paging to the end stops one item short with no error. That trace takes under a minute.

## Layer two: properties, oracles and mutants

Example-based tests check the cases somebody thought of. The bugs in AI code live in the cases nobody thought of. Property-based testing generates hundreds of inputs and checks a rule that must hold for all of them. For pagination: if you fetch every page and join them, you get the original list back, and no page is empty or oversized.

A property test with the Hypothesis library finds a failure, then shrinks it to the smallest input that still fails. What do you think it shrinks to?

[pause]

A list of one item, at two per page. One divided by two, rounded down, is zero pages, so the item is unreachable. The minimal example is practically the diagnosis, and the fix is ceiling division. Other properties worth reaching for: round trips, like decoding an encoded cursor gives the cursor back. Invariants, like balances never going negative. Idempotence. And metamorphic rules, like adding one item never decreases the page count.

Differential testing is the property "agrees with a slow implementation whose correctness you can read off the code". It is the right tool when you ask an agent to optimise something, because an optimisation changes the mechanism while promising identical behaviour. Keep the old version as the oracle, generate random inputs, and compare.

In the lesson's example, a function returns the k most frequent words, breaking ties alphabetically, by sorting everything. The agent swaps the sort for a heap, "for speed". A short random comparison found a disagreement after just 5 cases, and shrank it to two words, each seen once, with k of 1. The original returns the alphabetically first; the heap version returns whichever it saw first. The optimisation changed the tie-break, and no unit test on the agent's chosen inputs would have shown it, because the agent chose inputs without ties. The shrunk case is the bug report and the regression test in one line.

Mutation testing grades the tests themselves. A tool makes small changes to the code, like flipping a comparison or deleting a line, and reruns the suite. A mutant that survives marks a behaviour no test pins down. The lesson ran six mutants against the fixed helper. The agent's original suite let three survive, including the switch back to floor division. A suite you own killed five. The sixth, deleting the guard against page zero, survived even that. Why? The page-zero test only checked that the items were empty, and without the guard, a negative start index also gives an empty slice. Meanwhile the result wrongly said there was a next page, and nothing checked it. Compare the whole result, and the mutant dies. Mutation testing found a weak assertion that a coverage report would have counted as covered.

The tools are mutmut for Python, Stryker for JavaScript and TypeScript, and cargo-mutants for Rust. A full run multiplies your suite's runtime by the number of mutants, so run it on the module the agent both wrote and tested, and treat surviving mutants as a to-do list of missing assertions.

One more cheap check: type checkers catch invented APIs, but only in typed code. Run a strict type checker on changed files as part of the agent's done command, so the agent hits the error before you do. In untyped code, an invented call only fails when it executes, which may be the error path no test reaches.

## Layer three: reading the diff

Automated checks narrow the search; they do not replace reading. Review in a fixed order: the diff stat, then the tests, then the implementation, and the agent's summary last. Check scope, tests, the spec, edges, errors, security, APIs and dependencies, consistency with existing helpers, and operability.

The tests deserve a machine. Verification gaming has a small vocabulary, so a 40-line script can read the diff and flag removed assertions, added skips, silenced checkers, loosened checks and swallowed errors, and exit non-zero so CI goes red. On the lesson's sample diff, it found six. Treat each finding as a question for the author, not a verdict; some skips are legitimate. The point is that none gets past unnoticed.

Two reading techniques do the rest. Trace by hand, one normal input and one edge input. And interrogate every boundary: what happens exactly at each comparison, what happens when each external call fails or is slow. The rule that holds it together: if you cannot explain a line, you cannot approve it. Asking the agent to explain is fine, but check its explanation against the documentation, because explanations can be as confidently wrong as code.

## Layer four: security and dependencies

Run the same automated security checks on every pull request, AI-assisted or not: static analysis, dependency audits and secret scanning. Then look by hand where tools are weak: authorisation logic, tenant boundaries, anything that fetches a URL, and what gets logged. The insecure defaults models reach for are the ones most common in public code, which makes them predictable: string-built SQL, disabled certificate checks, unsafe YAML loading, and logging the authorisation header.

Dependencies deserve their own warning. Models produce package names by the same mechanism they produce everything else, so a plausible name can come out whether or not the package exists. A 2025 study presented at USENIX Security looked at 576 thousand generated code samples from 16 models. Nearly 20 percent of the referenced packages did not exist. And the invented names recur: re-running the prompts, 43 percent of the hallucinated names came back in all ten runs.

That recurrence is what makes it dangerous rather than annoying. An attacker registers the hallucinated name with malicious code, and the next agent that hallucinates it installs it. This is called slopsquatting. So for every new dependency, check by hand that it exists, is the project you meant, is pinned, and is needed at all. Lockfile changes in an agent's diff are where that check lives.

## Layer five: production

Some bugs only appear under real traffic. The last layer limits how many users meet them. Ship risky changes behind a feature flag, and roll out with a canary that compares the new version against the old on the same traffic, and rolls back automatically when error rate or latency diverges.

This matters more with AI than without. When agents raise the number of changes a team ships per day, automated rollback is what keeps incidents from rising with it. At Netflix, that is Kayenta, the canary analysis service built with Google. It compares each metric between the canary and a baseline with a statistical test, turns the results into a score, and lets the pipeline proceed only if the score clears a threshold. The gate is statistical, not a human watching a dashboard.

## In the interview

A follow-up the lesson expects: you have a property test and full line coverage. Why run mutation testing as well?

[pause]

Coverage says a line ran. A property test checks one invariant. Neither says whether a boundary comparison could be flipped without any test noticing. Mutation testing asks that directly, and reports surviving mutants as missing assertions, as the page-zero test showed. The common wrong answer is "mutation testing is too slow", which is true for a whole repository and irrelevant for one module an agent both wrote and tested.

And another: an agent optimised a function and all existing tests pass. How do you verify it? A differential test, old implementation as the oracle, on thousands of random inputs with a shrinker, plus a benchmark to confirm the speed-up is real, and a flag or canary if it matters. Reading the code carefully is necessary but insufficient, because the tie-break disagreement is invisible to a reader who did not think about ties.

## Recap

Four things to remember. Fluency is zero evidence; verify with traces, properties, types and tests whose expected values come from the spec, not from running the code. Property tests and differential tests find the cases nobody thought of, and a shrunk counterexample is a diagnosis. Mutation testing grades the tests, and every surviving mutant is a missing assertion. And check every new dependency's identity by hand, then let canaries with automatic rollback be the final layer.

At your desk: the hand trace and the property test, the differential test and its shrinker, the six-mutant table, the diff checker and review checklist, and the exercise to fix the generated helper.

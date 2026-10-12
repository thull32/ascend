---
lesson: verifying-ai-code
source: b4570b0e4ded1782
---
## 1

An agent wrote a function and its tests in the same session, and all the tests pass. Why is that weak evidence of correctness?

A, agents write too few tests, so the coverage is too low to mean anything. B, the tests share the code's understanding, so a misreading of the spec passes both. C, passing tests are never evidence of correctness for generated code. D, agents write tests that are syntactically valid, but never actually executed.

[think]

The answer is B: the tests share the code's understanding, so a misreading of the spec passes both.

Code and tests from one mind share its blind spots, and the expected values may even come from running the code, in which case the tests assert the bug. Tests are strong evidence when their expected values come from the spec, ideally written or reviewed before the implementation. More tests from the same understanding do not help. Passing tests are evidence, but tests derived from the code are weak evidence.

## 2

A property test on a paginate function shrinks to the counterexample of a single item, the number zero, with two items per page. What does this most directly suggest?

A, pages are returned in the wrong order when the page size exceeds the length. B, the page size must be at least 3, since smaller pages are not supported. C, the page count rounds down, so a partial final page is dropped. D, Hypothesis is generating invalid inputs that the function should reject.

[think]

The answer is C: the page count rounds down, so a partial final page is dropped.

One item at two per page should give one page. Floor division gives zero, which makes the item unreachable. Shrinking removes everything irrelevant, so the minimal case points straight at the boundary.

## 3

Mutation testing reports that deleting the guard against pages below 1 does not fail any test, although there is a test for page zero. What is the most likely explanation?

A, the page zero test checks only that the items are empty, which holds without the guard. B, the guard is dead code, because page zero can never reach the function. C, the test runner caches results, so the mutant was never actually executed. D, the mutation tool cannot mutate guard clauses reliably, so the report is noise.

[think]

The answer is A: the page zero test checks only that the items are empty, which holds without the guard.

With the guard removed, page zero gives a negative start index and an empty slice, so an assertion on the items alone still passes, while the has-next flag is wrongly true. The surviving mutant exposes a weak assertion, and comparing the whole result kills it. Mutation tools mutate guards fine, the code is reachable, and a survivor means no test told the mutant apart.

## 4

You asked an agent to make a slow function faster. What is the most effective verification strategy?

A, rely on the existing unit tests, since they already define the behaviour. B, read the new code carefully, line by line, against the old version. C, compare old and new on thousands of random inputs, plus a benchmark. D, ask the agent to confirm and document that the behaviour is unchanged.

[think]

The answer is C: compare old and new on thousands of random inputs, plus a benchmark.

Optimisations change the mechanism while promising identical behaviour, which is exactly what a differential test checks. Keep the old implementation as an oracle, compare both on random inputs, shrink any disagreement, and add a benchmark to confirm the speed-up. Existing unit tests cover only the cases someone thought of, and an agent's confirmation is not evidence.

## 5

An AI-generated change adds a dependency you have never heard of. Which check matters most before approving?

A, that the agent confirms it is widely used and actively maintained. B, that it exists, is the project you intended, is pinned, and is needed. C, that it has a permissive licence compatible with your product's licence. D, that it has more than 100 GitHub stars, and a commit in the last year.

[think]

The answer is B: that it exists, is the project you intended, is pinned, and is needed.

Models sometimes name packages that do not exist, the same names recur, and attackers register them so agents install them; that is slopsquatting. A typo of a real name is the same risk. Verifying identity, pinning, and necessity closes that path. Licence matters too, but a malicious package is the larger immediate risk, stars can be faked, and the agent's word is not verification.

## 6

A CI job pipes the pull request diff through a script that flags removed assert lines and added skip markers, and exits with an error. What is the right way to treat its findings?

A, as proof the change is safe, whenever the script reports zero findings. B, as advisory output to ignore when the test suite is green. C, as questions the author must answer before merge, since some skips are legitimate. D, as automatic rejections, since any removed assertion is verification gaming.

[think]

The answer is C: as questions the author must answer before merge, since some skips are legitimate.

The script guarantees that removed assertions and added skips cannot pass unnoticed, which is its whole value. It cannot judge intent, so a finding is a question for a human. Ignoring it when CI is green defeats the purpose, because gaming is what makes CI green, and zero findings only means none of the known patterns appeared.

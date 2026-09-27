---
slug: verifying-ai-code
title: "Verifying AI-written code: tests, properties and a review checklist"
description: How AI-generated code fails differently from human code, and the layered defence against it - tests you own, property-based and differential tests, mutation testing, a diff review checklist, security scanning and canary releases.
minutes: 35
difficulty: medium
tags: [ai-tools, testing, property-based-testing, code-review, security, verification]
---
The diff compiles. The tests pass. The code is well named, well structured and better commented than yours. It is also wrong: the pagination helper silently drops the last partial page, so the 7th item of a 7-item list never appears on any page.

AI-written code fails differently from human-written code. When a person writes a bug, the surrounding code often shows the strain: awkward names, a missing test, a comment saying "TODO: check this". A model writes the buggy line with the same fluency as the correct ones. The surface signals you normally use to calibrate trust (naming, structure, comments, confident explanations) are uniformly high, so they carry no information. Fluency is not evidence. Verification has to come from things that do not depend on how the code reads.

## How AI code fails

| Failure | Typical example | What catches it |
|---|---|---|
| Invented or outdated API | A keyword argument the library never had; a function deprecated two versions ago | Type checker, running the code, the library's docs for your pinned version |
| Boundary error | Floor instead of ceiling, `<=` instead of `<`, inclusive vs exclusive range | Edge-case tests, property tests |
| Spec drift | Sorts results "for stability", trims input, dedupes, when nobody asked | Tests written from the spec; reviewing against the spec |
| Verification gaming | Loosened or deleted assertions, skipped tests | Reviewing the test diff first |
| Swallowed errors | `except Exception: return None` around the call that matters | Review; lint rules against blind excepts |
| Insecure default | SQL built with f-strings, TLS verification disabled, `yaml.load` on untrusted input | Static analysis, security review |
| Hallucinated package | A plausible-sounding dependency that does not exist, or worse, one an attacker registered under that name ("slopsquatting") | Checking every new dependency by hand |
| Duplicated logic | Reimplements a helper that already exists in the repo | Review by someone who knows the codebase |
| Concurrency and state | Check-then-act races, shared mutable defaults | Reasoning by hand, stress tests |

The defence is layered, because each layer misses things the next one catches.

## Layer 1: tests you own

Tests written by the same agent, in the same session, from the same understanding, confirm that understanding. If the agent believes `total_pages` is `len(items) // per_page`, it will write a test asserting that 10 items at 5 per page make 2 pages, which passes, and it will not think to try 7 items, because in its model of the problem nothing interesting happens at 7.

So the tests must come from the spec, not from the code:

- **Write or approve the tests before the implementation** (test-first prompting, from [the agentic workflow](/learn/ai-assisted-engineering/tools-and-workflows/agentic-coding-workflow)).
- **Check where each expected value came from.** An expected value that was computed by running the code under test is the code grading itself. Snapshot tests generated after the fact have the same problem.
- **Walk the edge-case taxonomy** from [Testing your own code](/learn/foundations/problem-solving/testing-your-own-code): empty, one element, exact multiple, one past a multiple, maximum size, zero and negative inputs, duplicates, Unicode, time zones and DST transitions.

## Layer 2: properties, oracles and mutants

Example-based tests check the cases somebody thought of. The bugs in AI code live in the cases nobody thought of. Property-based testing generates hundreds of inputs and checks a rule that must hold for all of them.

Here is the generated helper with one bug, the one from the opening:

```python
def paginate(items, page, per_page):
    total_pages = len(items) // per_page          # bug: should round up
    if page < 1 or page > total_pages:
        return {"items": [], "page": page, "total_pages": total_pages, "has_next": False}
    start = (page - 1) * per_page
    return {
        "items": items[start:start + per_page],
        "page": page,
        "total_pages": total_pages,
        "has_next": page < total_pages,
    }
```

The agent's tests used 10 items at 5 per page and 20 items at 10 per page. Both pass. Now state what must be true for *every* input: if you fetch every page and concatenate them, you get the original list back, and no page is empty or oversized.

```python
from hypothesis import given, strategies as st

@given(st.lists(st.integers()), st.integers(min_value=1, max_value=20))
def test_pages_reassemble_the_input(items, per_page):
    total = paginate(items, 1, per_page)["total_pages"]
    pages = [paginate(items, p, per_page)["items"] for p in range(1, total + 1)]
    assert [x for page in pages for x in page] == items
    assert all(1 <= len(page) <= per_page for page in pages)
```

Hypothesis finds a counterexample and then *shrinks* it to the smallest input that still fails:

```text
Falsifying example: test_pages_reassemble_the_input(items=[0], per_page=2)
```

One item, two per page: `1 // 2 = 0` pages, so the item is unreachable. The minimal example is practically the diagnosis. The fix is ceiling division, `(len(items) + per_page - 1) // per_page`.

Properties worth reaching for:

| Kind | Example |
|---|---|
| Round trip | `decode_cursor(encode_cursor(c)) == c` |
| Conservation | Pages reassemble the input; a merge keeps every element |
| Invariant | Output is sorted; no page exceeds `per_page`; balances never go negative |
| Idempotence | `normalise(normalise(x)) == normalise(x)` |
| Metamorphic | Adding one item never decreases `total_pages` |

**Differential testing** is the property "agrees with a slow, obviously correct oracle". It is the right tool when you ask an agent to *optimise* something: keep the old implementation as the oracle and compare on thousands of random inputs. Any disagreement is a bug in one of them, and you will want to know which before production does.

**Mutation testing** evaluates the tests themselves. A tool such as mutmut (Python), Stryker (JavaScript and TypeScript) or cargo-mutants (Rust) makes small changes to the code (flip `<` to `<=`, `//` to `/`, delete a line) and reruns the suite. A mutant that survives marks a behaviour no test pins down. It is expensive to run on everything and very effective on a module an agent both wrote and tested.

## Layer 3: reading the diff

Automated checks narrow the search; they do not replace reading. Review in the order from the workflow lesson (diff stat, tests, implementation, summary last) and work through this checklist:

- [ ] **Scope**: every changed file is explained by the task; no drive-by refactors or reformatting.
- [ ] **Tests**: none deleted, skipped or loosened; new tests fail without the change; expected values come from the spec.
- [ ] **Spec**: each acceptance criterion maps to code and to a test.
- [ ] **Edges**: empty, one, boundary, maximum, duplicates, time zones, retries.
- [ ] **Errors**: no swallowed exceptions; failures are visible to callers, logs and metrics.
- [ ] **Security**: input validated; queries parameterised; authorisation checked on every new path; no secrets or PII in logs.
- [ ] **APIs and dependencies**: every called function exists in the version you pin; every new package is real, intended and necessary.
- [ ] **Consistency**: existing helpers reused; conventions from the memory file followed.
- [ ] **Operability**: migrations reversible; new behaviour behind a flag if risky; logs and metrics for the new path.

Two reading techniques do most of the work. First, **trace by hand**: push one normal input and one edge input through the code, line by line, and write down the values. It takes three minutes and it is how you would have found `1 // 2 = 0`. Second, **interrogate every boundary**: for each comparison, ask what happens exactly at the boundary; for each external call, ask what happens when it fails or is slow; for each unfamiliar name, jump to its definition or its documentation.

The rule that holds it together: **if you cannot explain a line, you cannot approve it.** Asking the agent to explain is fine, but check the explanation against the documentation, because explanations can be as confidently wrong as code.

## Layer 4: security review

Run the same automated security checks on every pull request, AI-assisted or not: static analysis (Semgrep, CodeQL, Bandit for Python), dependency audits (`pip-audit`, `npm audit`, `cargo audit`) and secret scanning. Then look by hand where tools are weak: authorisation logic, multi-tenant boundaries, server-side request forgery in anything that fetches a URL, and what gets logged.

The insecure defaults models reach for are the ones most common in public code, which makes them predictable:

```python
# Generated
cur.execute(f"SELECT * FROM orders WHERE id = {oid}")
requests.get(url, verify=False)
config = yaml.load(body)
log.info("auth header=%s", request.headers["Authorization"])

# Fixed
cur.execute("SELECT * FROM orders WHERE id = %s", (oid,))   # parameterised
requests.get(url, timeout=5)                                  # TLS verification stays on
config = yaml.safe_load(body)                                 # no arbitrary object construction
log.info("auth scheme=%s", scheme)                            # never log credentials
```

For new dependencies, check by hand that the package exists, is the project you meant (maintainers, age, repository link), is pinned in the lockfile, and is needed at all. Models occasionally suggest package names that do not exist, and attackers register plausible hallucinated names precisely because agents install them.

## Layer 5: production is the last test

Some bugs only appear under real traffic: the data shape nobody had in a fixture, the load pattern, the downstream dependency's odd behaviour. The last layer limits how many users meet them. Ship risky changes behind a feature flag, and roll out with a canary that compares the new version against the old on the same traffic and rolls back automatically when error rate or latency diverges.

```viz
{"type": "system", "scenario": "canary", "requests": 20, "title": "The final verification layer", "caption": "A change that passed every test still fails at 50% traffic, on a path the fixtures never exercised. The canary compares versions on the same window and rolls back automatically, so the bug reaches a fraction of users for one analysis window."}
```

This matters more with AI than without. When agents raise the number of changes a team ships per day, automated rollback is what keeps the number of incidents from rising with it. More on deployment strategies in [CI/CD and deployment](/learn/senior-craft/software-craft/ci-cd-and-deployment).

## Exercise

```exercise
id: fix-ai-paginate
title: Review and fix an AI-generated paginate
prompt: |
  An assistant generated `paginate` for an internal admin API. It reads well
  and it is wrong in several places. Fix it so it meets this spec exactly.

  - `page` is 1-based. `per_page` is always at least 1.
  - `total_pages` is 0 for an empty list, otherwise the number of pages
    needed to show every item (round up).
  - For a page from 1 to `total_pages`, `items` is that page's slice of the
    input **in the input's original order**, and `has_next` is true only if
    a later page exists.
  - For any other page (0, negative, or past the end), `items` is empty and
    `has_next` is false.
  - `page` in the result echoes the requested page. Do not modify the input.

  Return an object with exactly the keys `items`, `page`, `total_pages` and
  `has_next`. Before you change anything, list every bug you can find by
  reading; then check your list against the tests.
languages: [python, javascript]
entry: paginate
starter:
  python: |
    def paginate(items, page, per_page):
        # Generated by an AI assistant. Review before merging.
        total_pages = len(items) // per_page
        if page > total_pages:
            return {"items": [], "page": page, "total_pages": total_pages, "has_next": False}
        items.sort()  # keep pages stable between requests
        start = page * per_page
        end = start + per_page
        return {
            "items": items[start:end],
            "page": page,
            "total_pages": total_pages,
            "has_next": page <= total_pages,
        }
  javascript: |
    function paginate(items, page, per_page) {
      // Generated by an AI assistant. Review before merging.
      const total_pages = Math.floor(items.length / per_page);
      if (page > total_pages) {
        return { items: [], page: page, total_pages: total_pages, has_next: false };
      }
      items.sort(); // keep pages stable between requests
      const start = page * per_page;
      const end = start + per_page;
      return {
        items: items.slice(start, end),
        page: page,
        total_pages: total_pages,
        has_next: page <= total_pages,
      };
    }
tests:
  - args: [[1, 2, 3, 4, 5], 1, 2]
    expected: {"items": [1, 2], "page": 1, "total_pages": 3, "has_next": true}
    label: first page
  - args: [[1, 2, 3, 4, 5], 3, 2]
    expected: {"items": [5], "page": 3, "total_pages": 3, "has_next": false}
    label: partial last page
  - args: [[], 1, 10]
    expected: {"items": [], "page": 1, "total_pages": 0, "has_next": false}
    label: empty input
  - args: [[30, 10, 20], 1, 3]
    expected: {"items": [30, 10, 20], "page": 1, "total_pages": 1, "has_next": false}
    label: keeps the original order
  - args: [[9, 8, 7, 6, 5, 4, 3], 2, 3]
    expected: {"items": [6, 5, 4], "page": 2, "total_pages": 3, "has_next": true}
    label: middle page
  - args: [[1, 2, 3], 0, 2]
    expected: {"items": [], "page": 0, "total_pages": 2, "has_next": false}
    hidden: true
    label: page below 1
  - args: [["a", "b", "c", "d"], 2, 2]
    expected: {"items": ["c", "d"], "page": 2, "total_pages": 2, "has_next": false}
    hidden: true
    label: exact multiple, last page
  - args: [[1, 2, 3], 5, 1]
    expected: {"items": [], "page": 5, "total_pages": 3, "has_next": false}
    hidden: true
    label: past the end
hints:
  - "Trace paginate([1, 2, 3, 4, 5], 3, 2) by hand before editing. Which item should page 3 contain, and does total_pages even allow page 3?"
  - "There are five problems: floor instead of ceiling, a missing lower bound on page, an off-by-one start index, an unrequested (and in-place) sort, and an off-by-one has_next."
  - "Ceiling division without floats: (n + per_page - 1) // per_page in Python, Math.ceil(n / per_page) in JavaScript."
```

## Senior signals

- You treat **fluency as zero evidence** and verify with tests, properties, types and tracing instead of with how the code reads.
- You own the **tests' expected values**, derived from the spec, and you distrust tests the same agent wrote from the same understanding.
- You reach for **property-based and differential tests** where AI bugs hide, and read a shrunk counterexample as a diagnosis.
- You use **mutation testing** to find behaviours an AI-written suite does not pin down.
- You check every **new dependency and API** against reality, knowing hallucinated package names get registered by attackers.
- You rely on **canaries and automatic rollback** as the final layer, because more changes per day need faster, automatic recovery.

## Check yourself

```quiz
- q: >-
    An agent wrote a function and its tests in the same session, and all tests pass. Why is that weak evidence of correctness?
  options: ["The tests share the code's understanding, so a spec misreading passes both", "Passing tests are never evidence of correctness for generated code", "Agents write too few tests, so the coverage is too low to mean anything", "Agents write tests that are syntactically valid but never actually executed"]
  answer: 0
  explanation: >-
    Code and tests from one mind share its blind spots, and expected values may even come from running the code. Tests are strong evidence when their expected values come from the spec, ideally written or reviewed before the implementation. More tests from the same understanding do not help; passing tests are evidence, but tests derived from the code are weak evidence.
- q: >-
    A property test on paginate shrinks to the counterexample items=[0], per_page=2. What does this most directly suggest?
  options: ["total_pages rounds down, so a partial final page is dropped", "Pages are returned in the wrong order when per_page exceeds the length", "per_page must be at least 3, since smaller pages are not supported", "Hypothesis is generating invalid inputs that paginate should reject"]
  answer: 0
  explanation: >-
    One item at two per page should give one page. Floor division gives 0, making the item unreachable. Shrinking removes everything irrelevant, so the minimal case points straight at the boundary.
- q: >-
    Mutation testing reports that changing page < total_pages to page <= total_pages in has_next does not fail any test. What should you do?
  options: ["Ignore it, since mutation testing is noisy and most mutants are harmless", "Delete the has_next field, since callers can compute it from total_pages", "Add a test that the last page has has_next false, pinning the boundary", "Switch the comparison to <=, since the tests show both versions are fine"]
  answer: 2
  explanation: >-
    A surviving mutant marks a behaviour the suite does not constrain. The missing test is exactly the boundary case where the two versions differ: the last page. The tests allowing both versions shows a gap in the tests, not that both are correct.
- q: >-
    An AI-generated change adds a dependency you have never heard of. Which check matters most before approving?
  options: ["That the agent confirms it is widely used and actively maintained", "That it has a permissive licence compatible with your product's licence", "That it exists, is the project you intended, is pinned and is actually needed", "That it has more than 100 GitHub stars and a commit in the last year"]
  answer: 2
  explanation: >-
    Models sometimes name packages that do not exist, and attackers register such names so agents install them (slopsquatting); a typo of a real name is the same risk. Verifying identity, pinning and necessity closes that path. Licence matters too, but a malicious package is the larger immediate risk, stars can be faked, and the agent's word is not verification.
- q: >-
    You asked an agent to make a slow function faster. What is the most effective verification strategy?
  options: ["Ask the agent to confirm and document that the behaviour is unchanged", "Rely on the existing unit tests, since they already define the behaviour", "Compare old and new on thousands of random inputs, plus a benchmark", "Read the new code carefully, line by line, against the old version"]
  answer: 2
  explanation: >-
    Optimisations change mechanism while promising identical behaviour, which is exactly what a differential test checks: keep the old implementation as an oracle and compare both on random inputs, with a benchmark to confirm the speed-up. Existing unit tests cover only the cases someone thought of, and an agent's confirmation is not evidence.
```

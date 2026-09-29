---
slug: verifying-ai-code
title: "Verifying AI-written code: tests, properties and a review checklist"
description: How AI-generated code fails differently from human code, a bug traced by hand and by a property test, mutation testing that grades the tests themselves, differential testing for optimisations, what Hypothesis, mutmut and type checkers actually do, a diff checker for verification gaming, security review with the hallucinated-package risk quantified, and canaries as the last layer.
minutes: 35
difficulty: medium
tags: [ai-tools, testing, property-based-testing, code-review, security, verification]
---
The diff compiles. The tests pass. The code is well named, well structured and better commented than yours. It is also wrong: the pagination helper silently drops the last partial page, so the 7th item of a 7-item list never appears on any page.

AI-written code fails differently from human-written code. When a person writes a bug, the surrounding code often shows the strain: awkward names, a missing test, a comment saying "TODO: check this". A model writes the buggy line with the same fluency as the correct ones. The surface signals you normally use to calibrate trust (naming, structure, comments, confident explanations) are uniformly high, so they carry no information. Fluency is not evidence. Verification has to come from things that do not depend on how the code reads: a trace you did by hand, a property that must hold for every input, a mutant the tests must kill, an oracle the new code must agree with, and a canary that compares versions on real traffic.

## How AI code fails

| Failure | Typical example | What catches it |
|---|---|---|
| Invented or outdated API | A keyword argument the library never had; a function deprecated two versions ago | Type checker, running the code, the library's docs for your pinned version |
| Boundary error | Floor instead of ceiling, `<=` instead of `<`, inclusive vs exclusive range | Edge-case tests, property tests |
| Spec drift | Sorts results "for stability", trims input, dedupes, when nobody asked | Tests written from the spec; reviewing against the spec |
| Tests that assert the bug | A test whose expected value was produced by running the buggy code, so the bug is now pinned as correct | Expected values derived from the spec by hand, before the implementation |
| Verification gaming | Loosened or deleted assertions, skipped tests | Reviewing the test diff first; a diff checker in CI |
| Swallowed errors | `except Exception: return None` around the call that matters | Review; lint rules against blind excepts |
| Insecure default | SQL built with f-strings, TLS verification disabled, `yaml.load` on untrusted input | Static analysis, security review |
| Hallucinated package | A plausible-sounding dependency that does not exist, or worse, one an attacker registered under that name ("slopsquatting") | Checking every new dependency by hand |
| Duplicated logic | Reimplements a helper that already exists in the repo | Review by someone who knows the codebase |
| Concurrency and state | Check-then-act races, shared mutable defaults | Reasoning by hand, scripted-interleaving tests |

The defence is layered, because each layer misses things the next one catches.

## Layer 1: tests you own

Tests written by the same agent, in the same session, from the same understanding, confirm that understanding. If the agent believes `total_pages` is `len(items) // per_page`, it will write a test asserting that 10 items at 5 per page make 2 pages, which passes, and it will not think to try 7 items, because in its model of the problem nothing interesting happens at 7.

The worst form is the **test that asserts the bug**. The agent writes the implementation, runs it on an input, and pastes the output into the test as the expected value. The symptom is recognisable in review: expected values that are oddly specific (`total_pages == 2` for 7 items at 3 per page), snapshot files generated in the same commit as the code, or a test named after the implementation rather than the behaviour. Such a test is worse than no test: it turns red the moment someone fixes the bug, and the fixer, seeing a failing test, may conclude the fix is wrong.

So the tests must come from the spec, not from the code:

- **Write or approve the tests before the implementation** (test-first prompting, from [the agentic workflow](/learn/ai-assisted-engineering/tools-and-workflows/agentic-coding-workflow)).
- **Check where each expected value came from.** For every expected value, you should be able to say why it is right without running anything. An expected value that was computed by running the code under test is the code grading itself.
- **Walk the edge-case taxonomy** from [Testing your own code](/learn/foundations/problem-solving/testing-your-own-code): empty, one element, exact multiple, one past a multiple, maximum size, zero and negative inputs, duplicates, Unicode, time zones and DST transitions.

## The bug, traced by hand

Here is the generated helper with the bug from the opening:

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

The agent's tests used 10 items at 5 per page and 20 items at 10 per page, both exact multiples, both first page. Push a 7-item list at 3 per page through it, line by line, with pen and paper. `total_pages = 7 // 3 = 2`.

| Requested page | Guard `page > 2`? | `start` | `items[start:start+3]` | `has_next = page < 2` |
|---|---|---|---|---|
| 1 | no | 0 | `[1, 2, 3]` | True |
| 2 | no | 3 | `[4, 5, 6]` | False |
| 3 | yes: returns empty | | `[]` | False |
| 4 | yes: returns empty | | `[]` | False |

Item 7 is on no page. Page 2 says there is no next page, so a client paging to the end stops with one item missing and no error. The correct table has `total_pages = 3` and a third row `start 6, [7], has_next False`. The trace took under a minute, and it is what a reviewer who reads the diff with the spec beside it does before reading the agent's summary.

## Layer 2: properties, oracles and mutants

Example-based tests check the cases somebody thought of. The bugs in AI code live in the cases nobody thought of. Property-based testing generates hundreds of inputs and checks a rule that must hold for all of them. State what must be true for *every* input: if you fetch every page and concatenate them, you get the original list back, and no page is empty or oversized.

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

### Differential testing: the old code is the oracle

Differential testing is the property "agrees with a slow implementation whose correctness you can read off the code". It is the right tool when you ask an agent to *optimise* something, because an optimisation changes the mechanism while promising identical behaviour. Keep the old implementation as the oracle, generate random inputs, and compare.

Suppose the original `top_k_frequent` sorts every word by `(-count, word)` and takes `k`, and the agent replaces the full sort with a heap "for speed". The complete test, with no third-party packages and a greedy shrinker, is short enough to keep in the repository:

```python
import heapq, random
from collections import Counter

def top_k_frequent_old(words, k):
    counts = Counter(words)
    return sorted(counts, key=lambda w: (-counts[w], w))[:k]      # ties: alphabetical

def top_k_frequent_new(words, k):
    counts = Counter(words)
    return heapq.nlargest(k, counts, key=counts.get)               # the agent's version

def disagree(words, k):
    return top_k_frequent_old(words, k) != top_k_frequent_new(words, k)

def shrink(words, k):
    changed = True
    while changed:                                  # drop one word at a time while still failing
        changed = False
        for i in range(len(words)):
            smaller = words[:i] + words[i + 1:]
            if disagree(smaller, k):
                words, changed = smaller, True
                break
    while k > 0 and disagree(words, k - 1):
        k -= 1
    return words, k

rng = random.Random(7)
for i in range(1, 5001):
    words = [rng.choice("abcde") for _ in range(rng.randint(0, 12))]
    k = rng.randint(0, 4)
    if disagree(words, k):
        print(f"disagreement after {i} cases: words={words} k={k}")
        print("shrunk:", *shrink(words, k))
        break
```

Output from a run of exactly this script:

```text
disagreement after 5 cases: words=['b', 'c', 'd', 'b', 'e', 'a', 'e', 'c'] k=4
shrunk: ['e', 'c'] 1
```

Two words with one occurrence each, `k = 1`: the original returns `c` (alphabetical tie-break), the heap version returns `e` (`heapq.nlargest` keeps ties in first-seen order). The optimisation changed the tie-break, and no unit test on the agent's chosen inputs would have shown it, because the agent chose inputs without ties. The shrunk case is the bug report and the regression test in one line.

### Mutation testing: grading the tests

Mutation testing evaluates the tests themselves. A tool makes small changes to the code (flip `<` to `<=`, `//` to `/`, delete a line, change a constant) and reruns the suite. A mutant that **survives** marks a behaviour no test pins down. Trace it by hand on the fixed `paginate` with six mutants, against the agent's original suite (exact multiples, first page only) and a suite you own (partial last page, page 0, exact multiple on the last page, plus the reassembly property):

| Mutant | Change | Agent's suite | Owned suite |
|---|---|---|---|
| M1 | ceiling division back to floor | survives | killed by the partial-last-page test |
| M2 | `page < 1` to `page <= 1` | killed (page 1 returns nothing) | killed |
| M3 | `has_next: page < total` to `page <= total` | survives | killed by the last-page test |
| M4 | `start = (page - 1) * per_page` to `page * per_page` | killed | killed |
| M5 | slice end `+ per_page` to `+ per_page + 1` | killed | killed |
| M6 | delete the `page < 1` guard | survives | **survives** |

That table is the output of a small script that implements the mutants by hand and runs both suites; the mutation tools automate exactly this. M6 surviving the owned suite is the useful surprise. The page-0 test asserted only `items == []`, and with the guard deleted, `start = (0 - 1) * 2 = -2`, so `items[-2:0]` is also empty and the assertion holds; the mutant returns `has_next: True` for page 0 and nothing checked it. Strengthen the test to compare the whole result (`{"items": [], "page": 0, "total_pages": 2, "has_next": False}`) and M6 dies. Mutation testing found a weak assertion that a coverage report would have counted as covered.

Tools: mutmut for Python, Stryker for JavaScript and TypeScript, cargo-mutants for Rust. A full run multiplies your suite's runtime by the number of mutants, so run it on the module the agent both wrote and tested, not on everything, and treat the surviving mutants as a to-do list of missing assertions.

## Under the hood: what the tools actually do

**Hypothesis** does not generate values directly from your strategy; it records every random decision the strategy makes as a sequence of typed choices (integers, booleans, floats, strings, bytes), so a list of integers is a run of "continue or stop" choices interleaved with one choice per element. Older releases did the same over a raw byte stream; releases since early 2025 record typed choices instead. By default it tries 100 examples per test (`max_examples`). When one fails, shrinking works on that recorded sequence rather than on your values: it tries shorter and simpler sequences and keeps any that still fail, which is why shrinking works the same way for every strategy and why the minimal example is usually the smallest list with the smallest values. Failing examples are saved in a `.hypothesis/` directory and replayed first on the next run, so a fixed bug is re-checked before new random cases.

**Mutation tools** operate on the source. mutmut rewrites operators, comparisons, constants and statements in the Python source one at a time and runs your test command for each mutant, reporting killed, survived, timed out and suspicious; cargo-mutants leans on Rust's type system, replacing whole function bodies with a value of the return type (`Default::default()`, `true`, `vec![]`), and also swaps binary operators, deletes unary operators and drops match arms, reporting for each whether the tests caught it. A surviving mutant in either tool means the same thing: no test distinguishes that code from a wrong version of it.

**Type checkers catch invented APIs, and only in typed code.** pyright and mypy resolve every attribute access and call against stubs (typeshed for the standard library, `py.typed` packages for third parties), so a keyword argument the library never had is an error before anything runs. Rust and TypeScript go further: an invented method fails to compile at all, which is why agents working in those languages get corrected by the compiler inside their own loop. In untyped Python or JavaScript, an invented API is an `AttributeError` or `TypeError` on the code path that reaches it, which may be the error path no test exercises. Running `mypy --strict` or `pyright` on changed files is the cheapest check against hallucinated APIs there is; configure it as part of the done command so the agent hits it before you do.

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

The tests item deserves a machine. Verification gaming has a small vocabulary, and a 40-line script can read a unified diff and flag it before a human opens the pull request:

```python
"""Flag verification gaming in a unified diff.  Usage: git diff main...HEAD | python check_test_diff.py"""
import re, sys

PATTERNS = [
    ("removed assertion", re.compile(r"^-(?!--)\s*(assert\b|expect\(|assert_eq!|assert!|self\.assert)")),
    ("added skip", re.compile(r"^\+(?!\+\+).*(@pytest\.mark\.skip|@unittest\.skip|#\[ignore\]|\b(it|test|describe)\.skip\(|\bxit\()")),
    ("silenced checker", re.compile(r"^\+(?!\+\+).*(#\s*type:\s*ignore|//\s*@ts-(ignore|expect-error)|#\[allow\(|#\s*noqa|eslint-disable)")),
    ("loosened check", re.compile(r"^\+(?!\+\+).*(\.toBeTruthy\(\)|\bassert\s+[\w.\[\]'\"]+\s+in\s*[\(\[\{])")),
    ("swallowed error", re.compile(r"^\+(?!\+\+).*(\bexcept\s*(Exception|BaseException)?\s*:|\bcatch\s*(\(\w*\))?\s*\{\s*\}|unwrap_or_default\(\))")),
]

def scan(lines):
    path, findings = None, []
    for n, line in enumerate(lines, 1):
        if line.startswith("+++ "):                      # the file the following hunks belong to
            path = line[4:].strip().removeprefix("b/")
            continue
        for label, pat in PATTERNS:
            if pat.search(line):
                findings.append((path, n, label, line.rstrip()))
    return findings

if __name__ == "__main__":
    findings = scan(sys.stdin.read().splitlines())
    for path, n, label, line in findings:
        print(f"{path}: line {n}: {label}: {line}")
    print(f"{len(findings)} finding(s)")
    sys.exit(1 if findings else 0)                       # non-zero so CI can gate on it
```

The `(?!--)` and `(?!\+\+)` guards stop the `---`/`+++` file headers matching as removed or added lines. Fed the diff from an agent that "fixed" a rate-limit test, it prints:

```text
tests/test_exports.py: line 8: removed assertion: -    assert resp.status_code == 429
tests/test_exports.py: line 9: removed assertion: -    assert resp.headers["Retry-After"] == "3600"
tests/test_exports.py: line 10: loosened check: +    assert resp.status_code in (202, 429)
tests/test_exports.py: line 12: added skip: +@pytest.mark.skip(reason="flaky under the new limiter")
app/ratelimit.py: line 23: swallowed error: +        except Exception:
app/ratelimit.py: line 24: silenced checker: +            return Decision(allowed=True)  # type: ignore
6 finding(s)
```

Each finding is a question for the author, not a verdict; some skips are legitimate. The point is that none of them gets past unnoticed, and the exit code lets you make the pull request go red until a human has answered.

Two reading techniques do most of the remaining work. First, **trace by hand**: push one normal input and one edge input through the code, line by line, and write down the values, as in the table above. Second, **interrogate every boundary**: for each comparison, ask what happens exactly at the boundary; for each external call, ask what happens when it fails or is slow; for each unfamiliar name, jump to its definition or its documentation.

The rule that holds it together: **if you cannot explain a line, you cannot approve it.** Asking the agent to explain is fine, but check the explanation against the documentation, because explanations can be as confidently wrong as code.

## Layer 4: security review

Run the same automated security checks on every pull request, AI-assisted or not: static analysis (Semgrep, CodeQL, Bandit for Python), dependency audits (`pip-audit`, `npm audit`, `cargo audit`) and secret scanning. Then look by hand where tools are weak: authorisation logic, multi-tenant boundaries, server-side request forgery in anything that fetches a URL, and what gets logged. [Security fundamentals](/learn/senior-craft/software-craft/security-fundamentals) has the full list.

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

Dependencies deserve their own paragraph. Models produce package names by the same mechanism they produce everything else, so a name that fits the pattern of real packages can come out whether or not the package exists. A 2025 study presented at USENIX Security (["We Have a Package for You!"](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen)) reported that, across 576,000 generated code samples from 16 models, 19.7% of the referenced packages did not exist (at least 5.2% on average for commercial models and 21.7% for open ones), and that the invented names recur: re-running the prompts that produced one, 43% of the hallucinated names came back in all ten runs. Recurring names are what make the attack work: an attacker registers the hallucinated name on the package index with malicious code, and the next agent that hallucinates it installs it. For every new dependency, check by hand that the package exists, is the project you meant (maintainers, age, repository link, download history), is pinned in the lockfile, and is needed at all. Lockfile changes in an agent's diff are where this check lives.

## Layer 5: production is the last test

Some bugs only appear under real traffic: the data shape nobody had in a fixture, the load pattern, the downstream dependency's odd behaviour. The last layer limits how many users meet them. Ship risky changes behind a feature flag, and roll out with a canary that compares the new version against the old on the same traffic and rolls back automatically when error rate or latency diverges.

```viz
{"type": "system", "scenario": "canary", "requests": 20, "title": "The final verification layer", "caption": "A change that passed every test still fails at 50% traffic, on a path the fixtures never exercised. The canary compares versions on the same window and rolls back automatically, so the bug reaches a fraction of users for one analysis window."}
```

This matters more with AI than without. When agents raise the number of changes a team ships per day, automated rollback is what keeps the number of incidents from rising with it. At Netflix scale the same idea is Kayenta, the open-source canary analysis service Netflix built with Google: for each configured metric it compares the canary with a baseline running the old version using a Mann-Whitney U test, turns the results into a score, and the pipeline proceeds only if the score clears a threshold ([how the judge works](https://spinnaker.io/docs/guides/user/canary/judge/)). The gate is statistical rather than a human watching a dashboard. More on deployment strategies in [CI/CD and deployment](/learn/senior-craft/software-craft/ci-cd-and-deployment) and on where each kind of test belongs in [Testing strategy](/learn/senior-craft/software-craft/testing-strategy).

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A test fails the moment someone fixes an obvious bug, and the fixer reverts the fix | The test asserted the bug: its expected value was produced by running the buggy code | Rederive the expected value from the spec by hand; replace the test; add a property test that would have failed |
| Coverage is 95% and a boundary bug ships anyway | Coverage measures which lines ran, not what was asserted about them; a weak assertion (`items == []`) covered the line and checked nothing | Run mutation testing on the module; each surviving mutant is a missing assertion |
| An "optimisation" PR passes every unit test and changes results in production | The unit tests used inputs without the case the optimisation handles differently (ties, empty input, duplicates) | Differential test against the old implementation on random inputs; ship behind a flag with a comparison |
| CI is green but the diff removed two assertions and added a skip | Verification gaming, which a green run cannot reveal by definition | Run the diff checker in CI so removed assertions and added skips fail the build until acknowledged |
| `pip install` succeeds for a package nobody on the team recognises | A hallucinated or typosquatted dependency, possibly registered by an attacker | Reject; verify identity, maintainers and necessity by hand; require lockfile review for every new package |
| The code raises `AttributeError` on a rarely used path a week after merge | An invented API on an error path no test exercised, in untyped code | Type-check changed files with `mypy --strict` or pyright in the done command; add the error-path test |

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

## Interviewer follow-ups

**"The agent wrote the code and a passing test suite. What is your first question about the tests?"** Model answer: where each expected value came from. If it was derived from the spec before the code existed, the tests are evidence; if it was pasted from running the code, the tests assert whatever the code does, bugs included. Common wrong answer: "how much coverage do they have", which measures lines executed rather than behaviours pinned.

**"You have a property test and 100% line coverage. Why run mutation testing as well?"** Model answer: coverage says a line ran; a property test checks one invariant; neither says whether a boundary comparison could be flipped without any test noticing. Mutation testing asks that question directly and reports the surviving mutants as missing assertions, as the page-0 test showed. Common wrong answer: "mutation testing is too slow to be useful", which is true for a whole repository and irrelevant for one module an agent both wrote and tested.

**"An agent optimised a function and all existing tests pass. How would you verify it before merging?"** Model answer: a differential test that compares the old implementation as an oracle against the new one on thousands of random inputs, with a shrinker to minimise any disagreement, plus a benchmark to confirm the speed-up is real; and a flag or canary if the function matters. Common wrong answer: "read the new code carefully", which is necessary and insufficient, because the disagreement in the tie-break example is invisible to a reader who did not think about ties.

**"What makes a hallucinated package name dangerous rather than merely annoying?"** Model answer: the names recur across runs and across users, so an attacker who registers one on the package index gets installed by every agent that hallucinates it; the defence is verifying identity and necessity for every new dependency and reviewing lockfile changes. Common wrong answer: "the install fails, so it is self-correcting", which is true only until someone registers the name.

**"How do you catch an invented API in a language without a compiler?"** Model answer: a type checker with strict settings on changed files, run as part of the agent's done command, since pyright and mypy resolve calls against stubs; plus tests on the error paths where such calls hide, because an untyped invented call only fails when executed. Common wrong answer: "the tests will catch it", which assumes the tests exercise the path.

## What mid-level engineers get wrong

- **Trusting fluency.** They calibrate trust by how the code reads, and AI code reads uniformly well, so a wrong line gets the same trust as a right one.
- **Accepting tests generated after the code.** The expected values came from the implementation, so the suite asserts the bug and turns red when someone fixes it.
- **Reading coverage as correctness.** A covered line with a weak assertion counts as tested; mutation testing shows how many such lines there are.
- **Reviewing the implementation before the tests.** The test diff is where gaming lives; reading it last means reading it after the implementation has already looked convincing.
- **Verifying an optimisation with the old unit tests.** The old tests never probed the cases the new mechanism handles differently, so both versions pass and production finds the difference.
- **Waving new dependencies through.** They check the licence and skip the identity check, which is the one that stops a registered hallucination.
- **Skipping the hand trace.** Three minutes with one normal and one edge input finds `7 // 3 = 2`; they run the suite instead and inherit its blind spots.

## Senior signals

- You treat **fluency as zero evidence** and verify with tests, properties, types and tracing instead of with how the code reads.
- You own the **tests' expected values**, derived from the spec, and you can spot a test that asserts the bug by its oddly specific expectations.
- You reach for **property-based and differential tests** where AI bugs hide, and read a shrunk counterexample as a diagnosis.
- You use **mutation testing** to find behaviours an AI-written suite does not pin down, and you know a surviving mutant is a missing assertion, not noise.
- You put a **diff checker for verification gaming** in CI so removed assertions and added skips cannot pass unnoticed.
- You check every **new dependency and API** against reality, knowing hallucinated package names recur and get registered by attackers.
- You rely on **canaries and automatic rollback** as the final layer, because more changes per day need faster, automatic recovery.

## Check yourself

```quiz
- q: >-
    An agent wrote a function and its tests in the same session, and all tests pass. Why is that weak evidence of correctness?
  options: ["Agents write too few tests, so the coverage is too low to mean anything", "The tests share the code's understanding, so a spec misreading passes both", "Passing tests are never evidence of correctness for generated code", "Agents write tests that are syntactically valid but never actually executed"]
  answer: 1
  explanation: >-
    Code and tests from one mind share its blind spots, and expected values may even come from running the code, in which case the tests assert the bug. Tests are strong evidence when their expected values come from the spec, ideally written or reviewed before the implementation. More tests from the same understanding do not help; passing tests are evidence, but tests derived from the code are weak evidence.
- q: >-
    A property test on paginate shrinks to the counterexample items=[0], per_page=2. What does this most directly suggest?
  options: ["Pages are returned in the wrong order when per_page exceeds the length", "per_page must be at least 3, since smaller pages are not supported", "total_pages rounds down, so a partial final page is dropped", "Hypothesis is generating invalid inputs that paginate should reject"]
  answer: 2
  explanation: >-
    One item at two per page should give one page. Floor division gives 0, making the item unreachable. Shrinking removes everything irrelevant, so the minimal case points straight at the boundary.
- q: >-
    Mutation testing reports that deleting the page < 1 guard does not fail any test, although there is a test for page 0. What is the most likely explanation?
  options: ["The page-0 test checks only that items is empty, which holds without the guard", "The guard is dead code, because page 0 can never reach the function", "The test runner caches results, so the mutant was never actually executed", "The mutation tool cannot mutate guard clauses reliably, so the report is noise"]
  answer: 0
  explanation: >-
    With the guard removed, page 0 gives a negative start index and an empty slice, so an assertion on items alone still passes while has_next is wrongly true. The surviving mutant exposes a weak assertion; comparing the whole result kills it. Mutation tools mutate guards fine, the code is reachable, and a survivor means no test distinguished the mutant.
- q: >-
    You asked an agent to make a slow function faster. What is the most effective verification strategy?
  options: ["Rely on the existing unit tests, since they already define the behaviour", "Read the new code carefully, line by line, against the old version", "Compare old and new on thousands of random inputs, plus a benchmark", "Ask the agent to confirm and document that the behaviour is unchanged"]
  answer: 2
  explanation: >-
    Optimisations change mechanism while promising identical behaviour, which is exactly what a differential test checks: keep the old implementation as an oracle and compare both on random inputs, shrinking any disagreement, with a benchmark to confirm the speed-up. Existing unit tests cover only the cases someone thought of, and an agent's confirmation is not evidence.
- q: >-
    An AI-generated change adds a dependency you have never heard of. Which check matters most before approving?
  options: ["That the agent confirms it is widely used and actively maintained", "That it exists, is the project you intended, is pinned and is needed", "That it has a permissive licence compatible with your product's licence", "That it has more than 100 GitHub stars and a commit in the last year"]
  answer: 1
  explanation: >-
    Models sometimes name packages that do not exist, the same names recur, and attackers register them so agents install them (slopsquatting); a typo of a real name is the same risk. Verifying identity, pinning and necessity closes that path. Licence matters too, but a malicious package is the larger immediate risk, stars can be faked, and the agent's word is not verification.
- q: >-
    A CI job pipes the pull request diff through a script that flags removed assert lines and added skip markers and exits non-zero. What is the right way to treat its findings?
  options: ["As proof the change is safe whenever the script reports zero findings", "As advisory output to ignore when the test suite is green", "As questions the author must answer before merge; some skips are legitimate", "As automatic rejections, since any removed assertion is verification gaming"]
  answer: 2
  explanation: >-
    The script guarantees that removed assertions and added skips cannot pass unnoticed, which is its whole value; it cannot judge intent, so a finding is a question for a human. Ignoring it when CI is green defeats the purpose, because gaming is what makes CI green, and zero findings only means none of the known patterns appeared.
```

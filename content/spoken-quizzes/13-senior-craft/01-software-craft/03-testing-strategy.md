---
lesson: testing-strategy
source: 4f0fe3f8eadf0550
---
## 1

Every repository test in a service mocks the database client. A migration renames a column and production breaks, yet CI stayed green. What is the most direct fix?

A, integration tests that run the real queries against the migrated Postgres. B, a coverage gate that fails the build below 100 percent of repository lines. C, more unit tests around the repository, each with its own stricter mock. D, an end-to-end browser test for every page that reads from that table.

[think]

The answer is A: integration tests that run the real queries against the migrated Postgres.

The mocks encoded the old column name, so they could only confirm the author's assumption, and stricter mocks or full coverage of mocked code add no fidelity. Only a test that runs the real SQL against the real, migrated schema can catch the drift. Browser tests would catch it too, but slowly, late and imprecisely, which is why the integration level is the direct fix.

## 2

Which is the best property to test for a function pair that encodes and decodes an opaque pagination cursor?

A, decoding the encoding of x gives back x, for every valid position x. B, encoding any input finishes in under a millisecond. C, decoding any string at all returns a position. D, the encoding is always exactly 43 characters long.

[think]

The answer is A: decoding the encoding of x gives back x, for every valid position.

The round trip is the defining property of an encoder and decoder pair, and it holds for every input, which is exactly what a generator can search. A fixed length is false for variable-length positions. A timing bound is a flaky benchmark, not a property. And decode should reject garbage input with an error, rather than return a position for everything.

## 3

A Playwright test waits a fixed 2 seconds before checking a result, and fails about one run in fifty. What is the right fix?

A, replace the sleep with an assertion that waits for the result. B, enable two retries, so a single slow run no longer fails the build. C, raise the wait to 5 seconds, so slow CI machines have enough time. D, skip the test on CI, and keep running it locally before each merge.

[think]

The answer is A: replace the sleep with an assertion that waits for the result.

Fixed sleeps are the most common cause of flakes: too short on a slow machine, wasted time on a fast one. A web-first assertion polls for the condition, so the test becomes both faster and deterministic. A longer sleep only moves the failure rate. Retries hide the flake, which is why Ascend's Playwright config sets retries to zero. And skipping it in CI removes the check from the place that gates merges.

## 4

Why does Ascend's production build run the binary's content check in strict mode, on top of the unit test that loads the embedded curriculum?

A, it shrinks the binary by dropping lessons that fail validation. B, it lets the server skip parsing the curriculum at every boot. C, it checks the exact content compiled into the binary that will ship. D, it replaces the CI validation step, which only runs in lenient mode.

[think]

The answer is C: it checks the exact content compiled into the binary that will ship.

Checking the artifact you are about to ship closes the gap between "tests passed somewhere" and "this binary is valid". Found at boot, a content error fails the deploy; found in the build, it blocks the image before anything ships. It complements the CI step, which is strict too, rather than replacing it. Nothing is dropped from the binary, and the server still parses the curriculum at every boot.

## 5

Your team's CI retries failing tests up to twice, and reports green if any attempt passes. What is the main risk?

A, test order becomes fixed, so order-dependent bugs can no longer appear. B, flaky tests start failing more often, because they run more times. C, every run gets slower, because each test now runs three times. D, real intermittent bugs, such as races in the product, look like noise.

[think]

The answer is D: real intermittent bugs, such as races in the product, look like noise.

Some flakes are genuine product bugs, races or timeouts, that users will hit, and automatic retries turn them into green builds with no signal. Only failing tests are retried, so passing runs are not slower, and retrying changes neither test order nor how often the bug fires. If you retry at all, record a pass on retry as a flake event and track it.

## 6

A test fails in about 2 percent of runs. Roughly how many reruns on the same commit do you need to see at least one failure with 95 percent probability?

A, about 20. B, about 50. C, about 500. D, about 150.

[think]

The answer is D: about 150.

Each run passes with probability 0.98, so the chance that n runs all pass is 0.98 to the power n. That drops below 5 percent only at about 148 runs. Twenty runs catch the failure only a third of the time, and fifty about 64 percent of the time, which is why a handful of green reruns proves little. Five hundred is more than you need.

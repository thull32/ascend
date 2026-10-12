---
lesson: the-content-engine
source: a51dbb987dfdc9df
---
## 1

Why are Ascend's content ETags identical across replicas and restarts, without any coordination?

A, Railway pins every learner to one replica, so the ETags never have to agree. B, each replica writes its ETag to Postgres at boot, and every replica reads that shared value. C, they hash the content, the build ID and the app shell, which every process computes identically. D, they include the process start time, which Railway keeps equal on all replicas.

[think]

The answer is C: they hash the content, the build ID and the app shell, which every process computes identically.

The validator is a pure function of inputs compiled into the binary: the sorted content files, the build ID, and the embedded index page. Any process from the same build derives the same value. Mixing in the start time would do the opposite, and invalidate every cache on each restart.

## 2

Before a fix, a deploy that added a field to the lesson JSON, but changed no Markdown, left returning browsers without the field. Why, and what closed the gap?

A, Railway kept serving the old container for an hour; gating on the readiness probe fixed it. B, the ETag hashed the content only, so revalidation returned 304; adding the build ID fixed it. C, a lesson cache in Postgres went stale; clearing that table on every boot fixed it. D, the index page was cached for a year, so the old app kept running; serving it with no caching fixed it.

[think]

The answer is B: the ETag hashed the content only, so revalidation returned 304, and adding the build ID fixed it.

The browser revalidated correctly, but the validator it compared against did not change, because it was derived from content alone. A cache key must include everything the response depends on. The index page was already served with no caching, and there is no lesson cache in Postgres.

## 3

The content extractor re-emits each quiz block as JSON containing only the questions and options. What does that design achieve?

A, answers stay on the server until grading, and YAML errors surface at build time. B, learners can edit a quiz in the browser, and save it back without any YAML parser. C, answers stay hidden for good, even after a learner's first graded attempt. D, payloads shrink, because YAML comments and indentation are dropped from each lesson.

[think]

The answer is A: answers stay on the server until grading, and YAML errors surface at build time.

The public projection, plus a field skipped during serialisation, keeps answers on the server until the grade request. Parsing at build time moves YAML mistakes from a learner's browser to CI, and the client needs no YAML parser. Answers are deliberately revealed after one graded attempt, so the claim that they stay hidden for good is wrong.

## 4

A lesson exercise marks two of its tests as hidden. What does hidden mean in Ascend?

A, the tests only run in CI, against the reference solution stored in the lesson file. B, the tests never leave the server, which runs them after each submission. C, the browser receives and runs them, but they are not shown before you submit. D, the tests travel encrypted in the payload, and are decrypted by the worker.

[think]

The answer is C: the browser receives and runs them, but they are not shown before you submit.

The browser runs every test for instant feedback, so it receives them all, expected values included. The server does grade the same tests again in its sandbox, and records only its own verdict, but the tests still leave it, in the page and in the repository. Encryption would not help, because the worker must decrypt them to run them; a competitive feature would need inputs that never leave the server.

## 5

Which of these content mistakes still passes strict validation today, and reaches learners?

A, a module prerequisite that names a module the curriculum does not contain. B, a link in the prose to a real lesson, with a section anchor that lesson lacks. C, a front matter key misspelled as "problem", singular, instead of the real key, "problems". D, a quiz question whose answer index is 5, although it has only four options.

[think]

The answer is B: a link to a real lesson, with a section anchor that lesson lacks.

Answer indexes are bounds-checked, unknown front matter keys are rejected, and prerequisites are resolved against the loaded modules. The loader now also resolves every link to a lesson or practice page in the prose, but only up to the hash sign: the anchor is not checked. And the crawl checks each page's own table of contents, not the anchors other pages link to.

## 6

The table of contents lists only level 2 and level 3 headings. Why does the backend still count a level 4 heading when it numbers duplicate IDs?

A, GitHub renders level 4 as level 3 on narrow screens, which changes the IDs the page uses. B, level 4 headings are promoted to level 3 when the table of contents is rendered on small phones. C, it does not: level 4 headings are ignored completely when duplicates are counted. D, the browser's slug plugin numbers headings at every level, so skipping level 4 would shift later IDs.

[think]

The answer is D: the browser's slug plugin numbers headings at every level, so skipping level 4 would shift later IDs.

The browser's IDs come from GitHub's slugger, which keeps one counter for the whole page. If a level 4 heading named Summary takes summary 1, the next level 3 heading named Summary is summary 2 in the page, so the table of contents must say summary 2 as well. A unit test pins exactly that case.

---
lesson: the-content-engine
source: d72fb641625b6780
fit: great
desk:
  - "The boot pipeline diagram and the content-as-code comparison table"
  - "The fence regex, the quiz arm of the extractor, and the before and after slugifier code"
  - "The ETag trace across a code-only deploy, and the search weighting code"
  - "Exercise: generate heading ids the way the browser does"
---
## Introduction

Ascend's curriculum is about 14 megabytes of Markdown: nearly 350 lessons and 180 practice problems, each with front matter and embedded quizzes, exercises and visualisations. Whatever serves it must satisfy five requirements at once. Content must be reviewable like code. It must be validated before it reaches a learner, because a broken quiz is a bug report. It must be fast, because it is the hottest read path. It must stay consistent with the code that renders it. And it must not leak quiz answers to anyone who opens the network tab.

Ascend's answer is to compile the Markdown into the executable, parse it once at boot into an immutable graph, and serve every lesson from memory. The interesting parts are the places where that engine was weaker than it looked: answers that are "hidden" but not secret, two components that disagreed about a heading's id, typos that loaded without complaint, and a cache validator that ignored the code.

## Content as code

At compile time, the whole content directory is baked into the binary's read-only data. In production the loader reads that embedded tree; locally, an environment variable points it at the same files on disk, so an author can edit and restart without recompiling. Both sources are flattened into one sorted map of path and text, so the parser never touches a filesystem and there is exactly one code path to test.

The rejected alternative is a CMS or a content table. A CMS lets non-developers edit, but content then needs its own migrations, backups and synchronisation with the renderer, and edits bypass review and CI. The failure modes this prevents are specific: a lesson that references a problem missing in production, a renderer that expects a field the content service has not deployed yet, and someone fixing a typo and breaking a quiz. With content in the same commit as the code, a reviewed pull request is the only way to change either, and the same build validates both.

What it costs. Every content change is a deploy, about a minute. A typo cannot be hot-patched. And editing requires Git, which is fine while the authors are engineers, and is the first thing to revisit if they stop being.

Two decisions hide in the boot pipeline. Identity comes from front matter, order from file names. A lesson file sorts third because of its numeric prefix, but its identity is the slug inside it, and progress rows reference slugs. So renumbering files is free, and renaming a slug orphans every learner's progress for that lesson. Nothing in the code enforces that slugs are stable. And the result is immutable. Every request takes a shared reference to the curriculum, one atomic increment, and does hash lookups. There are no locks because nothing ever writes.

## Hiding quiz answers

Interactive components are ordinary fenced code blocks whose label is exercise, quiz or viz, found with one regular expression. Reusing fences means every Markdown editor and GitHub's preview stay readable. Each block is parsed and re-emitted as canonical JSON into the body the client receives.

The quiz is the security-relevant one. The extractor emits a public projection, questions and options only. The full spec, with answers and explanations, is stored in a field marked so that it is never serialised, and grading happens on the server. An integration test inspects the lesson payload and asserts that neither the answer field nor an explanation appears in it. Re-emitting JSON has a bonus: YAML's traps, an unquoted colon or a stray hash sign, are caught once at build time with a file name, instead of in a learner's browser.

Now be precise about the trust model. Quiz answers are hidden until the first graded attempt, whose response reveals them all. Exercise tests, including those marked hidden, are sent to the browser in full, because the browser runs them for instant feedback. Hidden means "not displayed before you submit", not "secret".

What a later change fixed is who decides the result. Before it, the browser posted its own verdict and the server stored it, so one request claiming every test passed marked any problem solved. Now the server runs the code again in a WebAssembly sandbox and records only its own verdict. That closes forged results, but not memorised ones: the tests are in the page and in the public repository. A leaderboard or a certificate would need test inputs that never leave the server.

One more honest weakness: the extractor is a regex, not a Markdown parser, so a fence nested inside a longer fence is extracted as a real quiz. Why accept it? Because the failures are loud. A mis-extracted block almost always fails to parse or trips the "more than one quiz" check, so the build breaks with a file name. A proper Markdown event parser is the right move the first time a silent mis-parse happens, not before.

## Two slugifiers, then one algorithm

The table of contents is computed on the server: it scans each lesson's headings and gives each an id, and the page renders them as links. The browser gives the rendered headings their ids independently, using a plugin built on the github-slugger algorithm. Two components derive the same value, and for a while they derived it differently.

The old backend function kept letters and digits, lowercased them, turned any run of other characters into one hyphen and trimmed the ends. Its comment said it followed the same rule as the front end. It did not. github-slugger deletes punctuation, turns each space into its own hyphen, keeps underscores, and numbers repeated headings with a dash one, dash two. Plain-word headings agreed, which is why nobody noticed, and why the only unit test passed. But a heading with parentheses, like "Why O of 1 is a lie", got a different id on each side, and so did a second heading named Example. The learner tapped the link and nothing happened.

The fix ported the algorithm exactly, then tested the seam, not just the function. A nightly crawl opens every lesson in a real browser and checks that every table-of-contents link lands on an element with that id.

And the seam test earned its keep at once. The first port kept any character that Rust calls alphanumeric, translating github-slugger's rule from its README, letters and digits, instead of from its code. The next full crawl, 597 pages, found three links that still went nowhere, in headings with a superscript two, like "O of n squared", or a subscript two in a logarithm. Unicode classes those as numbers, so Rust kept them. github-slugger keeps only decimal digits, so it dropped them. The backend wrote one id; the browser wrote another.

Before I give you the lesson of that bug: how would you have written the test so it could catch it?

[pause]

Generate the expected values from the reference itself. The new test holds fifteen inputs, superscripts, fractions, emoji, other scripts' digits, whose expected ids were produced by running github-slugger. When a component must agree with a reference implementation, use the reference as an oracle, because hand-written expectations encode the same misreading as the code. The general rule: when two components must agree on a derived value, derive it once, or test the agreement where both run.

## Validation is the CI for content

In strict mode, the loader refuses to produce a curriculum if anything is malformed: duplicate slugs, a lesson naming a problem that does not exist, a missing prerequisite module, a quiz with fewer than two options, an exercise with no tests, and more. That one function runs in four places: a unit test, a CI step, the Docker build, and every boot. It also resolves every internal link written in prose, 2,605 of them when that check landed, and the reference solutions for every exercise and problem are graded by the server's sandbox, 1,430 in all. A broken lesson fails the build, not the deploy.

That list is longer than it was. Three kinds of mistake used to load silently. Unknown keys: nothing rejected them, so a lesson that said "problem" instead of "problems" simply had no practice problems, and a quiz question with "explanation" misspelled lost its explanation. Every content struct now denies unknown fields. Answer indices: an answer of 7 on a four-option question parsed perfectly and marked every learner wrong; it is now bounds-checked. And exercises that declared a language without starter code. Each fix makes the type or the validator encode what well formed means.

What is still not validated is as instructive. Links are checked up to the page, not the section anchor after the hash sign. And there is an escape hatch: a lenient mode that downgrades errors to warnings, for authors writing interdependent lessons at once. The deployment config once preserved whatever value it had, so a leftover setting would quietly have made both gates lenient; it is now pinned off. Refusing to boot in production with lenient mode on would make the mistake impossible.

## ETags that forgot the code

The whole corpus gets one fingerprint, a SHA-256 over the sorted paths and text, so every replica computes the same version after every restart, with no coordination.

Content endpoints used to turn that version directly into an ETag. That was correct in one direction: if any lesson changed, every ETag changed. It was wrong in the other. The version hashed content, not code. A deploy that changed the shape of a response but no Markdown kept the same ETag. So a returning browser asked "has it changed?", got a 304, and kept rendering the old body without the new field until the next content edit. A cache key must include everything the response depends on.

The fix hashes three things: the content version, the build id from the deployed commit, and the embedded index.html, whose asset hashes change whenever the front end does. It is computed once at boot. Note the order inside the handler: the 304 check happens before serialisation, so a revalidation skips JSON encoding and compression entirely.

Why this over the alternatives? Hashing each serialised body would always be exact, but it serialises every response to compute the validator, which throws away the cheap 304 path. A hand-bumped schema version is exact only until someone forgets to bump it. The build id is automatic and errs on the safe side. Its costs: every deploy invalidates every content ETag, even one that touched a log line. And the comparison is exact, so a weak validator that some proxies produce never matches, and the client silently gets full responses: correct, and slower.

## In the interview

Two follow-ups this lesson answers. First: why compile the curriculum into the binary rather than use a CMS?

[pause]

The content and the code that renders it change together, so one artifact makes them atomic, every edit is reviewed and validated by the same build, and the hottest read is a hash lookup with no database. The price is a deploy per edit and Git for authors, and the first decision record names non-engineer authors as the condition that reopens it. The weak answer is "a CMS is more flexible", with no account of drift or review.

Second: search scans the whole vocabulary for every prefix query; when do you replace it? Search is a small inverted index built at boot, with title words weighted 5, tags 4, slug 3, description 2, and body words capped so they never contribute more than about 1. A prefix like "dijk" is matched by comparing against every token, which is linear in the vocabulary. At this size that is well under a millisecond, and the handler caps query and result length. Replace it when a measurement says so, with a trie for prefixes or an in-process engine with proper ranking, before reaching for a separate search service.

## Recap

Four things to remember. Content as code makes content and renderer atomic and reviewed, at the price of a deploy per edit. Keep secrets server-side by construction, a public projection plus a field that is never serialised, pinned by a test, and state honestly that tests the browser runs are not secret. When two components must agree on a derived value, derive it once or test the agreement where both run, with expected values from the reference. And a cache validator must cover everything the response depends on, content and code.

At your desk: the boot pipeline, the extractor and slugifier code, the ETag trace across a deploy, and the heading-id exercise.

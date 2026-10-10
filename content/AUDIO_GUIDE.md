# Audio guide

Ascend lessons can be listened to while running, driving or doing anything else without a screen. An
audio edition is not a lesson read aloud. Read aloud, code blocks, tables, formulas and "see the diagram
above" are unbearable, and a listener cannot scroll back. Each audio edition is a script written for the
ear, from the lesson, and voiced by the renderer (`scripts/audio/render.py`).

This guide is for whoever writes the scripts, whether a person or a model. The lesson stays the source of
truth. The script teaches the same ideas, with the same numbers and the same conclusions, and never adds a
claim the lesson does not make.

## Files

One script per lesson, mirroring the lesson's path:

    content/tracks/09-system-design/01-building-blocks/04-caching-strategies.md   (lesson)
    content/audio/09-system-design/01-building-blocks/04-caching-strategies.md    (script)

```yaml
---
lesson: caching-strategies          # the lesson's slug
source: 3f9c2a7d1e04b8c6            # first 16 hex of the lesson file's SHA-256 (scripts/audio/check.py --fix-source <script>)
fit: great                          # great | partial | screen (below)
desk:                               # what needs a screen, queued for later; may be empty
  - "The stampede simulation and the single-flight code"
  - "Exercise: simulate LRU and LFU eviction"
---
```

`episode:` (optional) names the audio file and the feed entry. It defaults to the lesson's slug, which is
only unique within a module; set it when two lessons share a slug (the checker reports the clash).

`source` makes staleness visible. When a lesson changes, its script's hash no longer matches, and
`scripts/audio/check.py` reports it until the script is reviewed against the new lesson and updated.

## Fit

- **great**: the ideas live in words (design, trade-offs, failure stories, concepts). Most of system
  design, distributed systems, databases, senior craft and the case study.
- **partial**: the core idea carries by ear, but part of the lesson needs eyes (a long trace, a
  derivation, code). Teach the idea through its invariant and a tiny example, then point to the page.
- **screen**: the lesson is mostly a step-by-step trace or an exercise. Write a short script (three to
  five minutes) that motivates the idea and says what to look at, and put the rest in `desk`.

## Body

- `## Heading` starts a chapter. The heading is not spoken; it names the chapter in the player and in
  podcast apps. Five to eight chapters, roughly following the lesson's sections. The first is
  `## Introduction` and the last is `## Recap`.
- Paragraphs are spoken in order. Keep them short: two to five sentences.
- `[pause]` on its own line is two seconds of silence. Use it after a question you want the listener to
  answer before you do ("Before I tell you: which one breaks first?"). Two or three per script.
- Nothing else is markup. No bullets, tables, bold, links, code spans, LaTeX, emoji or URLs. The checker
  rejects `` ` ``, `|`, `$`, `*`, `_`, `#` outside headings, `[` other than `[pause]`, and `http`.

## Length

1,300 to 2,200 words for *great* and *partial* (about 9 to 15 minutes at the renderer's pace), 450 to
800 for *screen*. Cover what a listener can hold; skip the rest. If the lesson has six tables of
numbers, the script carries the three numbers that change a decision.

## Writing for the ear

- **Open with the problem, not the agenda.** The lesson's opening scenario is usually the right cold
  open. Then say what is coming in one sentence: "Three ideas: where the hit ratio comes from, the race
  every write policy has, and what happens the second a hot key expires."
- **Say everything as it is spoken.** "20 milliseconds", not "20 ms". "The 99th percentile", not "p99".
  "Roughly 300", not "~300". "Five times", not "5×". Digits are fine; units, symbols and abbreviations
  are not. Spell acronyms the way people say them in speech only when the renderer's lexicon lacks them.
- **Code**: say what it does and quote at most one short line that carries the point, in words: "The
  whole trick is two lines: re-check the cache inside the load, and fill the cache before you remove the
  in-flight entry." Never read syntax, brackets or indentation.
- **Tables**: a comparison sentence per row that matters, then the takeaway. "Undefended, the expiry
  sent 489 identical queries. Single-flight: 50, one per replica. A fleet-wide lock: one."
- **Visualisations and traces**: a mental picture with the smallest example that shows the mechanism.
  Name the actors and keep at most three of them: "a reader, a writer, and the cache."
- **Formulas**: in words, once, then use it: "Database load is the miss rate times traffic."
- **Numbers**: fewer than on the page, rounded, and repeated when they matter. A listener remembers
  "95 to 99 percent cuts database load five times" and not a four-row table.
- **Signpost**: "First…", "The second race is worse…", "Here is the number to remember." Short
  recaps at the end of long chapters.
- **Interview framing**: Ascend prepares people for senior interviews. End with how this comes up in an
  interview: one or two of the lesson's follow-up questions, asked, then `[pause]`, then answered in the
  lesson's own words.
- **Recap**: three to five things to remember, then the desk list in one sentence ("At your desk: the
  stampede simulation, and the eviction exercise.").
- **Voice**: second person, direct, the lesson's tone. No "In this episode", no "Welcome back", no
  sign-off. Do not mention that this is a script or a recording.

## Pronunciation

The renderer expands common acronyms and terms through a lexicon (`scripts/audio/lexicon.json`): TTL,
LRU, LFU, CDN, WAL, Redis, Memcached, Kafka and so on. Write them normally. If a word in a new script is
mispronounced, add it to the lexicon rather than misspelling it in the script.

## Review episodes (spoken quizzes)

Each module also gets spoken quiz episodes made from its lessons' quizzes, for active recall with no
screen: `content/audio/<track>/<module>/review-1.md`, `review-2.md` and so on.

```yaml
---
review: building-blocks             # the module's directory name without its number
source: 5d0e3b9a71c2f846            # hash of the module's quiz blocks (check.py --fix-source)
---
```

- One chapter per question, titled `## Question 1` and so on, after a short `## Introduction` ("Twelve
  questions from the building-blocks module. Answer out loud before the answer comes.") and before a
  `## Recap` that names the two or three ideas the questions kept returning to.
- Pick 10 to 14 questions that work by ear, spread across the module's lessons. Skip questions whose
  point is a calculation the listener cannot follow without paper, or put the arithmetic into words
  ("about a quarter of the queries stall").
- Ask the question, then the options as "A, … B, … C, … D, …", each rephrased for the ear if needed but
  with its meaning unchanged. Then `[think]` (six seconds of silence) on its own line. Then "The answer is
  C: …", and the explanation from the quiz in spoken form, two to four sentences.
- 1,300 to 2,400 words. All other rules above apply: no symbols, say units, no markup.

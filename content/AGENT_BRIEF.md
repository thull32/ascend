# Brief for curriculum authors

You are writing curriculum for **Ascend** (repo: `/home/tristan/ascend`), a free
platform that takes working mid-level software engineers to a senior role at a
top-tier company (Netflix is the reference bar). The content is the product;
it must be deeper and more honest than GeeksforGeeks, NeetCode or a typical
blog, while staying readable on a phone during a commute.

## Read these first, completely, in order

1. `content/CONTENT_GUIDE.md` — the contract: file layout, front matter, the
   visualisation catalogue (only use listed types/algorithms), exercise and
   quiz block formats, YAML safety rules, the quality bar and voice.
2. `content/OUTLINE.md` — the full curriculum. Your assignment names the
   tracks/modules/lessons or problems you own. Use the exact slugs.
3. The exemplar lesson `content/tracks/02-data-structures/04-hashing/02-hash-tables.md`
   plus `module.md` and `track.md` beside it, and the exemplar problem
   `content/problems/two-sum.md`. Match that depth, structure and voice.

## Working rules

- Write files directly. Do not ask questions; make judgement calls and note
  them in your final report.
- Only write inside your assigned directories/files. Other authors are
  writing the rest concurrently.
- Lesson directories/files use the numeric prefixes and slugs from the
  outline: `content/tracks/<nn>-<track>/<nn>-<module>/<nn>-<lesson>.md`.
  Lesson `<nn>` is the lesson's position in the outline (01, 02, ...).
- Each lesson: 1,500–3,000 words of prose; opens with the problem; `##`
  sections; concrete worked examples with numbers; code with language tags;
  Mermaid where structure helps; at least one `viz` block in DS/algorithm/
  networking/system/concurrency/AI lessons when the catalogue covers the
  topic; 1–2 `exercise` blocks in DS/algorithm/pattern lessons; a
  `## Senior signals` section; exactly one `quiz` block (4–6 questions)
  under `## Check yourself` at the end.
- Exercises must be solvable in both Python and JavaScript with the given
  starter code, tests must be correct (compute expected values carefully;
  trace by hand), and include at least one hidden test.
- Cross-links: only link lessons that exist in the outline
  (`/learn/<track>/<module>/<lesson>`) and problems that exist in the
  outline's problem list (`/practice/<slug>`). Only put outline problem slugs
  in `problems:` front matter.
- Be technically precise. If you are not certain of a fact (a specific
  version number, a benchmark figure), phrase it as an order of magnitude or
  omit it. Never invent citations.
- Validate after each module (run from the repo root):
  `CONTENT_LENIENT=1 cargo run -q -p ascend-core --example validate_content -- ./content 2>&1 | tail -5`
  Fix any error that names YOUR files. Errors naming other authors' files
  or "unknown problem/lesson/prerequisite" warnings are expected while
  others are still writing; ignore those. (If the compile lock is busy,
  wait and retry.)
- Problems: validate each file with
  `python3 scripts/validate_problems.py content/problems/<slug>.md` and fix
  until it reports 0 errors. The Python reference solution in `## Solution`
  must pass all tests. Use the tagged `{"$list": ...}` / `{"$tree": ...}` /
  `{"$graph": ...}` forms for node arguments.

## Resource safety (mandatory)

A previous authoring run crashed the machine because a buggy reference
solution looped forever allocating memory. Therefore:

- Never run `python3` or `node` directly on ad-hoc test code. Use
  `scripts/safe_py.sh your_script.py` (2 GiB / 60 s limits) or
  `timeout 30 node ...` prefixed with `ulimit -v 2097152`.
- `scripts/validate_problems.py` already enforces limits; prefer it.
- Trace tricky solutions by hand before executing them; check loop
  termination conditions (especially resize/grow loops) explicitly.
- Run at most one validation/test process at a time.

## Environment notes

- The interactive shell may be fish. For anything beyond a one-liner, write
  a script file and run it with `bash script.sh`, or use `bash -c '...'`.
- Every visualisation `type`/`algorithm` in CONTENT_GUIDE.md is implemented in
  `web/src/viz/families/`. Open the family file if you need to know which
  input fields an algorithm accepts (see its `normalise` function and
  `examples`). Only use catalogue names.
- The loader runs in lenient mode during authoring: files with broken front
  matter are skipped with a `warning:` line naming the file. Your files must
  produce no warnings other than "unknown problem/lesson/prerequisite"
  references to content another author has not written yet.
- Before finishing, re-read each file you wrote end to end once. Files cut
  off mid-write are the most common defect.

## Final report

List the files written with approximate word counts, any outline items you
merged/renamed (and why), and anything you could not complete.

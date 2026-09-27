# Brief: rebalance quiz options

Our quizzes have a measurable flaw: in 86% of questions the correct option is
the unique longest one (it carries the nuance, the caveat, the "because").
A learner can score well by picking the longest answer. Fix this without
changing what each question tests or which answer is correct.

## Scope

Only the ```quiz blocks inside the files you are assigned. Do not edit
anything outside quiz blocks. Do not edit any file listed in
`/tmp/claude-1000/-home-tristan/9567d772-b159-418e-9397-057ca33b1c36/scratchpad/code-lessons.txt`,
`content/tracks/12-ai-assisted-engineering/02-senior-engineering-with-ai/04-the-ai-native-interview.md`,
`content/tracks/12-ai-assisted-engineering/01-tools-and-workflows/03-writing-effective-specs.md`,
or anything under `content/tracks/14-case-study-ascend/` (other agents are editing those).

## For each question

1. Read the lesson section it tests, so distractors reflect real misconceptions.
2. Make the options parallel: similar length (within roughly ±30% of each
   other), same grammatical form, similar specificity. Two good techniques:
   - give distractors the same kind of qualifier the correct answer has
     ("because…", "unless…", a number, a mechanism), but a wrong one;
   - trim the correct answer to its essential claim and move nuance into
     the explanation.
3. Every distractor must be plausible to someone who half-understood the
   lesson, and unambiguously wrong to someone who understood it. No joke
   options, no "all of the above", no "none of the above".
4. Keep `answer` pointing at the same (possibly reworded) correct option.
   Keep the explanation accurate; update it if it quotes option wording, and
   keep it explaining why the right answer is right and why the most
   tempting wrong one is wrong.
5. Keep the YAML style: `q:` and `explanation:` as `>-` block scalars,
   `options` as a flow list of double-quoted strings (escape inner quotes).

Do not worry about answer position; a script shuffles options at the end.

## Check your work

```bash
python3 scripts/quiz_stats.py --per-file <your files or directories>
```

Target: the correct answer is the unique longest option in at most 30% of
your questions (chance is about 25%). Then confirm every file still parses:

```bash
CONTENT_LENIENT=1 cargo run -q -p ascend-core --example validate_content -- ./content 2>&1 | grep -v unknown | tail -3
```

Your shell may be fish; for multi-line commands write a script and run it with
bash. Report the before/after percentage for your scope.
